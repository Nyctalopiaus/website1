export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface CameraProfile {
  brand: string;
  model: string;
  sensorType: 'Full Frame' | 'APS-C' | 'Micro Four Thirds' | 'Medium Format' | 'Smartphone' | 'Film / Other';
  primaryLens: string;
}

export type SoftwareName =
  | 'Lightroom Classic'
  | 'Lightroom CC'
  | 'Adobe Photoshop'
  | 'Capture One'
  | 'Darktable'
  | 'RawTherapee'
  | 'GIMP'
  | 'Affinity Photo'
  | 'Apple Photos / iOS'
  | 'Other / Generic RAW Editor';

export type BackgroundTheme =
  | 'golden-landscape'
  | 'camera-lens'
  | 'photo-studio'
  | 'vintage-film'
  | 'camera-optics'
  | 'natural-daylight'
  | 'gallery-white'
  | 'analog-pastel'
  | 'studio-dark';

export interface NotionSettings {
  apiKey: string;
  databaseId: string;
  autoSync?: boolean;
  lastSyncedAt?: string;
}

export interface UserProfile {
  name: string;
  experienceLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  camera: CameraProfile;
  software: SoftwareName;
  backgroundTheme: BackgroundTheme;
  aiSettings: AISettings;
  notionSettings?: NotionSettings;
  ownedGear?: string[];
  customGearNotes?: string;
}

export type ChallengeCategory =
  | 'camera_basics'
  | 'exposure_tone'
  | 'color_grading'
  | 'creative_style'
  | 'astrophotography'
  | 'hdr_panoramas'
  | 'macro_stacking'
  | 'studio_lighting'
  | 'architecture_bw';

export interface Challenge {
  id: string;
  title: string;
  category: ChallengeCategory;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  objectives: string[];
  cameraTip: string;
  softwareFocus: string;
  suggestedTools: string[];
  /**
   * Optional short tag naming any gear beyond a basic camera + kit lens +
   * editing software that this assignment genuinely requires (e.g. a
   * tripod, an ND filter, a macro lens, off-camera flash). Shown as a
   * badge on the challenge card so students can see what they need
   * before starting. Omit for assignments doable with standard gear.
   */
  gearNeeded?: string;
  /**
   * Optional step-by-step walkthrough detailing physical camera setup/shooting
   * steps and post-production software steps for learners.
   */
  steps?: {
    shooting: string[];
    editing: string[];
  };
}

export interface ExifData {
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  fNumber?: string;
  shutterSpeed?: string;
  focalLength?: string;
  dateTaken?: string;
}

export interface GradeRubricScore {
  criterion: string;
  score: number;
  feedback: string;
}

export interface SubmissionGrade {
  overallGrade: string;
  numericScore: number;
  professorSummary: string;
  rubricScores: GradeRubricScore[];
  strengths: string[];
  areasForImprovement: string[];
  softwareSpecificTips: string[];
  recommendedNextChallengeId?: string;
}

export interface StudentSubmission {
  id: string;
  challengeId: string;
  timestamp: string;
  originalImageBase64?: string;
  editedImageBase64: string;
  exif?: ExifData;
  userNotes: string;
  softwareUsed: SoftwareName;
  cameraUsed: string;
  grade?: SubmissionGrade;
}

export interface CameraBaselineRow {
  customPresetName: string; // e.g., 'C1 - Macro', 'C2 - Action', 'C3 - Tripod & Night', 'Av - General', 'M - Flash'
  purpose: string; // e.g., 'Macro & close-ups', 'Kids, dogs, wildlife'
  mode: string; // e.g., 'Av', 'Tv', 'Manual'
  startingExposure: string; // e.g., 'f/8 • ISO 100', '1/1000 • Auto ISO'
  afMode: string; // e.g., 'Servo', 'One Shot', 'AF-C'
  afArea: string; // e.g., 'Whole Area', 'Spot', 'Zone'
  subjectDetection: string; // e.g., 'Off', 'Auto', 'Animals', 'Vehicles'
  eyeDetection: string; // e.g., 'On', 'Off'
  driveMode: string; // e.g., 'High+', 'Single', '2 sec Timer'
  meteringMode: string; // e.g., 'Evaluative', 'Spot', 'Center-Weighted'
  shutterMode: string; // e.g., 'EFCS', 'Electronic', 'Mechanical'
  whiteBalance: string; // e.g., 'Auto', '5500K', 'Daylight'
  imageQuality: string; // e.g., 'RAW', 'RAW + JPEG'
  flashSettings: string; // e.g., 'E-TTL • FEC 0 • Zoom A', 'Off', 'Manual 1/16'
}

export interface ScenarioStartingPoint {
  id: string;
  subjectStyle: string; // e.g., 'Everyday Macro', 'Fast Insects', 'Night Macro (Flash)', 'Spider Webs', 'Birds'
  startWith: string; // e.g., 'C1', 'C2', 'M', 'Av'
  adjust: string; // e.g., 'f/8 • ISO 100', '1/2000-3200 • f/2.8-5.6 • Auto ISO'
  rememberTip: string; // e.g., 'Watch shutter speed; raise ISO if needed', 'Keep sensor parallel to subject'
}

export interface FieldGuide {
  cameraBrand: string;
  cameraModel: string;
  primaryLens: string;
  lastUpdated?: string;
  baselines: CameraBaselineRow[];
  startingPoints: ScenarioStartingPoint[];
}

export interface CustomMissionStep {
  title: string;
  instruction: string;
  tryValues?: string; // e.g. "-0.10 to -0.30"
  watchFor?: string;
}

export interface CustomMission {
  id: string;
  title: string;
  expeditionName: string;
  estimatedTime: string;
  difficultyStars: number;
  subjectTags: string[];
  skillsLearned: string[];
  objective: string;
  whyThisMatters: string;
  gearNeeded: string;
  cameraSetup: string;
  flashSetup: string;
  subjectConcept: string;
  steps: CustomMissionStep[];
  versionA: {
    title: string;
    description: string;
    bulletPoints: string[];
  };
  versionB: {
    title: string;
    description: string;
    bulletPoints: string[];
  };
  fieldNotes: string[];
  technicalCornerTitle: string;
  technicalCornerText: string;
  createdAt: string;
}

export type MissionStatus = 'created' | 'planned' | 'future_idea';

export interface ExpeditionMission {
  id: string;
  title: string;
  status: MissionStatus;
  isStarred?: boolean;
}

export interface Expedition {
  id: string;
  title: string;
  goal: string;
  missions: ExpeditionMission[];
}


