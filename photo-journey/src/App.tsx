import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, StudentSubmission, Challenge, ChallengeCategory, FieldGuide, CustomMission, Expedition } from './types';
import { INITIAL_CHALLENGES } from './data/challenges';
import { DEFAULT_FIELD_GUIDE } from './data/fieldGuideData';
import { INITIAL_EXPEDITIONS } from './data/expeditionsData';
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { ChallengeCard } from './components/ChallengeCard';
import { SubmissionStudio } from './components/SubmissionStudio';
import { GradeReportCard } from './components/GradeReportCard';
import { SoftwareGuideView } from './components/SoftwareGuideView';
import { ProfessorChat } from './components/ProfessorChat';
import { FieldGuideView } from './components/FieldGuideView';
import { ExpeditionsTrackerView } from './components/ExpeditionsTrackerView';
import { CustomMissionModal } from './components/CustomMissionModal';
import { CustomMissionView } from './components/CustomMissionView';
import { BackgroundOverlay } from './components/BackgroundOverlay';
import { CameraProfileModal } from './components/CameraProfileModal';
import { SoftwareSelectionModal } from './components/SoftwareSelectionModal';
import { HardwareSuppliesModal } from './components/HardwareSuppliesModal';
import { ExposureTriangleSimulator } from './components/ExposureTriangleSimulator';
import { UnlockKeyModal } from './components/UnlockKeyModal';
import { PhotoGuidelinesModal } from './components/PhotoGuidelinesModal';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { evaluateSubmissionWithAI } from './services/ai';
import { hasVault } from './utils/keyVault';
import { Sparkles, BookOpen, AlertTriangle, Filter, Layers, ChevronDown, Search, X, Lock, ShieldAlert, Plus } from 'lucide-react';



const DEFAULT_PROFILE: UserProfile = {
  name: 'Student Photographer',
  experienceLevel: 'Beginner',
  camera: {
    brand: 'Sony',
    model: 'A7IV',
    sensorType: 'Full Frame',
    primaryLens: '35mm f/1.8'
  },
  software: 'Lightroom Classic',
  backgroundTheme: 'golden-landscape',
  aiSettings: {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-3.5-flash-lite'
  }
};

