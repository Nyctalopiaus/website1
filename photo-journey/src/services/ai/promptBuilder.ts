import { Challenge, UserProfile, ExifData, SoftwareName } from '../../types';
import { SOFTWARE_GUIDES } from '../../data/softwareGuide';

export function buildProfessorSystemPrompt(userProfile: UserProfile, challenge: Challenge): string {
  const softwareName = userProfile.software || 'Lightroom Classic';
  const softwareGuide = SOFTWARE_GUIDES[softwareName] || SOFTWARE_GUIDES['Other / Generic RAW Editor'];
  const cameraInfo = `${userProfile.camera.brand} ${userProfile.camera.model} (${userProfile.camera.sensorType || 'Full Frame'})`;

  return `You are "Prof. ISO", a distinguished, encouraging, and highly technical Art School Photography & Editing Professor.
Your mission is to train the student in both camera usage and photo editing.

STUDENT PROFILE:
- Experience Level: ${userProfile.experienceLevel}
- Camera: ${cameraInfo}
- Primary Lens: ${userProfile.camera.primaryLens || 'Standard Zoom Lens'}
- Photo Editing Software: ${softwareName}

SOFTWARE CONTEXT:
- Software Overview: ${softwareGuide.description}
- Tone Curve Path: ${softwareGuide.toneCurvePath}
- Masking Method: ${softwareGuide.maskingMethod}
- Color Grading Method: ${softwareGuide.colorGradingMethod}
- Sharpening Method: ${softwareGuide.sharpeningMethod}
- Key Software Pro Tip: ${softwareGuide.proTip}

CURRENT ASSIGNMENT:
- Title: ${challenge.title}
- Level: ${challenge.level}
- Objectives: ${challenge.objectives.join('; ')}
- Software Focus: ${challenge.softwareFocus}

INSTRUCTIONS FOR CRITIQUE & GRADING:
1. Examine the submitted photograph(s) carefully as a visual art critique.
2. Evaluate their exposure, composition, tone curve balance, color harmony, contrast, and software execution.
3. Tailor ALL action steps specifically to their software (${softwareName}). Mention actual sliders, menu paths, or shortcuts (e.g. "${softwareGuide.keyShortcuts.map(s => `${s.action}: ${s.key}`).join(', ')}").
4. Provide constructive feedback in an authentic academic art school tone (inspiring, insightful, precise, non-generic).
5. Always return a strict JSON response adhering to the requested schema.`;
}

export interface NextChallengeCandidate {
  id: string;
  title: string;
  level: string;
}

export function buildUserSubmissionPrompt(
  challenge: Challenge,
  softwareUsed: SoftwareName,
  exif?: ExifData,
  userNotes?: string,
  candidates: NextChallengeCandidate[] = []
): string {
  let exifString = 'No EXIF metadata embedded in upload.';
  if (exif && (exif.cameraModel || exif.iso || exif.fNumber || exif.shutterSpeed)) {
    exifString = `Camera: ${exif.cameraMake || ''} ${exif.cameraModel || 'Unknown'}, ISO: ${exif.iso || 'N/A'}, Aperture: ${exif.fNumber || 'N/A'}, Shutter Speed: ${exif.shutterSpeed || 'N/A'}`;
  }

  const candidateList = candidates.length > 0
    ? candidates.map(c => `- ${c.id}: "${c.title}" (${c.level})`).join('\n')
    : 'No related next assignments are available — omit the recommendedNextChallengeId field entirely.';

  return `Professor ISO, here is my submission for the assignment "${challenge.title}".

STUDENT SUBMISSION DETAILS:
- Editing Software Used: ${softwareUsed}
- EXIF Metadata: ${exifString}
- Student Notes on Edits Made: "${userNotes || 'No notes provided.'}"

POSSIBLE NEXT ASSIGNMENTS (pick the single best next step for this student based on their performance here, or omit the field if none genuinely fit):
${candidateList}

Please grade my submission and provide feedback in the following valid JSON format:
{
  "overallGrade": "A" | "A-" | "B+" | "B" | "C+" | "C" | "Needs Revision",
  "numericScore": 88, // 0 to 100
  "professorSummary": "2-3 sentences of overall professor evaluation.",
  "rubricScores": [
    { "criterion": "Composition & Framing", "score": 9, "feedback": "Brief comment" },
    { "criterion": "Exposure & Tone Curve", "score": 8, "feedback": "Brief comment" },
    { "criterion": "Color Balance & Mood", "score": 9, "feedback": "Brief comment" },
    { "criterion": "Software Tool Execution", "score": 8, "feedback": "Brief comment" }
  ],
  "strengths": [
    "Specific strength 1",
    "Specific strength 2"
  ],
  "areasForImprovement": [
    "Specific actionable critique 1",
    "Specific actionable critique 2"
  ],
  "softwareSpecificTips": [
    "Step-by-step guidance referencing specific sliders or menus in ${softwareUsed}"
  ],
  "recommendedNextChallengeId": "exact id string copied from the POSSIBLE NEXT ASSIGNMENTS list above, or omit this field if none fit"
}`;
}

