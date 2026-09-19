import React from 'react';
import { X, CheckCircle, AlertTriangle, FileImage, ShieldCheck, Cpu, HelpCircle } from 'lucide-react';
import { UserProfile } from '../types';

interface PhotoGuidelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
}

export const PhotoGuidelinesModal: React.FC<PhotoGuidelinesModalProps> = ({
  isOpen,
  onClose,
  userProfile
}) => {
  if (!isOpen) return null;

  const isLight = userProfile.backgroundTheme !== 'studio-dark';
  const rawExtensions = ['CR2', 'CR3', 'NEF', 'ARW', 'RAF', 'DNG', 'ORF', 'RW2', 'PEF'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className={`relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl shadow-2xl border transition-colors overflow-hidden ${
        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-800 text-zinc-100'
      }`}>
        {/* Header - Fixed Top */}
        <div className={`shrink-0 px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-amber-100/80 border-amber-300' : 'bg-zinc-900 border-zinc-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${
              isLight ? 'bg-white border-amber-300 text-amber-700' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <FileImage className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className={`font-serif-title text-xl font-black tracking-wide ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}>
                Photo Upload Guidelines & Specs
              </h2>
              <p className={`text-xs font-bold ${
                isLight ? 'text-slate-700' : 'text-zinc-300'
              }`}>
                Supported photo formats, size limits, and RAW workflow rules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${
              isLight ? 'hover:bg-amber-200/80 text-slate-800' : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm leading-relaxed">
          {/* Quick Summary Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={`p-3.5 rounded-2xl border text-center ${
              isLight ? 'bg-amber-50 border-amber-300' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <span className={`text-[11px] uppercase font-black tracking-wider block mb-0.5 ${
                isLight ? 'text-amber-800' : 'text-amber-400'
              }`}>
                Max File Size
              </span>
              <span className={`font-black text-base block ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}>
                25 MB Limit
              </span>
              <p className={`text-xs font-bold mt-0.5 ${
                isLight ? 'text-slate-700' : 'text-zinc-300'
              }`}>
                Prevents browser tab freezes
              </p>
            </div>

            <div className={`p-3.5 rounded-2xl border text-center ${
              isLight ? 'bg-amber-50 border-amber-300' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <span className={`text-[11px] uppercase font-black tracking-wider block mb-0.5 ${
                isLight ? 'text-amber-800' : 'text-amber-400'
              }`}>
                Allowed Formats
              </span>
              <span className={`font-black text-base block ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}>
                JPEG / PNG / WebP
              </span>
              <p className={`text-xs font-bold mt-0.5 ${
                isLight ? 'text-slate-700' : 'text-zinc-300'
              }`}>
                Standard web image files
              </p>
            </div>

            <div className={`p-3.5 rounded-2xl border text-center ${
              isLight ? 'bg-amber-50 border-amber-300' : 'bg-zinc-900 border-zinc-800'
            }`}>
              <span className={`text-[11px] uppercase font-black tracking-wider block mb-0.5 ${
                isLight ? 'text-amber-800' : 'text-amber-400'
              }`}>
                Resolution Specs
              </span>
              <span className={`font-black text-base block ${
                isLight ? 'text-slate-950' : 'text-white'
              }`}>
                Auto-Optimized
              </span>
              <p className={`text-xs font-bold mt-0.5 ${
                isLight ? 'text-slate-700' : 'text-zinc-300'
              }`}>
                Scaled to 2048px; EXIF kept
              </p>
            </div>
          </div>

          {/* Section 1: Supported vs Export Required Formats */}
          <div className={`p-4.5 rounded-2xl border ${
            isLight ? 'bg-slate-100/90 border-slate-300' : 'bg-zinc-900/80 border-zinc-800'
          }`}>
            <h3 className={`font-serif-title text-sm font-black mb-3 flex items-center gap-2 ${
              isLight ? 'text-slate-950' : 'text-white'
            }`}>
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.5]" />
              Supported vs. Export-Required Formats
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Ready for Upload */}
              <div className={`p-3.5 rounded-xl border ${
                isLight ? 'bg-emerald-100/90 border-emerald-400' : 'bg-zinc-950 border-emerald-900/60'
              }`}>
                <div className={`font-black mb-1.5 flex items-center gap-1.5 text-xs ${
                  isLight ? 'text-emerald-950' : 'text-emerald-400'
                }`}>
                  <CheckCircle className="w-4 h-4 stroke-[2.5]" />
                  Ready for Immediate Upload:
                </div>
                <ul className={`text-xs space-y-1 font-bold ${
                  isLight ? 'text-slate-900' : 'text-zinc-200'
                }`}>
                  <li>• <strong>JPEG / JPG</strong> (.jpg, .jpeg) — Recommended</li>
                  <li>• <strong>PNG</strong> (.png) — Web graphics & renders</li>
                  <li>• <strong>WebP</strong> (.webp) — Modern web format</li>
                </ul>
              </div>

              {/* Export Required */}
              <div className={`p-3.5 rounded-xl border ${
                isLight ? 'bg-amber-100/90 border-amber-400' : 'bg-zinc-950 border-amber-900/60'
              }`}>
                <div className={`font-black mb-1.5 flex items-center gap-1.5 text-xs ${
                  isLight ? 'text-amber-950' : 'text-amber-400'
                }`}>
                  <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                  Export Required Before Upload:
                </div>
                <ul className={`text-xs space-y-1 font-bold ${
                  isLight ? 'text-slate-900' : 'text-zinc-200'
                }`}>
                  <li>• <strong>Camera RAW</strong> ({rawExtensions.slice(0, 5).join(', ')}, etc.)</li>
                  <li>• <strong>TIFF / PSD</strong> (Large studio project files)</li>
                  <li>• <strong>HEIC / HEIF</strong> (Apple iOS photo format)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 2: Why RAW files can't be uploaded directly */}
          <div className={`p-4.5 rounded-2xl border ${
            isLight ? 'bg-amber-100/80 border-amber-300' : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <h3 className={`font-serif-title text-sm font-black mb-2 flex items-center gap-2 ${
              isLight ? 'text-amber-950' : 'text-amber-400'
            }`}>
              <Cpu className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
              Why Can't I Upload RAW Camera Files Directly?
            </h3>
            <p className={`text-xs font-bold mb-2.5 leading-normal ${
              isLight ? 'text-slate-900' : 'text-zinc-200'
            }`}>
              Digital camera RAW files (such as Canon <code className="bg-amber-200 text-black border border-amber-400 font-mono font-black px-1.5 py-0.5 rounded">.CR3</code>, Nikon <code className="bg-amber-200 text-black border border-amber-400 font-mono font-black px-1.5 py-0.5 rounded">.NEF</code>, Sony <code className="bg-amber-200 text-black border border-amber-400 font-mono font-black px-1.5 py-0.5 rounded">.ARW</code>, or Adobe <code className="bg-amber-200 text-black border border-amber-400 font-mono font-black px-1.5 py-0.5 rounded">.DNG</code>) contain uncompressed sensor data ranging from 30 MB to over 1 GB per photo.
            </p>
            <ul className={`text-xs font-bold space-y-1.5 ${
              isLight ? 'text-slate-900' : 'text-zinc-200'
            }`}>
              <li>• <strong>Browser Engines:</strong> Web browsers cannot natively render raw camera binary files without dedicated desktop editors.</li>
              <li>• <strong>Memory Protection:</strong> Reading multi-gigabyte raw files in browser memory causes tab lockups and crashes.</li>
              <li>• <strong>AI Vision Optimization:</strong> AI vision grading engines analyze visual composition and colors on high-quality JPEGs without needing giant raw files.</li>
            </ul>
          </div>

          {/* Section 3: How to Prepare & Upload Photos */}
          <div className={`p-4.5 rounded-2xl border ${
            isLight ? 'bg-slate-100/90 border-slate-300' : 'bg-zinc-900/80 border-zinc-800'
          }`}>
            <h3 className={`font-serif-title text-sm font-black mb-2 flex items-center gap-2 ${
              isLight ? 'text-slate-950' : 'text-white'
            }`}>
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 stroke-[2.5]" />
              How to Prepare & Upload Photos from Your Camera
            </h3>

            <ol className={`text-xs font-bold space-y-2 ${
              isLight ? 'text-slate-950' : 'text-zinc-200'
            }`}>
              <li>
                <strong className={isLight ? 'text-amber-900 font-black' : 'text-amber-400'}>1. Shoot on your camera:</strong> Capture photos in RAW or JPEG mode on your {userProfile.camera.brand} {userProfile.camera.model}.
              </li>
              <li>
                <strong className={isLight ? 'text-amber-900 font-black' : 'text-amber-400'}>2. Edit in software:</strong> Open your photo in <strong>{userProfile.software}</strong> (or Lightroom, Capture One, Darktable, Apple Photos).
              </li>
              <li>
                <strong className={isLight ? 'text-amber-900 font-black' : 'text-amber-400'}>3. Export as JPEG:</strong> Select <em>File &gt; Export</em>, set format to <strong>JPEG</strong>, quality to 80–90% (keep file size under 25 MB).
              </li>
              <li>
                <strong className={isLight ? 'text-amber-900 font-black' : 'text-amber-400'}>4. Upload to Studio:</strong> Drag your exported JPEG into Photo Journey for instant AI feedback from AI Prof. ISO!
              </li>
            </ol>
          </div>

          {/* Section 4: Privacy & Client Storage */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            isLight ? 'bg-emerald-100/90 border-emerald-400' : 'bg-emerald-950/60 border-emerald-800'
          }`}>
            <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 stroke-[2.5] ${
              isLight ? 'text-emerald-800' : 'text-emerald-400'
            }`} />
            <div className={`text-xs font-bold leading-normal ${
              isLight ? 'text-emerald-950' : 'text-emerald-100'
            }`}>
              <strong>Client-Side Downscaling & Privacy:</strong> When you upload a photo, Photo Journey downscales it to 2048px inside your browser while preserving EXIF metadata (aperture, shutter speed, ISO). Your photos remain stored locally on your device.
            </div>
          </div>
        </div>

        {/* Footer - Fixed Bottom */}
        <div className={`shrink-0 px-6 py-3.5 border-t flex justify-end ${
          isLight ? 'bg-slate-100 border-slate-300' : 'bg-zinc-900 border-zinc-800'
        }`}>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-black shadow-md border border-amber-600 transition-all"
          >
            Got It, Understood!
          </button>
        </div>
      </div>
    </div>
  );
};
