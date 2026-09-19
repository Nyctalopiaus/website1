import React, { useState } from 'react';
import { UserProfile, FieldGuide, ScenarioStartingPoint, CameraBaselineRow } from '../types';
import { generateFieldGuideWithAI } from '../services/ai';
import { Sparkles, Camera, Compass, Printer, RefreshCw, Plus, Trash2, Search, SlidersHorizontal, BookOpen, AlertCircle, Check } from 'lucide-react';

interface FieldGuideViewProps {
  userProfile: UserProfile;
  fieldGuide: FieldGuide;
  onUpdateFieldGuide: (updated: FieldGuide) => void;
  isLight: boolean;
  onOpenSettings: () => void;
}

export const FieldGuideView: React.FC<FieldGuideViewProps> = ({
  userProfile,
  fieldGuide,
  onUpdateFieldGuide,
  isLight,
  onOpenSettings
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'starting_points' | 'baselines'>('starting_points');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingPoint, setEditingPoint] = useState<ScenarioStartingPoint | null>(null);
  const [showAddPointModal, setShowAddPointModal] = useState<boolean>(false);
  const [isPrintMode, setIsPrintMode] = useState<boolean>(false);

  const isAiConfigured = Boolean(userProfile.aiSettings.apiKey || userProfile.aiSettings.provider === 'ollama');

  const handleGenerateAI = async () => {
    if (!isAiConfigured) {
      onOpenSettings();
      return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateFieldGuideWithAI(userProfile);
      onUpdateFieldGuide(generated);
    } catch (err: any) {
      alert(`AI Field Guide Generation Error: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredStartingPoints = fieldGuide.startingPoints.filter(sp => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      sp.subjectStyle.toLowerCase().includes(q) ||
      sp.startWith.toLowerCase().includes(q) ||
      sp.adjust.toLowerCase().includes(q) ||
      sp.rememberTip.toLowerCase().includes(q)
    );
  });

  const cardClass = isLight ? 'bg-white/90 border-amber-100/90 text-slate-900 shadow-xl' : 'bg-studio-900/90 border-studio-800 text-studio-100 shadow-2xl';
  const tableHeaderClass = isLight ? 'bg-amber-500/10 text-slate-900 border-amber-200/80' : 'bg-studio-950 text-amber-400 border-studio-800';
  const tableRowHoverClass = isLight ? 'hover:bg-amber-50/50' : 'hover:bg-studio-800/50';

  if (isPrintMode) {
    return (
      <div className="p-8 max-w-4xl mx-auto bg-white text-black font-sans space-y-6 print:p-0">
        <div className="flex items-center justify-between border-b border-slate-300 pb-4">
          <div>
            <h1 className="text-2xl font-bold font-serif-title">🎒 Field Guide & Camera Cheat Sheet</h1>
            <p className="text-xs text-slate-600">
              {userProfile.camera.brand} {userProfile.camera.model} • {userProfile.camera.primaryLens || 'Standard Lens'} • Last Updated: {new Date(fieldGuide.lastUpdated || Date.now()).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => setIsPrintMode(false)}
            className="no-print bg-slate-900 text-white text-xs px-4 py-2 rounded-xl font-bold"
          >
            ← Back to App
          </button>
        </div>

        {/* Print Starting Points */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold font-serif-title text-amber-600 border-b border-amber-200 pb-1">📷 Camera Starting Points</h2>
          <table className="w-full text-xs text-left border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                <th className="p-2 border-r border-slate-300">Subject / Style</th>
                <th className="p-2 border-r border-slate-300">Start With</th>
                <th className="p-2 border-r border-slate-300">Adjust</th>
                <th className="p-2">Remember Tip</th>
              </tr>
            </thead>
            <tbody>
              {fieldGuide.startingPoints.map((sp, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="p-2 font-semibold border-r border-slate-200">{sp.subjectStyle}</td>
                  <td className="p-2 border-r border-slate-200 font-bold text-amber-700">{sp.startWith}</td>
                  <td className="p-2 border-r border-slate-200 font-mono text-[11px]">{sp.adjust}</td>
                  <td className="p-2 text-slate-700">{sp.rememberTip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Print Camera Baselines */}
        <section className="space-y-3 pt-4">
          <h2 className="text-lg font-bold font-serif-title text-amber-600 border-b border-amber-200 pb-1">📷 Camera Baselines (Custom Modes)</h2>
          <table className="w-full text-[10px] text-left border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                <th className="p-1.5 border-r border-slate-300">Preset</th>
                <th className="p-1.5 border-r border-slate-300">Purpose</th>
                <th className="p-1.5 border-r border-slate-300">Mode</th>
                <th className="p-1.5 border-r border-slate-300">Exposure</th>
                <th className="p-1.5 border-r border-slate-300">AF & Area</th>
                <th className="p-1.5 border-r border-slate-300">Drive</th>
                <th className="p-1.5">Flash</th>
              </tr>
            </thead>
            <tbody>
              {fieldGuide.baselines.map((b, idx) => (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="p-1.5 font-bold border-r border-slate-200 text-amber-700">{b.customPresetName}</td>
                  <td className="p-1.5 border-r border-slate-200">{b.purpose}</td>
                  <td className="p-1.5 border-r border-slate-200 font-semibold">{b.mode}</td>
                  <td className="p-1.5 border-r border-slate-200 font-mono">{b.startingExposure}</td>
                  <td className="p-1.5 border-r border-slate-200">{b.afMode} ({b.afArea})</td>
                  <td className="p-1.5 border-r border-slate-200">{b.driveMode}</td>
                  <td className="p-1.5 text-slate-700">{b.flashSettings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className={`p-6 rounded-3xl backdrop-blur-xl border space-y-4 ${cardClass}`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-lg shadow-amber-500/20 shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-serif-title text-2xl font-bold flex items-center gap-2">
                Field Guide & Camera Cheat Sheet
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-studio-400'}`}>
                Hardware baselines & quick scenario starting points tailored to your <span className="font-bold text-amber-500">{userProfile.camera.brand} {userProfile.camera.model}</span> ({userProfile.camera.primaryLens || 'Standard Lens'}).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="flex-1 md:flex-initial bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Generating for Camera...' : 'Auto-Populate with AI'}</span>
            </button>

            <button
              onClick={() => setIsPrintMode(true)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                isLight ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800' : 'bg-studio-800 hover:bg-studio-700 border-studio-700 text-white'
              }`}
            >
              <Printer className="w-4 h-4 text-amber-500" />
              <span>Print Cheat Sheet</span>
            </button>
          </div>
        </div>

        {/* Sub-Tabs Selector Bar */}
        <div className="pt-3 border-t border-slate-200/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setActiveSubTab('starting_points')}
              className={`flex-1 sm:flex-initial text-xs px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'starting_points'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : isLight
                    ? 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    : 'bg-studio-950 text-studio-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Camera Starting Points ({fieldGuide.startingPoints.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('baselines')}
              className={`flex-1 sm:flex-initial text-xs px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'baselines'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : isLight
                    ? 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    : 'bg-studio-950 text-studio-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Camera Baselines ({fieldGuide.baselines.length})</span>
            </button>
          </div>

          {activeSubTab === 'starting_points' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter scenarios (macro, insects, birds)..."
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border outline-none focus:border-amber-500 ${
                  isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-studio-950 border-studio-800 text-white'
                }`}
              />
            </div>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: CAMERA STARTING POINTS MATRIX */}
      {activeSubTab === 'starting_points' && (
        <div className={`rounded-3xl border overflow-hidden backdrop-blur-xl ${cardClass}`}>
          <div className="p-4 border-b border-slate-200/50 flex items-center justify-between">
            <h3 className="font-serif-title font-bold text-lg flex items-center gap-2">
              📷 Camera Starting Points
            </h3>
            <span className="text-xs text-amber-500 font-medium">Quick reference for common shooting scenarios</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className={`font-bold border-b ${tableHeaderClass}`}>
                <tr>
                  <th className="p-3.5">Subject / Style</th>
                  <th className="p-3.5">Start With</th>
                  <th className="p-3.5">⚙ Adjust</th>
                  <th className="p-3.5">💡 Remember</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/40">
                {filteredStartingPoints.map((sp) => (
                  <tr key={sp.id} className={`transition-colors ${tableRowHoverClass}`}>
                    <td className="p-3.5 font-bold flex items-center gap-2">
                      <span>{sp.subjectStyle}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 font-extrabold border border-amber-500/30">
                        {sp.startWith}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] font-semibold text-slate-700 dark:text-studio-200">
                      {sp.adjust}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-studio-300">
                      {sp.rememberTip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CAMERA BASELINES MATRIX */}
      {activeSubTab === 'baselines' && (
        <div className={`rounded-3xl border overflow-hidden backdrop-blur-xl ${cardClass}`}>
          <div className="p-4 border-b border-slate-200/50 flex items-center justify-between">
            <div>
              <h3 className="font-serif-title font-bold text-lg flex items-center gap-2">
                📷 Camera Baselines (Custom Mode Presets)
              </h3>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-studio-400'}`}>
                Hardware control settings for custom dials (C1, C2, C3, Av, M) on your {userProfile.camera.brand} {userProfile.camera.model}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className={`font-bold border-b ${tableHeaderClass}`}>
                <tr>
                  <th className="p-3.5 shrink-0">Setting</th>
                  {fieldGuide.baselines.map((b, idx) => (
                    <th key={idx} className="p-3.5 font-extrabold text-amber-500 min-w-[160px]">
                      {b.customPresetName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/40">
                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Purpose</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3 font-medium text-slate-700 dark:text-studio-200">{b.purpose}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Mode</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3 font-bold text-amber-600">{b.mode}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Starting Exposure</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3 font-mono text-[11px]">{b.startingExposure}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">AF Mode</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.afMode}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">AF Area</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.afArea}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Subject Detection</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.subjectDetection}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Eye Detection</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.eyeDetection}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Drive Mode</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.driveMode}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Metering Mode</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.meteringMode}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Shutter Mode</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.shutterMode}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">White Balance</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3">{b.whiteBalance}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Image Quality</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3 font-bold">{b.imageQuality}</td>
                  ))}
                </tr>

                <tr className={tableRowHoverClass}>
                  <td className="p-3 font-bold bg-slate-50/50 dark:bg-studio-950/50">Flash Settings</td>
                  {fieldGuide.baselines.map((b, idx) => (
                    <td key={idx} className="p-3 font-mono text-[11px]">{b.flashSettings}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
