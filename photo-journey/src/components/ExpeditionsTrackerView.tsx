import React, { useState } from 'react';
import { UserProfile, Expedition, ExpeditionMission, CustomMission } from '../types';
import { generateCustomMissionWithAI } from '../services/ai';
import { Compass, Sparkles, CheckSquare, Square, Lightbulb, Star, Loader2, ArrowRight, BookOpen } from 'lucide-react';

interface ExpeditionsTrackerViewProps {
  userProfile: UserProfile;
  expeditions: Expedition[];
  customMissions: CustomMission[];
  onSelectMission: (mission: CustomMission) => void;
  onMissionCreated: (mission: CustomMission) => void;
  isLight: boolean;
  onOpenSettings: () => void;
}

export const ExpeditionsTrackerView: React.FC<ExpeditionsTrackerViewProps> = ({
  userProfile,
  expeditions,
  customMissions,
  onSelectMission,
  onMissionCreated,
  isLight,
  onOpenSettings
}) => {
  const [generatingMissionId, setGeneratingMissionId] = useState<string | null>(null);

  const isAiConfigured = Boolean(userProfile.aiSettings.apiKey || userProfile.aiSettings.provider === 'ollama');

  const handleGenerateMissionForTitle = async (expeditionTitle: string, missionTitle: string, missionId: string) => {
    if (!isAiConfigured) {
      onOpenSettings();
      return;
    }

    setGeneratingMissionId(missionId);
    try {
      const prompt = `Expedition: ${expeditionTitle}. Mission Title: "${missionTitle}". Create a complete, detailed step-by-step mission for this assignment.`;
      const generated = await generateCustomMissionWithAI(userProfile, prompt);
      generated.title = missionTitle;
      generated.expeditionName = expeditionTitle;
      onMissionCreated(generated);
    } catch (err: any) {
      alert(`AI Mission Generation Error: ${err.message || err}`);
    } finally {
      setGeneratingMissionId(null);
    }
  };

  const cardClass = isLight ? 'bg-white/90 border-amber-100/90 text-slate-900 shadow-xl' : 'bg-studio-900/90 border-studio-800 text-studio-100 shadow-2xl';

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className={`p-6 rounded-3xl backdrop-blur-xl border space-y-4 ${cardClass}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-lg shadow-amber-500/20 shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-serif-title text-2xl font-bold flex items-center gap-2">
                Expedition Plans Curriculum
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-studio-400'}`}>
                Long-term curriculum tracking completed missions, planned missions, and future ideas across every expedition.
              </p>
            </div>
          </div>
        </div>

        {/* Legend Box matching PDF 1 */}
        <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
          isLight ? 'bg-amber-50/60 border-amber-200/80' : 'bg-studio-950/60 border-studio-800'
        }`}>
          <span className="font-bold text-amber-500 uppercase tracking-wider block text-[10px]">Legend</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✅</span>
              <div>
                <span className="font-bold block">Created</span>
                <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-studio-400'}`}>
                  Mission creation is complete & available in database.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">⬜</span>
              <div>
                <span className="font-bold block">Planned</span>
                <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-studio-400'}`}>
                  Identified mission — click to generate full AI guide.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <span className="text-amber-400 font-bold">💡</span>
              <div>
                <span className="font-bold block">Future Idea</span>
                <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-studio-400'}`}>
                  Brainstorm inspiration for a future expedition.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expeditions List */}
      <div className="space-y-6">
        {expeditions.map((exp) => (
          <div
            key={exp.id}
            className={`p-6 rounded-3xl backdrop-blur-xl border space-y-4 ${cardClass}`}
          >
            <div>
              <h3 className={`font-serif-title font-bold text-xl flex items-center gap-2 ${
                isLight ? 'text-amber-800' : 'text-amber-400'
              }`}>
                <BookOpen className="w-5 h-5" /> {exp.title}
              </h3>
              <div className="mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Mission Goal</span>
                <p className={`text-xs mt-0.5 leading-relaxed ${isLight ? 'text-slate-700' : 'text-studio-200'}`}>
                  {exp.goal}
                </p>
              </div>
            </div>

            {/* Missions List */}
            <div className="space-y-2 pt-2 border-t border-slate-200/50 dark:border-studio-800">
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                isLight ? 'text-amber-800' : 'text-amber-400'
              }`}>Missions:</span>
              <ul className="space-y-2">
                {exp.missions.map((m) => {
                  const existingCustomMission = customMissions.find(
                    cm => cm.title.toLowerCase() === m.title.toLowerCase() || cm.expeditionName.toLowerCase() === exp.title.toLowerCase()
                  );
                  const isGeneratingThis = generatingMissionId === m.id;

                  return (
                    <li
                      key={m.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs transition-colors ${
                        isLight ? 'bg-slate-50/70 hover:bg-amber-50/50 border-slate-200/70' : 'bg-studio-950/70 hover:bg-studio-800/50 border-studio-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">
                          {m.status === 'created' || existingCustomMission ? '✅' : m.status === 'planned' ? '⬜' : '💡'}
                        </span>
                        <span className={`font-semibold ${
                          m.status === 'created' || existingCustomMission ? (isLight ? 'text-amber-800' : 'text-amber-400') : ''
                        }`}>
                          {m.title} {m.isStarred && '⭐'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        {existingCustomMission ? (
                          <button
                            onClick={() => onSelectMission(existingCustomMission)}
                            className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm"
                          >
                            <span>Open Guide</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGenerateMissionForTitle(exp.title, m.title, m.id)}
                            disabled={isGeneratingThis}
                            className={`text-[11px] px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
                              m.status === 'planned'
                                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border-amber-500/30'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-studio-800 dark:hover:bg-studio-700 text-slate-700 dark:text-studio-200 border-slate-200 dark:border-studio-700'
                            }`}
                          >
                            {isGeneratingThis ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <span>Generate AI Guide</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
