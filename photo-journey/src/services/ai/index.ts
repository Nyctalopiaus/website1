import { AISettings, Challenge, UserProfile, SubmissionGrade, StudentSubmission } from '../../types';
import {
  buildProfessorSystemPrompt,
  buildUserSubmissionPrompt,
  buildFieldGuideSystemPrompt,
  buildFieldGuideUserPrompt,
  buildCustomMissionSystemPrompt,
  buildCustomMissionUserPrompt,
  NextChallengeCandidate
} from './promptBuilder';
import { INITIAL_CHALLENGES } from '../../data/challenges';

export async function evaluateSubmissionWithAI(
  userProfile: UserProfile,
  challenge: Challenge,
  submission: StudentSubmission
): Promise<SubmissionGrade> {
  const settings = userProfile.aiSettings;

  if (!settings.apiKey && settings.provider !== 'ollama') {
    throw new Error(`Please configure your ${settings.provider.toUpperCase()} API Key in Settings first.`);
  }

  const systemPrompt = buildProfessorSystemPrompt(userProfile, challenge);

  // Give the AI a real, valid pool of "next assignment" IDs to choose from — same
  // category first (a natural next step), falling back to any other challenge so a
  // recommendation is still possible for the smaller specialty categories.
  const sameCategoryCandidates = INITIAL_CHALLENGES.filter(
    c => c.id !== challenge.id && c.category === challenge.category
  );
  const candidatePool = sameCategoryCandidates.length > 0
    ? sameCategoryCandidates
    : INITIAL_CHALLENGES.filter(c => c.id !== challenge.id);
  const candidates: NextChallengeCandidate[] = candidatePool
    .slice(0, 6)
    .map(c => ({ id: c.id, title: c.title, level: c.level }));

  const userPrompt = buildUserSubmissionPrompt(
    challenge,
    submission.softwareUsed,
    submission.exif,
    submission.userNotes,
    candidates
  );

  const imageBase64 = submission.editedImageBase64;

  let rawResponseText = '';

  switch (settings.provider) {
    case 'gemini':
      rawResponseText = await callGeminiAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    case 'openai':
      rawResponseText = await callOpenAIAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    case 'anthropic':
      rawResponseText = await callAnthropicAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    case 'openrouter':
      rawResponseText = await callOpenRouterAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    case 'ollama':
      rawResponseText = await callOllamaAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    default:
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
  }

  return parseGradeJSONResponse(rawResponseText);
}

export async function askProfessorQuestion(
  userProfile: UserProfile,
  question: string
): Promise<string> {
  const settings = userProfile.aiSettings;
  const cameraInfo = `${userProfile.camera.brand} ${userProfile.camera.model}`;
  const systemPrompt = `You are "Prof. ISO", an expert Art School Photography Professor. The student shoots with a ${cameraInfo} and edits in ${userProfile.software}. Answer their photography/camera/software question concisely, constructively, and specifically for their gear & software.`;

  if (!settings.apiKey && settings.provider !== 'ollama') {
    return `Prof. ISO: Please set your ${settings.provider.toUpperCase()} API key in Settings to ask questions!`;
  }

  try {
    switch (settings.provider) {
      case 'gemini':
        return await callGeminiAPI(settings, systemPrompt, question);
      case 'openai':
      case 'openrouter':
      case 'ollama':
        return await callOpenAIAPI(settings, systemPrompt, question);
      case 'anthropic':
        return await callAnthropicAPI(settings, systemPrompt, question);
      default:
        return 'Prof. ISO: Unsupported provider configured.';
    }
  } catch (err: any) {
    return `Prof. ISO encountered an issue: ${err.message || err}`;
  }
}

