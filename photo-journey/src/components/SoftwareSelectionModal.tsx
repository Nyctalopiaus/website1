import React, { useState } from 'react';
import { X, Sliders, Check } from 'lucide-react';
import { UserProfile, SoftwareName } from '../types';

interface SoftwareSelectionModalProps {
  userProfile: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  onClose: () => void;
}

export const SoftwareSelectionModal: React.FC<SoftwareSelectionModalProps> = ({ userProfile, onSave, onClose }) => {
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareName>(userProfile.software);

  const softwareCatalog: { name: SoftwareName; desc: string; tag: string }[] = [
    { name: 'Lightroom Classic', desc: 'Industry-standard desktop RAW workflow with catalog management & HSL color grading.', tag: 'RAW / Desktop' },
    { name: 'Lightroom CC', desc: 'Cloud-based Lightroom app for desktop, tablet, and mobile sync.', tag: 'RAW / Cloud' },
    { name: 'Adobe Photoshop', desc: 'Advanced raster editing, frequency separation, luminance masking & composite layers.', tag: 'Layers / RAW' },
    { name: 'Capture One', desc: 'High-end commercial tethered shooting & precise skin tone color balance toolset.', tag: 'Pro RAW / Tethered' },
    { name: 'Darktable', desc: 'Free, open-source non-destructive RAW developer with parametric masking.', tag: 'Open Source / RAW' },
    { name: 'RawTherapee', desc: 'High-precision open-source demosaicing & 32-bit floating point engine.', tag: 'Open Source / RAW' },
    { name: 'GIMP', desc: 'Free, open-source image manipulation program with layer support.', tag: 'Open Source / Layers' },
    { name: 'Affinity Photo', desc: 'Pro graphics suite with full RAW editing, live filter layers & focus stacking.', tag: 'Pro / One-time Purchase' },
    { name: 'Apple Photos / iOS', desc: 'Native Apple RAW editing tools & tone sliders for Mac and iPhone.', tag: 'Mobile / Mac' },
    { name: 'Other / Generic RAW Editor', desc: 'Any other RAW developer or photo editing application.', tag: 'Generic' }
  ];

  const handleSave = () => {
    onSave({
      ...userProfile,
      software: selectedSoftware
    });
    onClose();
  };

  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className={`rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold font-serif-title">Primary Photo Editing Software</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
            Select your preferred editing software. Prof. ISO will provide exact step-by-step slider names, keyboard shortcuts, and menu paths tailored specifically for your tool!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {softwareCatalog.map((sw) => {
              const isSelected = selectedSoftware === sw.name;
              return (
                <button
                  key={sw.name}
                  type="button"
                  onClick={() => setSelectedSoftware(sw.name)}
                  className={`p-4 rounded-2xl text-left border transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 text-amber-600 font-bold shadow-md'
                      : isLight
                        ? 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                        : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-xs">{sw.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                    </div>
                    <p className={`text-[11px] font-normal leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                      {sw.desc}
                    </p>
                  </div>
                  <div className="mt-3">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                      isLight
                        ? 'bg-amber-100 text-amber-950 border-amber-300'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {sw.tag}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-end gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
          >
            Save Software Selection
          </button>
        </div>
      </div>
    </div>
  );
};
