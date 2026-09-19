import React, { useState } from 'react';
import { Challenge, SoftwareName, BackgroundTheme } from '../types';
import { getChallengeSteps } from '../data/challenges';
import { CheckCircle, Camera, Sliders, ChevronRight, Sparkles, Package, BookOpen, ChevronDown, ChevronUp, Gauge, MessageSquare } from 'lucide-react';

interface ChallengeCardProps {
  challenge: Challenge;
  userSoftware: SoftwareName;
  onSelect: (challenge: Challenge) => void;
  isCompleted?: boolean;
  score?: number;
  theme?: BackgroundTheme;
  onOpenSimulator?: () => void;
  onAskProfessor?: (challenge: Challenge) => void;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({
  challenge,
  userSoftware,
  onSelect,
  isCompleted,
  score,
  theme = 'natural-daylight',
  onOpenSimulator,
  onAskProfessor
}) => {
  const isLight = theme !== 'studio-dark';
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'shooting' | 'editing'>('shooting');

  const steps = getChallengeSteps(challenge, userSoftware);

  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case 'Beginner':
        return isLight
          ? 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold'
          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
      case 'Intermediate':
        return isLight
          ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
          : 'bg-amber-500/20 text-amber-200 border-amber-500/40 font-bold';
      case 'Advanced':
        return isLight
          ? 'bg-rose-100 text-rose-950 border-rose-300 font-bold'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
      default:
        return 'bg-zinc-800 text-zinc-300';
    }
  };

  return (
    <div className={`rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl border studio-card-glow backdrop-blur-xl ${
      isLight
        ? 'bg-white/85 border-amber-100/80 hover:border-amber-400 text-slate-900 shadow-xl shadow-amber-900/5'
        : 'bg-zinc-900/90 border-zinc-800 hover:border-amber-500/50 text-zinc-100 shadow-2xl'
    }`}>
      <div>
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border ${getLevelBadgeColor(challenge.level)}`}>
            {challenge.level}
          </span>
          {isCompleted && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-300">
              <CheckCircle className="w-3.5 h-3.5" />
              Mastered ({score}/100)
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className={`font-serif-title text-xl font-bold transition-colors mb-2 leading-snug ${
          isLight ? 'text-slate-900 group-hover:text-amber-600' : 'text-white group-hover:text-amber-400'
        }`}>
          {challenge.title}
        </h3>

        {/* Summary */}
        <p className={`text-sm leading-relaxed mb-4 ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
          {challenge.summary}
        </p>

        {challenge.gearNeeded && (
          <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide mb-4 px-3 py-1.5 rounded-full border w-fit ${
            isLight
              ? 'bg-sky-50 border-sky-200 text-sky-700'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
          }`}>
            <Package className="w-3 h-3 shrink-0" />
            <span className="truncate normal-case tracking-normal font-semibold">Gear needed: {challenge.gearNeeded}</span>
          </div>
        )}

        {/* Objectives */}
        <div className={`space-y-2 mb-4 p-3.5 rounded-2xl border ${
          isLight ? 'bg-amber-50/60 border-amber-100' : 'bg-zinc-950/80 border-zinc-800/90'
        }`}>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest block mb-1 ${
            isLight ? 'text-slate-500' : 'text-zinc-500'
          }`}>
            Assignment Objectives
          </span>
          {challenge.objectives.map((obj, idx) => (
            <div key={idx} className={`flex items-start gap-2 text-sm leading-normal ${
              isLight ? 'text-slate-700' : 'text-zinc-300'
            }`}>
              <span className="text-amber-500 font-bold shrink-0">•</span>
              <span>{obj}</span>
            </div>
          ))}
        </div>

        {/* Expandable How-To Accordion */}
        <div className="mb-4">
          <button
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className={`w-full flex items-center justify-between p-3 rounded-2xl border text-xs font-bold transition-all ${
              isGuideOpen
                ? (isLight ? 'bg-amber-100/70 border-amber-300 text-amber-950' : 'bg-amber-500/20 border-amber-500/40 text-amber-300')
                : (isLight ? 'bg-slate-100/80 hover:bg-amber-50/80 border-slate-200/80 text-slate-700' : 'bg-zinc-950/60 hover:bg-zinc-800 border-zinc-800 text-zinc-300')
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500" />
              <span>Step-by-Step "How To" Guide</span>
            </div>
            {isGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isGuideOpen && (
            <div className={`mt-2 p-3.5 rounded-2xl border space-y-3 transition-all ${
              isLight ? 'bg-amber-50/40 border-amber-200/80' : 'bg-zinc-950 border-zinc-800'
            }`}>
              {/* Sub-tabs: Shooting vs Editing */}
              <div className="flex border-b border-amber-500/20 gap-2 pb-2">
                <button
                  onClick={() => setActiveGuideTab('shooting')}
                  className={`flex items-center gap-1.5 text-xs font-bold pb-1 border-b-2 transition-colors ${
                    activeGuideTab === 'shooting'
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>1. Shooting (In Field)</span>
                </button>
                <button
                  onClick={() => setActiveGuideTab('editing')}
                  className={`flex items-center gap-1.5 text-xs font-bold pb-1 border-b-2 transition-colors ${
                    activeGuideTab === 'editing'
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>2. Editing ({userSoftware})</span>
                </button>
              </div>

              {/* Steps List */}
              <div className="space-y-2.5">
                {(activeGuideTab === 'shooting' ? steps.shooting : steps.editing).map((stepText, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>
                      {stepText}
                    </span>
                  </div>
                ))}
              </div>

              {/* Quick Actions inside Guide */}
              <div className="pt-2 flex flex-wrap gap-2 border-t border-amber-500/20">
                {onOpenSimulator && (
                  <button
                    onClick={onOpenSimulator}
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                      isLight
                        ? 'bg-amber-100/60 hover:bg-amber-200/80 border-amber-300 text-amber-900'
                        : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5 text-amber-500" />
                    <span>Practice in Simulator</span>
                  </button>
                )}
                {onAskProfessor && (
                  <button
                    onClick={() => onAskProfessor(challenge)}
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                      isLight
                        ? 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-800'
                        : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
                    <span>Ask Professor ISO</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Gear & Software Highlights */}
        <div className="space-y-2 mb-6">
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
            isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
          }`}>
            <Camera className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate"><strong>Camera Tip:</strong> {challenge.cameraTip}</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
            isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-zinc-950 border-zinc-800 text-zinc-400'
          }`}>
            <Sliders className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate"><strong>Focus in {userSoftware}:</strong> {challenge.softwareFocus}</span>
          </div>
        </div>
      </div>

      {/* Submit Action Button */}
      <button
        onClick={() => onSelect(challenge)}
        className={`w-full font-bold text-xs py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 border shadow-md ${
          isLight
            ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400 shadow-amber-500/10'
            : 'bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-200 border-zinc-700'
        }`}
      >
        <Sparkles className="w-4 h-4 text-black" />
        <span>{isCompleted ? 'Resubmit for Professor Critique' : 'Start Assignment in Studio'}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

