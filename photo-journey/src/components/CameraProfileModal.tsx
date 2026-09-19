import React, { useState } from 'react';
import { X, Camera, Check, Sliders } from 'lucide-react';
import { UserProfile, CameraProfile } from '../types';

interface CameraProfileModalProps {
  userProfile: UserProfile;
  onSave: (updatedProfile: UserProfile) => void;
  onClose: () => void;
}

export const CameraProfileModal: React.FC<CameraProfileModalProps> = ({ userProfile, onSave, onClose }) => {
  const [camera, setCamera] = useState<CameraProfile>({ ...userProfile.camera });
  const [level, setLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>(userProfile.experienceLevel);

  const popularBrands = [
    'Sony', 'Canon', 'Nikon', 'Fujifilm', 'Leica', 'Hasselblad',
    'Panasonic Lumix', 'OM System / Olympus', 'Apple', 'Samsung', 'Google Pixel'
  ];

  const handleSave = () => {
    onSave({
      ...userProfile,
      camera,
      experienceLevel: level
    });
    onClose();
  };

  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className={`rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold font-serif-title">Camera Hardware Profile</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
            Specify your primary camera hardware. Prof. ISO tailors assignment tips and sensor calculations specifically to your gear specs!
          </p>

          {/* Quick Brand Pills */}
          <div>
            <span className="text-xs font-bold block mb-2 text-slate-500">Quick Brand Preset</span>
            <div className="flex flex-wrap gap-1.5">
              {popularBrands.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setCamera({ ...camera, brand: b })}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
                    camera.brand === b
                      ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-sm'
                      : isLight
                        ? 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="camera-brand" className="text-xs text-slate-500 block mb-1">Camera Brand</label>
              <input
                id="camera-brand"
                type="text"
                value={camera.brand}
                onChange={(e) => setCamera({ ...camera, brand: e.target.value })}
                placeholder="e.g. Sony, Canon, Fujifilm, Apple"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              />
            </div>

            <div>
              <label htmlFor="camera-model" className="text-xs text-slate-500 block mb-1">Camera Model</label>
              <input
                id="camera-model"
                type="text"
                value={camera.model}
                onChange={(e) => setCamera({ ...camera, model: e.target.value })}
                placeholder="e.g. A7IV, EOS R6, X-T5, iPhone 15 Pro"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              />
            </div>

            <div>
              <label htmlFor="camera-sensor-format" className="text-xs text-slate-500 block mb-1">Sensor Format</label>
              <select
                id="camera-sensor-format"
                value={camera.sensorType}
                onChange={(e) => setCamera({ ...camera, sensorType: e.target.value as any })}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              >
                <option value="Full Frame">Full Frame (35mm Standard)</option>
                <option value="APS-C">APS-C (Crop Sensor 1.5x/1.6x)</option>
                <option value="Micro Four Thirds">Micro Four Thirds (2.0x Crop)</option>
                <option value="Medium Format">Medium Format (Hasselblad / Fuji GFX)</option>
                <option value="Smartphone">Smartphone Sensor</option>
                <option value="Film / Other">Film / Analog / Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="camera-primary-lens" className="text-xs text-slate-500 block mb-1">Primary Lens Specs</label>
              <input
                id="camera-primary-lens"
                type="text"
                value={camera.primaryLens}
                onChange={(e) => setCamera({ ...camera, primaryLens: e.target.value })}
                placeholder="e.g. 50mm f/1.8, 24-70mm f/2.8"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              />
            </div>
          </div>

          {/* Student Experience Level */}
          <div className="pt-2">
            <span className="text-xs font-bold block mb-2 text-slate-500">Student Photography Level</span>
            <div className="grid grid-cols-3 gap-2">
              {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`p-3 rounded-xl text-xs font-bold text-center border transition-all ${
                    level === lvl
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                      : isLight
                        ? 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {lvl === 'Beginner' ? '🟢 Beginner' : lvl === 'Intermediate' ? '🟡 Intermediate' : '🔴 Advanced'}
                </button>
              ))}
            </div>
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
            Save Camera Profile
          </button>
        </div>
      </div>
    </div>
  );
};
