import React, { useState } from 'react';
import { SOFTWARE_GUIDES } from '../data/softwareGuide';
import { SoftwareName } from '../types';
import { Sliders, Keyboard, Lightbulb, Compass, HelpCircle } from 'lucide-react';

interface SoftwareGuideViewProps {
  currentSoftware: SoftwareName;
  onSelectSoftware: (sw: SoftwareName) => void;
  isLight?: boolean;
}

export const SoftwareGuideView: React.FC<SoftwareGuideViewProps> = ({
  currentSoftware,
  onSelectSoftware,
  isLight = true
}) => {
  const [selectedSw, setSelectedSw] = useState<SoftwareName>(currentSoftware);
  const guide = SOFTWARE_GUIDES[selectedSw] || SOFTWARE_GUIDES['Other / Generic RAW Editor'];

  const softwareOptions = Object.keys(SOFTWARE_GUIDES) as SoftwareName[];

  const cardClass = isLight ? 'bg-white/85 border-amber-100/80' : 'bg-studio-900 border-studio-800';
  const innerWellClass = isLight ? 'bg-slate-50 border-slate-200' : 'bg-studio-950 border-studio-800';
  const headingClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-studio-400';
  const bodyClass = isLight ? 'text-slate-700' : 'text-studio-300';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Selector Header */}
      <div className={`rounded-2xl p-6 shadow-xl border backdrop-blur-xl transition-colors ${cardClass}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className={`font-serif-title text-2xl font-bold flex items-center gap-2 ${headingClass}`}>
              <Sliders className="w-6 h-6 text-amber-500" />
              Software Tool & Shortcut Guide
            </h2>
            <p className={`text-xs ${mutedClass}`}>
              Lookup tool locations, masking paths, and shortcuts for photo editing applications.
            </p>
          </div>

          <div>
            <label htmlFor="software-guide-select" className="sr-only">Select software to look up</label>
            <select
              id="software-guide-select"
              value={selectedSw}
              onChange={(e) => {
                const sw = e.target.value as SoftwareName;
                setSelectedSw(sw);
                onSelectSoftware(sw);
              }}
              className={`font-bold text-xs rounded-xl px-4 py-2.5 border focus:outline-none ${
                isLight ? 'bg-white border-amber-400/60 text-amber-600' : 'bg-studio-950 border-amber-500/50 text-amber-400'
              }`}
            >
              {softwareOptions.map((sw) => (
                <option key={sw} value={sw}>{sw}</option>
              ))}
            </select>
          </div>
        </div>

        <p className={`text-xs leading-relaxed p-4 rounded-xl border ${bodyClass} ${innerWellClass}`}>
          {guide.description}
        </p>
      </div>

      {/* Feature Paths & Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`rounded-2xl p-6 shadow-xl border backdrop-blur-xl space-y-4 transition-colors ${cardClass}`}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
            <Compass className="w-4 h-4" /> Feature Locations & Menu Paths
          </h3>

          <div className="space-y-3 text-xs">
            <div className={`p-3.5 rounded-xl border space-y-1 ${innerWellClass}`}>
              <span className={`font-bold block ${headingClass}`}>Tone Curve Location</span>
              <p className={`font-mono ${bodyClass}`}>{guide.toneCurvePath}</p>
            </div>

            <div className={`p-3.5 rounded-xl border space-y-1 ${innerWellClass}`}>
              <span className={`font-bold block ${headingClass}`}>Masking & Local Adjustments</span>
              <p className={`font-mono ${bodyClass}`}>{guide.maskingMethod}</p>
            </div>

            <div className={`p-3.5 rounded-xl border space-y-1 ${innerWellClass}`}>
              <span className={`font-bold block ${headingClass}`}>Color Grading & HSL</span>
              <p className={`font-mono ${bodyClass}`}>{guide.colorGradingMethod}</p>
            </div>

            <div className={`p-3.5 rounded-xl border space-y-1 ${innerWellClass}`}>
              <span className={`font-bold block ${headingClass}`}>Sharpening & Masking</span>
              <p className={`font-mono ${bodyClass}`}>{guide.sharpeningMethod}</p>
            </div>
          </div>
        </div>

        {/* Shortcuts & Pro Tip */}
        <div className="space-y-6">
          <div className={`rounded-2xl p-6 shadow-xl border backdrop-blur-xl space-y-4 transition-colors ${cardClass}`}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <Keyboard className="w-4 h-4" /> Key Shortcuts
            </h3>
            <div className="space-y-2">
              {guide.keyShortcuts.map((sc, i) => (
                <div key={i} className={`flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs ${innerWellClass}`}>
                  <span className={bodyClass}>{sc.action}</span>
                  <kbd className={`px-2 py-1 rounded font-mono font-bold text-[11px] border ${
                    isLight ? 'bg-slate-200 border-slate-300 text-amber-600' : 'bg-studio-800 border-studio-700 text-amber-400'
                  }`}>
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-2xl p-6 shadow-xl border backdrop-blur-xl space-y-3 transition-colors ${
            isLight
              ? 'bg-amber-50/95 border-amber-200/90 shadow-amber-500/5'
              : 'bg-studio-900/95 border-amber-500/30'
          }`}>
            <h4 className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
              isLight ? 'text-amber-700' : 'text-amber-400'
            }`}>
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Professor ISO Pro Tip</span>
            </h4>
            <p className={`text-xs sm:text-sm leading-relaxed font-serif italic font-medium ${
              isLight ? 'text-slate-900' : 'text-zinc-100'
            }`}>
              "{guide.proTip}"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