export function buildFieldGuideSystemPrompt(userProfile: UserProfile): string {
  const cameraInfo = `${userProfile.camera.brand} ${userProfile.camera.model} (${userProfile.camera.sensorType || 'Full Frame'})`;
  return `You are a master photography hardware expert and camera tech guide author.
Your goal is to generate a comprehensive, hardware-accurate Field Cheat Sheet and Custom Mode Baseline table for the student's exact camera:
- Camera: ${cameraInfo}
- Primary Lens: ${userProfile.camera.primaryLens || 'Standard Lens'}
- Experience Level: ${userProfile.experienceLevel}

CRITICAL RULES:
1. Use EXACT terminology for this camera brand (${userProfile.camera.brand}). For example:
   - Canon: C1/C2/C3 custom modes, Servo AF, One Shot, EFCS, E-TTL II, Whole Area AF
   - Sony: Memory Recall 1/2/3 (MR1, MR2), AF-C, AF-S, Tracking Spot, Real-time Eye AF, ADI/P-TTL
   - Nikon: Custom Settings U1/U2/U3, AF-C, AF-S, 3D Tracking, i-TTL
   - Fujifilm: C1-C7 Custom Settings, AF-C, AF-S, Zone AF, Eye Detection
2. Provide realistic, battle-tested starting points for common scenarios (Everyday Macro, Fast Insects, Night Flash Macro, Focus Stacking, Sports, Birds, Baja Racing, etc.).
3. Always return strict JSON adhering to the requested schema.`;
}

export function buildFieldGuideUserPrompt(userProfile: UserProfile): string {
  return `Please generate a field cheat sheet JSON for the ${userProfile.camera.brand} ${userProfile.camera.model} with the following JSON schema:
{
  "cameraBrand": "${userProfile.camera.brand}",
  "cameraModel": "${userProfile.camera.model}",
  "primaryLens": "${userProfile.camera.primaryLens || 'Standard Lens'}",
  "baselines": [
    {
      "customPresetName": "C1 - Macro (or MR1/U1 depending on brand)",
      "purpose": "Macro & close-ups",
      "mode": "Av",
      "startingExposure": "f/8 • ISO 100",
      "afMode": "Servo / AF-C",
      "afArea": "Whole Area",
      "subjectDetection": "Off",
      "eyeDetection": "Off",
      "driveMode": "High",
      "meteringMode": "Evaluative",
      "shutterMode": "EFCS",
      "whiteBalance": "Auto",
      "imageQuality": "RAW",
      "flashSettings": "E-TTL / TTL • FEC 0 • Zoom A"
    },
    ... (generate 5 key baseline presets: Macro, Action/Sports, Tripod/Night, General Walkaround, Flash Controlled)
  ],
  "startingPoints": [
    {
      "id": "sp_1",
      "subjectStyle": "Everyday Macro",
      "startWith": "C1",
      "adjust": "f/8 • ISO 100",
      "rememberTip": "Watch shutter speed; raise ISO if needed."
    },
    ... (generate 12-15 diverse scenario starting points: Everyday Macro, Dreamy Isolation, Fast Insects, Close-ups, Detailed Macro, Night Macro Flash, Spider Webs, Mushrooms, Focus Stacking, Kids Action, Baseball, Dogs Running, Birds, Motorsports)
  ]
}`;
}