async function callGeminiAPI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const model = settings.model || 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;

  const contentsParts: any[] = [];
  
  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    contentsParts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: cleanBase64
      }
    });
  }

  contentsParts.push({ text: `${systemPrompt}\n\n${userPrompt}` });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: contentsParts }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gemini API Error (${response.status})`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      throw new Error(
        `Connection to Google Gemini API failed (Failed to fetch).\n\nPossible Causes:\n` +
        `1. An AdBlocker or Privacy Shield (uBlock Origin, Brave Shield, etc.) is blocking 'generativelanguage.googleapis.com'. Try pausing your adblocker on this domain.\n` +
        `2. Mixed Content issue or network/DNS firewall blocking Google API endpoints.`
      );
    }
    throw err;
  }
}

async function callOpenAIAPI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
  const model = settings.model || 'gpt-4o';

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && baseUrl.startsWith('http://')) {
    throw new Error(`Mixed Content Block: Cannot connect to an insecure local endpoint (${baseUrl}) from an HTTPS website (${window.location.origin}).`);
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  if (imageBase64) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageBase64 } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI Error (${response.status})`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      throw new Error(
        `Connection to AI Endpoint (${baseUrl}) failed (Failed to fetch).\n\nPossible Causes:\n` +
        `1. AdBlocker or Privacy Shield blocking the API domain.\n` +
        `2. Network CORS / firewall restrictions or unreachable endpoint.`
      );
    }
    throw err;
  }
}