export function App() {
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('pj_user_profile');
    if (!saved) return DEFAULT_PROFILE;
    const parsed = JSON.parse(saved);
    if (!parsed.backgroundTheme || parsed.backgroundTheme === 'studio-glow' || parsed.backgroundTheme === 'golden-hour-light') {
      parsed.backgroundTheme = 'golden-landscape';
    }
    return parsed;
  });

  const [submissions, setSubmissions] = useState<StudentSubmission[]>(() => {
    const saved = localStorage.getItem('pj_submissions');
    return saved ? JSON.parse(saved) : [];
  });

  const [fieldGuide, setFieldGuide] = useState<FieldGuide>(() => {
    const saved = localStorage.getItem('pj_field_guide');
    return saved ? JSON.parse(saved) : DEFAULT_FIELD_GUIDE;
  });

  const [expeditions, setExpeditions] = useState<Expedition[]>(() => {
    const saved = localStorage.getItem('pj_expeditions');
    return saved ? JSON.parse(saved) : INITIAL_EXPEDITIONS;
  });

  const [customMissions, setCustomMissions] = useState<CustomMission[]>(() => {
    const saved = localStorage.getItem('pj_custom_missions');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeCustomMission, setActiveCustomMission] = useState<CustomMission | null>(null);
  const [returnTab, setReturnTab] = useState<TabType | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    // Supports the installed PWA's launcher shortcuts (?tab=challenges / ?tab=expeditions / ?tab=field_guide / ?tab=grades)
    // so a student can jump straight into the curriculum from the home screen.
    const validTabs: TabType[] = ['challenges', 'expeditions', 'field_guide', 'studio', 'grades', 'software_guide', 'chat'];
    const requested = new URLSearchParams(window.location.search).get('tab');
    return (validTabs as string[]).includes(requested || '') ? (requested as TabType) : 'challenges';
  });

  const [selectedChallenge, setSelectedChallenge] = useState<Challenge>(INITIAL_CHALLENGES[0]);
  const [selectedReportSub, setSelectedReportSub] = useState<StudentSubmission | null>(null);
  // Modals & Simulator
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [isSoftwareModalOpen, setIsSoftwareModalOpen] = useState<boolean>(false);
  const [isGearModalOpen, setIsGearModalOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false);
  const [isCustomMissionModalOpen, setIsCustomMissionModalOpen] = useState<boolean>(false);
  const [isPhotoGuidelinesOpen, setIsPhotoGuidelinesOpen] = useState<boolean>(false);

  // Dual Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const mainContentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    localStorage.setItem('pj_field_guide', JSON.stringify(fieldGuide));
  }, [fieldGuide]);

  useEffect(() => {
    localStorage.setItem('pj_expeditions', JSON.stringify(expeditions));
  }, [expeditions]);

  useEffect(() => {
    localStorage.setItem('pj_custom_missions', JSON.stringify(customMissions));
  }, [customMissions]);


  useEffect(() => {
    // Once an encrypted key vault exists, never persist the plaintext API
    // key alongside it — the vault (src/utils/keyVault.ts) is the source
    // of truth for the key at rest, and the in-memory copy here only
    // lives for the current tab session after an Unlock.
    const toPersist: UserProfile = hasVault()
      ? { ...userProfile, aiSettings: { ...userProfile.aiSettings, apiKey: '' } }
      : userProfile;
    localStorage.setItem('pj_user_profile', JSON.stringify(toPersist));
  }, [userProfile]);

  useEffect(() => {
    try {
      localStorage.setItem('pj_submissions', JSON.stringify(submissions));
    } catch (err) {
      console.warn('Could not save submissions to localStorage:', err);
    }
  }, [submissions]);


  const handleSelectChallenge = (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setActiveTab('studio');
  };

  const handleToggleTheme = () => {
    setUserProfile(prev => ({
      ...prev,
      backgroundTheme: prev.backgroundTheme === 'studio-dark' ? 'golden-landscape' : 'studio-dark'
    }));
  };

  const handleGradeSubmission = async (newSub: StudentSubmission) => {
    setIsSubmitting(true);
    try {
      const grade = await evaluateSubmissionWithAI(userProfile, selectedChallenge, newSub);
      const gradedSubmission: StudentSubmission = {
        ...newSub,
        grade
      };

      setSubmissions(prev => [gradedSubmission, ...prev.filter(s => s.id !== newSub.id)]);
      setSelectedReportSub(gradedSubmission);
      setActiveTab('grades');
    } catch (err: any) {
      alert(`Prof. ISO Evaluation Error: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAiConfigured = Boolean(userProfile.aiSettings.apiKey || userProfile.aiSettings.provider === 'ollama');
  // A vault exists but hasn't been unlocked yet this session — the saved key is there, just not decrypted into memory.
  const isVaultLocked = hasVault() && !userProfile.aiSettings.apiKey && userProfile.aiSettings.provider !== 'ollama';
  // A key is sitting in plaintext because it was saved before the encrypted vault feature existed (or the vault was removed).
  const hasUnsecuredKey = Boolean(userProfile.aiSettings.apiKey) && !hasVault();

  // Filter helper for keyword search
  const matchesQuerySearch = (c: Challenge, q: string) => {
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.summary.toLowerCase().includes(q) ||
      c.softwareFocus.toLowerCase().includes(q) ||
      c.cameraTip.toLowerCase().includes(q) ||
      c.suggestedTools.some(t => t.toLowerCase().includes(q))
    );
  };

  // Challenges matching active Category & Search (used to compute contextual Skill Level counts)
  const categoryFilteredChallenges = INITIAL_CHALLENGES.filter(c => {
    const matchesCategory = selectedCategory === 'all' || c.category === selectedCategory;
    return matchesCategory && matchesQuerySearch(c, searchQuery.toLowerCase().trim());
  });

  // Challenges matching active Skill Level & Search (used to compute contextual Category counts)
  const levelFilteredChallenges = INITIAL_CHALLENGES.filter(c => {
    const matchesLevel = selectedLevel === 'all' || c.level === selectedLevel;
    return matchesLevel && matchesQuerySearch(c, searchQuery.toLowerCase().trim());
  });

  // Live contextual counts for Skill Level dropdown (reflecting currently selected category & search)
  const levelCounts = {
    all: categoryFilteredChallenges.length,
    Beginner: categoryFilteredChallenges.filter(c => c.level === 'Beginner').length,
    Intermediate: categoryFilteredChallenges.filter(c => c.level === 'Intermediate').length,
    Advanced: categoryFilteredChallenges.filter(c => c.level === 'Advanced').length
  };

  // Live contextual counts for Category filter pills (reflecting currently selected skill level & search)
  const categoryCounts = levelFilteredChallenges.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + 1;
    return acc;
  }, {});

  // Final filtered challenges matching Category, Skill Level, and Keyword Search
  const filteredChallenges = INITIAL_CHALLENGES.filter(c => {
    const matchesCategory = selectedCategory === 'all' || c.category === selectedCategory;
    const matchesLevel = selectedLevel === 'all' || c.level === selectedLevel;
    return matchesCategory && matchesLevel && matchesQuerySearch(c, searchQuery.toLowerCase().trim());
  });

  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  return (
    <div className={`h-screen flex flex-col overflow-hidden font-sans relative selection:bg-amber-500 selection:text-black transition-colors ${
      isLight ? 'theme-light bg-[#fdfbf7] text-slate-900' : 'theme-dark bg-zinc-950 text-zinc-100'
    }`}>
      {/* Dynamic Photography Ambient Background */}
      <BackgroundOverlay theme={userProfile.backgroundTheme || 'golden-landscape'} />

      {/* Header */}
      <Header
        userProfile={userProfile}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCameraModal={() => setIsCameraModalOpen(true)}
        onOpenSoftwareModal={() => setIsSoftwareModalOpen(true)}
        onOpenGearModal={() => setIsGearModalOpen(true)}
        onOpenPhotoGuidelines={() => setIsPhotoGuidelinesOpen(true)}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onToggleTheme={handleToggleTheme}
        gradedCount={submissions.filter(s => s.grade).length}
      />

      {/* Main Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden z-10">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          gradedCount={submissions.filter(s => s.grade).length}
          theme={userProfile.backgroundTheme}
        />

        {/* Content Area (Independently Scrollable) */}
        <main ref={mainContentRef} className="flex-1 p-4 pb-28 md:pb-4 lg:p-8 overflow-y-auto h-full">
          {/* AI Engine Locked Banner — a saved, encrypted key exists but hasn't been unlocked this session */}
          {isVaultLocked && (
            <div className={`mb-6 border-l-4 border-amber-500 p-4 rounded-r-2xl flex items-center justify-between gap-4 shadow-xl backdrop-blur-xl ${
              isLight ? 'bg-amber-500/10 border-amber-500 text-slate-900' : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent'
            }`}>
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">AI Engine Locked</h4>
                  <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                    Your API key is saved and encrypted on this device. Unlock it with your PIN to let Prof. ISO grade your photo edits.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUnlockModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-4 py-2 rounded-xl shrink-0 shadow-md transition-all"
              >
                Unlock
              </button>
            </div>
          )}

          {/* AI Unconfigured Alert Banner */}
          {!isAiConfigured && !isVaultLocked && (
            <div className={`mb-6 border-l-4 border-amber-500 p-4 rounded-r-2xl flex items-center justify-between gap-4 shadow-xl backdrop-blur-xl ${
              isLight ? 'bg-amber-500/10 border-amber-500 text-slate-900' : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent'
            }`}>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">AI Engine Connection Required</h4>
                  <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                    Connect your free Google Gemini API key, OpenAI key, or local Ollama to allow Prof. ISO to grade your photo edits.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-4 py-2 rounded-xl shrink-0 shadow-md transition-all"
              >
                Connect Engine
              </button>
            </div>
          )}

          {/* Nudge to encrypt a legacy plaintext key saved before this feature existed */}
          {hasUnsecuredKey && (
            <div className={`mb-6 border-l-4 border-sky-500 p-4 rounded-r-2xl flex items-center justify-between gap-4 shadow-xl backdrop-blur-xl ${
              isLight ? 'bg-sky-500/10 border-sky-500 text-slate-900' : 'bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent'
            }`}>
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-sky-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Secure Your API Key</h4>
                  <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
                    Your key is currently stored in plain text on this device. Open Settings and set a PIN to encrypt it.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold px-4 py-2 rounded-xl shrink-0 shadow-md transition-all"
              >
                Secure It
              </button>
            </div>
          )}

          {/* TAB 1: CHALLENGES CATALOG */}
          {activeTab === 'challenges' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {activeCustomMission ? (
                <CustomMissionView
                  mission={activeCustomMission}
                  isLight={isLight}
                  userProfile={userProfile}
                  onClose={() => {
                    setActiveCustomMission(null);
                    if (returnTab) {
                      setActiveTab(returnTab);
                      setReturnTab(null);
                    }
                  }}
                />
              ) : (
                <>
                  {/* Filter Header Box */}
                  <div className={`p-6 rounded-3xl backdrop-blur-xl shadow-xl border space-y-4 ${
                    isLight ? 'bg-white/85 border-amber-100/90' : 'bg-zinc-900/80 border-zinc-800'
                  }`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="font-serif-title text-2xl font-bold flex items-center gap-2">
                          <BookOpen className="w-6 h-6 text-amber-500" />
                          Photography & Editing Curriculum
                        </h2>
                        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                          Explore {INITIAL_CHALLENGES.length} structured art school assignments tailored to your {userProfile.camera.brand} {userProfile.camera.model} & {userProfile.software} setup.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <button
                          onClick={() => setIsCustomMissionModalOpen(true)}
                          className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-4 py-2 rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Create AI Mission</span>
                        </button>

                        {/* Search Input Bar */}
                        <div className="relative flex-1 sm:w-64">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search assignments, tools, RAW..."
                            className={`w-full pl-9 pr-8 py-1.5 rounded-xl text-xs border outline-none focus:border-amber-500 font-medium transition-all ${
                              isLight
                                ? 'bg-white text-slate-900 border-slate-200 placeholder:text-slate-400'
                                : 'bg-zinc-950 text-zinc-100 border-zinc-800 placeholder:text-zinc-600'
                            }`}
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border shrink-0 ${
                          isLight
                            ? 'bg-amber-100 text-amber-950 border-amber-300'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}>
                          {filteredChallenges.length} / {INITIAL_CHALLENGES.length}
                        </span>
                      </div>
                    </div>

                    {/* Filter Controls Row */}
                    <div className="pt-3 border-t border-slate-200/60 flex flex-col lg:flex-row items-start lg:items-start justify-between gap-4">
                      {/* Topic Filter */}
                      <div className="space-y-2 flex-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-amber-500" /> Topic Category ({INITIAL_CHALLENGES.length}):
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[
                            { id: 'all', label: 'All Topics' },
                            { id: 'camera_basics', label: '📷 Camera Basics' },
                            { id: 'exposure_tone', label: '🌓 Exposure & Tone' },
                            { id: 'color_grading', label: '🎨 Color Grading' },
                            { id: 'creative_style', label: '🎞️ Creative Style' },
                            { id: 'astrophotography', label: '🌌 Astrophotography' },
                            { id: 'hdr_panoramas', label: '🏔️ HDR & Panoramas' },
                            { id: 'macro_stacking', label: '🔬 Macro & Stacking' },
                            { id: 'studio_lighting', label: '💡 Studio & Flash' },
                            { id: 'architecture_bw', label: '🏛️ Architecture & B&W' }
                          ].map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat.id)}
                              className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                                selectedCategory === cat.id
                                  ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                                  : isLight
                                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                                    : 'bg-zinc-950/80 text-zinc-300 hover:text-white border border-zinc-800'
                              }`}
                            >
                              {cat.label}{cat.id !== 'all' ? ` (${categoryCounts[cat.id] || 0})` : ` (${levelFilteredChallenges.length})`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Skill Level Dropdown Filter */}
                      <div className="space-y-1.5 w-full md:w-auto">
                        <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                          <Filter className="w-3 h-3 text-amber-500" /> Skill Level:
                        </label>
                        <div className="relative">
                          <select
                            value={selectedLevel}
                            onChange={(e) => setSelectedLevel(e.target.value)}
                            className={`w-full md:w-52 appearance-none pl-3.5 pr-9 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all border outline-none focus:border-amber-500 shadow-sm ${
                              isLight
                                ? 'bg-white text-slate-800 border-slate-300 hover:border-amber-400'
                                : 'bg-zinc-950 text-zinc-200 border-zinc-700 hover:border-zinc-600'
                            }`}
                          >
                            <option value="all">🌟 All Skill Levels ({levelCounts.all})</option>
                            <option value="Beginner">🟢 Beginner Level ({levelCounts.Beginner})</option>
                            <option value="Intermediate">🟡 Intermediate Level ({levelCounts.Intermediate})</option>
                            <option value="Advanced">🔴 Advanced Level ({levelCounts.Advanced})</option>
                          </select>
                          <ChevronDown className="w-4 h-4 text-amber-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Custom AI Missions Section (if any exist) */}
                  {customMissions.length > 0 && (
                    <div className="space-y-3">
                      <h3 className={`font-serif-title font-bold text-lg flex items-center gap-2 ${
                        isLight ? 'text-amber-800' : 'text-amber-400'
                      }`}>
                        <Sparkles className="w-5 h-5" /> Your Custom AI Missions ({customMissions.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {customMissions.map((cm) => (
                          <div
                            key={cm.id}
                            onClick={() => {
                              setReturnTab('challenges');
                              setActiveCustomMission(cm);
                            }}
                            className={`p-5 rounded-2xl border transition-all cursor-pointer hover:border-amber-500 shadow-lg ${
                              isLight ? 'bg-amber-50/90 border-amber-200/80 text-slate-900' : 'bg-studio-900 border-studio-800 text-white'
                            }`}
                          >
                            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                              isLight ? 'text-amber-800' : 'text-amber-400'
                            }`}>
                              {cm.expeditionName}
                            </span>
                            <h4 className="font-bold text-base font-serif-title">{cm.title}</h4>
                            <p className="text-xs text-slate-600 dark:text-studio-300 line-clamp-2 mt-1">{cm.objective}</p>
                            <div className={`flex items-center justify-between mt-4 pt-3 border-t text-[11px] font-bold ${
                              isLight ? 'border-amber-200/80 text-amber-800' : 'border-studio-800 text-amber-400'
                            }`}>
                              <span>View Detailed Mission Plan →</span>
                              <span>{cm.estimatedTime}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Challenge Grid */}
                  {filteredChallenges.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 bg-white/80 rounded-3xl border border-slate-200">
                      <p className="text-sm font-semibold">No assignments match your selected topic and skill level filters.</p>
                      <button
                        onClick={() => { setSelectedCategory('all'); setSelectedLevel('all'); }}
                        className="mt-3 text-xs bg-amber-500 text-black font-bold px-4 py-2 rounded-xl"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredChallenges.map((challenge) => {
                        const existingSub = submissions.find(s => s.challengeId === challenge.id && s.grade);
                        return (
                          <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            userSoftware={userProfile.software}
                            onSelect={handleSelectChallenge}
                            isCompleted={Boolean(existingSub)}
                            score={existingSub?.grade?.numericScore}
                            theme={userProfile.backgroundTheme}
                            onOpenSimulator={() => setIsSimulatorOpen(true)}
                            onAskProfessor={(ch) => {
                              setSelectedChallenge(ch);
                              setActiveTab('chat');
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: EXPEDITION PLANS CURRICULUM */}
          {activeTab === 'expeditions' && (
            <ExpeditionsTrackerView
              userProfile={userProfile}
              expeditions={expeditions}
              customMissions={customMissions}
              onSelectMission={(mission) => {
                setReturnTab('expeditions');
                setActiveCustomMission(mission);
                setActiveTab('challenges');
              }}
              onMissionCreated={(newMission) => {
                setCustomMissions(prev => [newMission, ...prev]);
                setReturnTab('expeditions');
                setActiveCustomMission(newMission);
                setActiveTab('challenges');
              }}
              isLight={isLight}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {/* TAB 3: FIELD GUIDE & CAMERA BASELINES */}
          {activeTab === 'field_guide' && (
            <FieldGuideView
              userProfile={userProfile}
              fieldGuide={fieldGuide}
              onUpdateFieldGuide={setFieldGuide}
              isLight={isLight}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}


          {/* TAB 3: SUBMISSION STUDIO */}
          {activeTab === 'studio' && (
            <SubmissionStudio
              challenge={selectedChallenge}
              userProfile={userProfile}
              onSubmit={handleGradeSubmission}
              isSubmitting={isSubmitting}
              onOpenSimulator={() => setIsSimulatorOpen(true)}
              onAskProfessor={(ch) => {
                setSelectedChallenge(ch);
                setActiveTab('chat');
              }}
              onOpenPhotoGuidelines={() => setIsPhotoGuidelinesOpen(true)}
            />
          )}

          {/* TAB 4: GRADES & REPORT CARDS */}
          {activeTab === 'grades' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {submissions.length === 0 ? (
                <div className={`rounded-3xl p-12 text-center space-y-4 backdrop-blur-xl shadow-xl border ${
                  isLight ? 'bg-white/85 border-amber-100' : 'bg-zinc-900/80 border-zinc-800'
                }`}>
                  <Sparkles className="w-12 h-12 text-amber-500 mx-auto opacity-50" />
                  <h3 className="font-serif-title text-xl font-bold">No Graded Submissions Yet</h3>
                  <p className={`text-xs max-w-md mx-auto leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                    Complete your first assignment challenge in the Studio to earn an official Art School report card and grade from Prof. ISO.
                  </p>
                  <button
                    onClick={() => setActiveTab('challenges')}
                    className="bg-amber-500 text-black font-bold text-xs px-6 py-3 rounded-xl hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    Browse Challenges Catalog
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Selector list of past submissions */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {submissions.map((sub, idx) => {
                      const ch = INITIAL_CHALLENGES.find(c => c.id === sub.challengeId);
                      const isSelected = (selectedReportSub?.id === sub.id) || (idx === 0 && !selectedReportSub);
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedReportSub(sub)}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-xs text-left shrink-0 transition-all ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500 text-amber-600 font-bold shadow-md'
                              : isLight
                                ? 'bg-white border-amber-100 text-slate-700 hover:border-amber-200'
                                : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-xl font-serif font-bold text-amber-500 flex items-center justify-center border ${
                            isLight ? 'bg-amber-50 border-amber-200' : 'bg-zinc-950 border-zinc-800'
                          }`}>
                            {sub.grade?.overallGrade || 'A'}
                          </span>
                          <div>
                            <div className="font-semibold">{ch?.title || 'Challenge'}</div>
                            <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>{new Date(sub.timestamp).toLocaleDateString()}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Report Card */}
                  {selectedReportSub && (
                    <GradeReportCard
                      submission={selectedReportSub}
                      challenge={INITIAL_CHALLENGES.find(c => c.id === selectedReportSub.challengeId) || selectedChallenge}
                      isLight={isLight}
                      recommendedChallenge={
                        selectedReportSub.grade?.recommendedNextChallengeId
                          ? INITIAL_CHALLENGES.find(
                              c =>
                                c.id === selectedReportSub.grade!.recommendedNextChallengeId &&
                                c.id !== selectedReportSub.challengeId
                            )
                          : undefined
                      }
                      onSelectNextChallenge={handleSelectChallenge}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SOFTWARE TOOL LOOKUP */}
          {activeTab === 'software_guide' && (
            <SoftwareGuideView
              currentSoftware={userProfile.software}
              onSelectSoftware={(sw) => setUserProfile({ ...userProfile, software: sw })}
              isLight={isLight}
            />
          )}

          {/* TAB 6: ASK PROF. ISO CHAT */}
          {activeTab === 'chat' && (
            <ProfessorChat userProfile={userProfile} currentChallenge={selectedChallenge} />
          )}

          {/* Floating Return to Top Button */}
          <ScrollToTopButton
            containerRef={mainContentRef}
            isLight={isLight}
            maxWidthClass={['challenges', 'expeditions', 'field_guide'].includes(activeTab) ? 'max-w-6xl' : 'max-w-4xl'}
          />
        </main>
      </div>

      {/* Studio Atmosphere & AI Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          userProfile={userProfile}
          onSave={setUserProfile}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Dedicated Camera Hardware Profile Modal */}
      {isCameraModalOpen && (
        <CameraProfileModal
          userProfile={userProfile}
          onSave={setUserProfile}
          onClose={() => setIsCameraModalOpen(false)}
        />
      )}

      {/* Dedicated Editing Software Selection Modal */}
      {isSoftwareModalOpen && (
        <SoftwareSelectionModal
          userProfile={userProfile}
          onSave={setUserProfile}
          onClose={() => setIsSoftwareModalOpen(false)}
        />
      )}

      {/* Hardware & Supplies Modal */}
      {isGearModalOpen && (
        <HardwareSuppliesModal
          userProfile={userProfile}
          challenges={INITIAL_CHALLENGES}
          customMissions={customMissions}
          onSave={setUserProfile}
          onClose={() => setIsGearModalOpen(false)}
        />
      )}

      {/* Interactive Exposure Triangle Simulator Modal */}
      <ExposureTriangleSimulator
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        isLight={isLight}
      />

      {/* Custom AI Mission Modal */}
      <CustomMissionModal
        userProfile={userProfile}
        isOpen={isCustomMissionModalOpen}
        onClose={() => setIsCustomMissionModalOpen(false)}
        onMissionCreated={(newMission) => {
          setCustomMissions(prev => [newMission, ...prev]);
          setReturnTab(activeTab);
          setActiveCustomMission(newMission);
          setActiveTab('challenges');
        }}
        isLight={isLight}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Encrypted API Key Unlock Modal */}
      {isUnlockModalOpen && (
        <UnlockKeyModal
          isLight={isLight}
          onClose={() => setIsUnlockModalOpen(false)}
          onUnlock={(apiKey) => {
            setUserProfile(prev => ({
              ...prev,
              aiSettings: { ...prev.aiSettings, apiKey }
            }));
            setIsUnlockModalOpen(false);
          }}
        />
      )}

      {/* Photo Rules & Guidelines Modal */}
      <PhotoGuidelinesModal
        isOpen={isPhotoGuidelinesOpen}
        onClose={() => setIsPhotoGuidelinesOpen(false)}
        userProfile={userProfile}
      />
    </div>
  );
}

