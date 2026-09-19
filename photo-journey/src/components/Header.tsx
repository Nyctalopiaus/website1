import React from 'react';
import { Camera, Sliders, Settings, Award, Sparkles, Sun, Moon, Gauge, Package, FileImage } from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  userProfile: UserProfile;
  onOpenSettings: () => void;
  onOpenCameraModal?: () => void;
  onOpenSoftwareModal?: () => void;
  onOpenGearModal?: () => void;
  onOpenPhotoGuidelines?: () => void;
  onOpenSimulator?: () => void;
  onToggleTheme?: () => void;
  gradedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  userProfile,
  onOpenSettings,
  onOpenCameraModal,
  onOpenSoftwareModal,
  onOpenGearModal,
  onOpenPhotoGuidelines,
  onOpenSimulator,
  onToggleTheme,
  gradedCount
}) => {
  const isAiConfigured = Boolean(userProfile.aiSettings.apiKey || userProfile.aiSettings.provider === 'ollama');
  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  const ownedGearCount = userProfile.ownedGear?.length || 0;

  const getProviderLabel = (prov: string) => {
    switch (prov) {
      case 'gemini': return 'Google Gemini';
      case 'openai': return 'OpenAI GPT-4o';
      case 'anthropic': return 'Claude 3.5/3.7';
      case 'openrouter': return 'OpenRouter';
      case 'ollama': return 'Local Ollama';
      default: return prov;
    }
  };

  return (
    <header className={`backdrop-blur-xl border-b sticky top-0 z-30 px-4 lg:px-8 py-3.5 flex items-center justify-between shadow-sm transition-colors ${
      isLight ? 'bg-white/85 border-amber-200/60 text-slate-900' : 'bg-zinc-950/80 border-zinc-800 text-white'
    }`}>
      {/* Brand Logo & Tagline */}
      <div className="flex items-center gap-3.5">
        <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 p-2.5 rounded-2xl shadow-md shadow-amber-500/20 border border-amber-400/30 flex items-center justify-center">
          <Camera className="w-5 h-5 text-black stroke-[2.5]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif-title text-xl font-bold tracking-wide">
              Photo Journey
            </h1>
            <span className={`text-[10px] font-sans font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
              isLight
                ? 'bg-amber-100 text-amber-950 border-amber-300'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}>
              Art School Studio
            </span>
          </div>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'} hidden sm:block`}>
            Master Camera & Editing Skills with AI Prof. ISO
          </p>
        </div>
      </div>

      {/* Center Separate Gear & Software & Hardware & Photo Specs Pills */}
      <div className="hidden md:flex items-center gap-2">
        {/* Camera Hardware Pill */}
        <button
          onClick={onOpenCameraModal}
          title="Configure Camera Hardware Specs"
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-sm group ${
            isLight
              ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-slate-800'
              : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
          }`}
        >
          <Camera className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          <span>{userProfile.camera.brand} {userProfile.camera.model}</span>
        </button>

        {/* Software Selection Pill */}
        <button
          onClick={onOpenSoftwareModal}
          title="Configure Primary Photo Editing Software"
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-sm group ${
            isLight
              ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-slate-800'
              : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          <span>{userProfile.software}</span>
        </button>

        {/* Supplies & Hardware Gear Pill */}
        <button
          onClick={onOpenGearModal}
          title="Configure Expedition Supplies & Hardware Requirements"
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-sm group ${
            isLight
              ? 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-slate-800'
              : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 text-zinc-200'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          <span>Supplies & Gear {ownedGearCount > 0 ? `(${ownedGearCount})` : ''}</span>
        </button>

        {/* Photo Rules & Guidelines Pill */}
        <button
          onClick={onOpenPhotoGuidelines}
          title="View Photo Specs, File Size Limits & RAW Format Guidelines"
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all shadow-sm group ${
            isLight
              ? 'bg-amber-100/70 hover:bg-amber-200/80 border-amber-300 text-amber-950'
              : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
          }`}
        >
          <FileImage className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
          <span>Photo Rules & Specs</span>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Exposure Simulator Button */}
        {onOpenSimulator && (
          <button
            onClick={onOpenSimulator}
            title="Open Exposure Triangle Simulator Sandbox"
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isLight ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 border-amber-500/30' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-amber-500/40'
            }`}
          >
            <Gauge className="w-4 h-4 text-amber-500" />
            <span>Exposure Simulator</span>
          </button>
        )}

        {/* Darkroom / Daylight Mode Toggle */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={isLight ? 'Switch to Darkroom Studio Mode' : 'Switch to Daylight Studio Mode'}
            className={`p-2 rounded-xl border transition-all ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-amber-400'
            }`}
          >
            {isLight ? <Moon className="w-4 h-4 text-indigo-500" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        )}

        {/* Graded Counter */}
        <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border ${
          isLight ? 'bg-amber-50/80 border-amber-200/80 text-slate-700' : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'
        }`}>
          <Award className="w-4 h-4 text-amber-500" />
          <span>Grades: <strong className="font-mono">{gradedCount}</strong></span>
        </div>

        {/* AI Provider Status Button */}
        <button
          onClick={onOpenSettings}
          title="Configure AI Engine Connection & Studio Atmosphere"
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
            isAiConfigured
              ? isLight
                ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-sm'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
              : 'bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-lg shadow-amber-500/20 border border-amber-400'
          }`}
        >
          {isAiConfigured ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden md:inline">{getProviderLabel(userProfile.aiSettings.provider)}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 animate-spin text-black" />
              <span>Connect AI Engine</span>
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