export function buildCustomMissionSystemPrompt(userProfile: UserProfile): string {
  const softwareName = userProfile.software || 'Lightroom Classic';
  const cameraInfo = `${userProfile.camera.brand} ${userProfile.camera.model}`;
  const ownedGearStr = userProfile.ownedGear && userProfile.ownedGear.length > 0
    ? `Student owns additional gear: ${userProfile.ownedGear.join(', ')}.`
    : '';
  const customNotesStr = userProfile.customGearNotes ? `Custom gear notes: "${userProfile.customGearNotes}".` : '';

  return `You are "Prof. ISO", an expert Art School Photography Professor creating a custom, high-detail Photography Expedition Mission.
The student shoots with a ${cameraInfo} and edits in ${softwareName}. ${ownedGearStr} ${customNotesStr}

Your mission must be exceptionally detailed, structured, inspiring, and step-by-step — matching professional curriculum plans (like Art School Expedition Plans).
Always return a strict JSON response.`;
}

export function buildCustomMissionUserPrompt(topic: string, hasImage: boolean): string {
  return `Create a highly structured photography mission based on this request: "${topic}".
${hasImage ? 'An unedited photo has been provided. Create a custom step-by-step edit/shooting plan specifically tailored to this image.' : ''}

Respond with strict JSON adhering to this exact format:
{
  "title": "Mission Title",
  "expeditionName": "Expedition Name (e.g. From Capture to Art, The Small World, The Language of Light)",
  "estimatedTime": "45 min",
  "difficultyStars": 3,
  "subjectTags": ["Night Photography", "Night Sky", "Portrait"],
  "skillsLearned": ["Color Grading", "Dodge and Burn", "Masking", "Noise Reduction"],
  "objective": "Clear description of the visual objective and artistic intent.",
  "whyThisMatters": "Rationale behind the assignment and what concept is being mastered.",
  "gearNeeded": "Gear requirements or 'Not needed — editing mission.'",
  "cameraSetup": "Camera settings or 'Not needed — photo already captured.'",
  "flashSetup": "Flash settings or 'Not needed.'",
  "subjectConcept": "Narrative focus of the image.",
  "steps": [
    {
      "title": "1. Crop First",
      "instruction": "Before editing anything, experiment with composition.",
      "tryValues": "Original framing vs slight crop from bottom",
      "watchFor": "Keep plenty of negative space around the person."
    },
    {
      "title": "2. Build Base Edit",
      "instruction": "Create a balanced starting point for the whole image.",
      "tryValues": "Exposure -0.20, Highlights -40, Shadows +25, Whites +10, Blacks -20",
      "watchFor": "Stop before large areas begin clipping."
    }
    // Provide 6 to 9 detailed steps
  ],
  "versionA": {
    "title": "Version A — Fire & Ice",
    "description": "Push complementary colors.",
    "bulletPoints": ["Deep blue sky", "Warm orange subject", "Cooler shadows", "Stronger contrast"]
  },
  "versionB": {
    "title": "Version B — Alone Under the Stars",
    "description": "Natural quiet tone.",
    "bulletPoints": ["Reduce orange saturation", "Darken foreground", "Keep sky natural"]
  },
  "fieldNotes": [
    "Which version won — Version A or Version B?",
    "What adjustment made the biggest difference?",
    "Did I push the colors too far at any point?"
  ],
  "technicalCornerTitle": "Warm vs. Cool Color Contrast",
  "technicalCornerText": "Deep-dive explanation of the underlying photography theory."
}`;
}