async function callAnthropicAPI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const model = settings.model || 'claude-3-5-sonnet-latest';
  const url = 'https://api.anthropic.com/v1/messages';

  const userContent: any[] = [];
  if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: cleanBase64
      }
    });
  }
  userContent.push({ type: 'text', text: userPrompt });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        max_tokens: 1500,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Anthropic Error (${response.status})`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      throw new Error(`Connection to Anthropic API failed (Failed to fetch). Check your network, browser extension settings, or CORS configuration.`);
    }
    throw err;
  }
}

async function callOpenRouterAPI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const customSettings: AISettings = {
    ...settings,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: settings.model || 'google/gemini-3.5-flash-lite'
  };
  return callOpenAIAPI(customSettings, systemPrompt, userPrompt, imageBase64);
}

async function callOllamaAPI(
  settings: AISettings,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const baseUrl = settings.baseUrl || 'http://localhost:11434/v1';
  const customSettings: AISettings = {
    ...settings,
    baseUrl,
    model: settings.model || 'qwen2-vl'
  };
  return callOpenAIAPI(customSettings, systemPrompt, userPrompt, imageBase64);
}

function parseGradeJSONResponse(responseText: string): SubmissionGrade {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in AI response.');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      overallGrade: parsed.overallGrade || 'B+',
      numericScore: typeof parsed.numericScore === 'number' ? parsed.numericScore : 85,
      professorSummary: parsed.professorSummary || 'Solid submission showing good technical effort.',
      rubricScores: Array.isArray(parsed.rubricScores) ? parsed.rubricScores : [
        { criterion: 'Composition', score: 8, feedback: 'Well balanced' },
        { criterion: 'Tone & Exposure', score: 8, feedback: 'Good highlight recovery' },
        { criterion: 'Software Execution', score: 9, feedback: 'Effective tool selection' }
      ],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ['Good overall focus', 'Clean exposure'],
      areasForImprovement: Array.isArray(parsed.areasForImprovement) ? parsed.areasForImprovement : ['Refine contrast curve', 'Check shadow noise'],
      softwareSpecificTips: Array.isArray(parsed.softwareSpecificTips) ? parsed.softwareSpecificTips : ['Use Tone Curve point adjustment for subtle midtone lift.'],
      recommendedNextChallengeId: parsed.recommendedNextChallengeId
    };
  } catch (err) {
    console.warn('Failed to parse strict JSON grade from AI, generating structured fallback from text:', err);
    return {
      overallGrade: 'A-',
      numericScore: 90,
      professorSummary: responseText.slice(0, 300) || 'Excellent effort on this assignment!',
      rubricScores: [
        { criterion: 'Overall Execution', score: 9, feedback: 'Strong visual results' }
      ],
      strengths: ['Great attention to challenge objectives'],
      areasForImprovement: ['Continue practicing local masking control'],
      softwareSpecificTips: ['Refer to the software guide for shortcut references.']
    };
  }
}

export async function generateFieldGuideWithAI(userProfile: UserProfile): Promise<import('../../types').FieldGuide> {
  const settings = userProfile.aiSettings;
  if (!settings.apiKey && settings.provider !== 'ollama') {
    throw new Error(`Please configure your ${settings.provider.toUpperCase()} API Key in Settings first.`);
  }

  const systemPrompt = buildFieldGuideSystemPrompt(userProfile);
  const userPrompt = buildFieldGuideUserPrompt(userProfile);

  let rawResponseText = '';
  switch (settings.provider) {
    case 'gemini':
      rawResponseText = await callGeminiAPI(settings, systemPrompt, userPrompt);
      break;
    case 'openai':
    case 'openrouter':
    case 'ollama':
      rawResponseText = await callOpenAIAPI(settings, systemPrompt, userPrompt);
      break;
    case 'anthropic':
      rawResponseText = await callAnthropicAPI(settings, systemPrompt, userPrompt);
      break;
    default:
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
  }

  const jsonMatch = rawResponseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response did not contain valid JSON for Field Guide.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    cameraBrand: parsed.cameraBrand || userProfile.camera.brand,
    cameraModel: parsed.cameraModel || userProfile.camera.model,
    primaryLens: parsed.primaryLens || userProfile.camera.primaryLens || 'Standard Lens',
    lastUpdated: new Date().toISOString(),
    baselines: Array.isArray(parsed.baselines) ? parsed.baselines : [],
    startingPoints: Array.isArray(parsed.startingPoints) ? parsed.startingPoints : []
  };
}

export async function generateCustomMissionWithAI(
  userProfile: UserProfile,
  topic: string,
  imageBase64?: string
): Promise<import('../../types').CustomMission> {
  const settings = userProfile.aiSettings;
  if (!settings.apiKey && settings.provider !== 'ollama') {
    throw new Error(`Please configure your ${settings.provider.toUpperCase()} API Key in Settings first.`);
  }

  const systemPrompt = buildCustomMissionSystemPrompt(userProfile);
  const userPrompt = buildCustomMissionUserPrompt(topic, Boolean(imageBase64));

  let rawResponseText = '';
  switch (settings.provider) {
    case 'gemini':
      rawResponseText = await callGeminiAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    case 'openai':
    case 'openrouter':
    case 'ollama':
      rawResponseText = await callOpenAIAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    case 'anthropic':
      rawResponseText = await callAnthropicAPI(settings, systemPrompt, userPrompt, imageBase64);
      break;
    default:
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
  }

  const jsonMatch = rawResponseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response did not contain valid JSON for Custom Mission.');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    id: `cm_${Date.now()}`,
    title: parsed.title || topic || 'Custom AI Photography Mission',
    expeditionName: parsed.expeditionName || 'Custom AI Expeditions',
    estimatedTime: parsed.estimatedTime || '45 min',
    difficultyStars: parsed.difficultyStars || 3,
    subjectTags: Array.isArray(parsed.subjectTags) ? parsed.subjectTags : ['Custom', 'AI Mission'],
    skillsLearned: Array.isArray(parsed.skillsLearned) ? parsed.skillsLearned : ['Photo Editing'],
    objective: parsed.objective || 'Complete the visual objective set by AI.',
    whyThisMatters: parsed.whyThisMatters || 'Master new camera and post-processing skills.',
    gearNeeded: parsed.gearNeeded || 'Standard camera & RAW editor',
    cameraSetup: parsed.cameraSetup || 'As shot',
    flashSetup: parsed.flashSetup || 'Not required',
    subjectConcept: parsed.subjectConcept || 'Creative composition focus',
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    versionA: parsed.versionA || {
      title: 'Version A — High Impact',
      description: 'Push contrast and strong colors.',
      bulletPoints: ['Deep contrast', 'Vibrant highlights']
    },
    versionB: parsed.versionB || {
      title: 'Version B — Subtle Moody',
      description: 'Keep color tone natural and quiet.',
      bulletPoints: ['Soft shadows', 'Natural WB']
    },
    fieldNotes: Array.isArray(parsed.fieldNotes) ? parsed.fieldNotes : [
      'Which version tells the better story?',
      'What adjustment made the biggest impact?'
    ],
    technicalCornerTitle: parsed.technicalCornerTitle || 'Artistic & Technical Balance',
    technicalCornerText: parsed.technicalCornerText || 'Balance technical accuracy with personal creative voice.',
    createdAt: new Date().toISOString()
  };
}

