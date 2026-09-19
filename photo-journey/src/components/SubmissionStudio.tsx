import React, { useState } from 'react';
import { Challenge, UserProfile, StudentSubmission, SoftwareName, ExifData } from '../types';
import { getChallengeSteps } from '../data/challenges';
import { extractExifFromFile } from '../services/exif';
import { downscaleImageDataUrl } from '../utils/imageProcessing';
import { Upload, Image as ImageIcon, Camera, Sliders, AlertCircle, Loader2, Sparkles, CheckCircle2, BookOpen, ChevronDown, ChevronUp, Gauge, MessageSquare, FileImage } from 'lucide-react';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { HistogramCanvas } from './HistogramCanvas';

interface SubmissionStudioProps {
  challenge: Challenge;
  userProfile: UserProfile;
  onSubmit: (submission: StudentSubmission) => Promise<void>;
  isSubmitting: boolean;
  onOpenSimulator?: () => void;
  onAskProfessor?: (challenge: Challenge) => void;
  onOpenPhotoGuidelines?: () => void;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const SubmissionStudio: React.FC<SubmissionStudioProps> = ({
  challenge,
  userProfile,
  onSubmit,
  isSubmitting,
  onOpenSimulator,
  onAskProfessor,
  onOpenPhotoGuidelines
}) => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [userNotes, setUserNotes] = useState<string>('');
  const [softwareUsed, setSoftwareUsed] = useState<SoftwareName>(userProfile.software);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingEdited, setIsDraggingEdited] = useState<boolean>(false);
  const [isDraggingOriginal, setIsDraggingOriginal] = useState<boolean>(false);

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'shooting' | 'editing'>('shooting');

  const steps = getChallengeSteps(challenge, userProfile.software);
  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const rawExtensions = ['cr2', 'cr3', 'nef', 'arw', 'raf', 'dng', 'orf', 'rw2', 'pef'];
    
    if (rawExtensions.includes(ext)) {
      return `Camera RAW file (.${ext.toUpperCase()}) detected. RAW files cannot be rendered directly in web browsers. Please export your photo as a JPEG or PNG under 25 MB from your editing software (${userProfile.software}).`;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return `File size (${sizeMb} MB) exceeds the 25 MB limit. Please export a JPEG or PNG under 25 MB to prevent browser performance and memory issues.`;
    }

    if (!file.type.startsWith('image/')) {
      return 'Please upload a valid image file (JPEG, PNG, or WebP).';
    }

    return null;
  };

  const readAndDownscale = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawDataUrl = event.target?.result as string;
        try {
          resolve(await downscaleImageDataUrl(rawDataUrl));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read this file.'));
      reader.readAsDataURL(file);
    });
  };

  const processEditedFile = async (file: File | undefined) => {
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setErrorMsg(null);
    const extractedExif = await extractExifFromFile(file);
    setExif(extractedExif);

    try {
      setEditedImage(await readAndDownscale(file));
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not process this image.');
    }
  };

  const processOriginalFile = async (file: File | undefined) => {
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setErrorMsg(null);
    try {
      setOriginalImage(await readAndDownscale(file));
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not process this image.');
    }
  };

  const handleEditedImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processEditedFile(e.target.files?.[0]);
  };

  const handleOriginalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processOriginalFile(e.target.files?.[0]);
  };

  const handleEditedDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingEdited(false);
    processEditedFile(e.dataTransfer.files?.[0]);
  };

  const handleOriginalDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingOriginal(false);
    processOriginalFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async () => {
    if (!editedImage) {
      setErrorMsg('Please upload your final edited photo before submitting.');
      return;
    }

    const submission: StudentSubmission = {
      id: `sub_${Date.now()}`,
      challengeId: challenge.id,
      timestamp: new Date().toISOString(),
      originalImageBase64: originalImage || undefined,
      editedImageBase64: editedImage,
      exif: exif || undefined,
      userNotes,
      softwareUsed,
      cameraUsed: `${userProfile.camera.brand} ${userProfile.camera.model}`
    };

    try {
      await onSubmit(submission);
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission failed.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Active Assignment Header Card */}
      <div className={`rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl border transition-colors ${
        isLight ? 'bg-white/85 border-amber-100/80' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <span className="text-xs font-extrabold text-amber-500 bg-amber-500/10 px-3.5 py-1 rounded-full border border-amber-500/30 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Active Assignment Studio
          </span>
          <span className={`text-xs font-bold ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
            Level: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{challenge.level}</strong>
          </span>
        </div>
        <h2 className={`font-serif-title text-2xl sm:text-3xl font-bold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>{challenge.title}</h2>
        <p className={`text-sm leading-relaxed mb-4 ${isLight ? 'text-slate-600' : 'text-zinc-300'}`}>{challenge.summary}</p>

        {/* Camera Tip — kept here, big and legible, so it's the thing a
            student can pull back up mid-shoot without hunting through the
            catalog again. */}
        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm mb-4 ${
          isLight ? 'bg-white border-amber-100 text-slate-700' : 'bg-zinc-950/80 border-zinc-800 text-zinc-200'
        }`}>
          <Camera className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span><strong>Camera Tip:</strong> {challenge.cameraTip}</span>
        </div>

        {/* Objectives Grid */}
        <div className={`p-4 rounded-xl border space-y-2 mb-4 ${
          isLight ? 'bg-amber-50/60 border-amber-100' : 'bg-zinc-950/80 border-zinc-800/90'
        }`}>
          <span className={`text-[10px] font-extrabold uppercase tracking-widest block mb-1 ${
            isLight ? 'text-slate-500' : 'text-zinc-500'
          }`}>
            Rubric & Grading Objectives
          </span>
          <ul className={`text-sm grid grid-cols-1 md:grid-cols-2 gap-2 ${isLight ? 'text-slate-700' : 'text-zinc-200'}`}>
            {challenge.objectives.map((obj, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Expandable How-To Accordion */}
        <div>
          <button
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-xs font-bold transition-all ${
              isGuideOpen
                ? (isLight ? 'bg-amber-100/70 border-amber-300 text-amber-950' : 'bg-amber-500/20 border-amber-500/40 text-amber-300')
                : (isLight ? 'bg-white hover:bg-amber-50/80 border-slate-200 text-slate-700' : 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300')
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500" />
              <span>Step-by-Step "How To Do This" Guide</span>
            </div>
            {isGuideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isGuideOpen && (
            <div className={`mt-2 p-4 rounded-xl border space-y-3 transition-all ${
              isLight ? 'bg-amber-50/40 border-amber-200/80' : 'bg-zinc-950 border-zinc-800'
            }`}>
              <div className="flex border-b border-amber-500/20 gap-3 pb-2">
                <button
                  onClick={() => setActiveGuideTab('shooting')}
                  className={`flex items-center gap-1.5 text-xs font-bold pb-1 border-b-2 transition-colors ${
                    activeGuideTab === 'shooting'
                      ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>1. Shooting Walkthrough</span>
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
                  <span>2. Post-Production ({userProfile.software})</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {(activeGuideTab === 'shooting' ? steps.shooting : steps.editing).map((stepText, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>
                      {stepText}
                    </span>
                  </div>
                ))}
              </div>

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
                    <span>Ask Professor ISO for Help</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Zone */}
      <div className={`rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-xl border transition-colors ${
        isLight ? 'bg-white/85 border-amber-100/80' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={`text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            <Upload className="w-4 h-4 text-amber-500" />
            Step 1: Upload Photograph Submissions
          </h3>

          {onOpenPhotoGuidelines && (
            <button
              onClick={onOpenPhotoGuidelines}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                isLight
                  ? 'bg-amber-100/80 hover:bg-amber-200 border-amber-300 text-amber-950'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
              }`}
            >
              <FileImage className="w-3.5 h-3.5 text-amber-500" />
              <span>Photo Specs & Rules (Max 25MB, JPEG/PNG)</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Edited Photo Upload (Required) */}
          <div className="space-y-2">
            <div className={`text-xs font-semibold flex items-center justify-between ${isLight ? 'text-slate-700' : 'text-zinc-200'}`}>
              <span>Final Edited Photo (Required)</span>
              <span className="text-[11px] text-amber-500 font-bold">Graded by Prof. ISO</span>
            </div>

            {editedImage ? (
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-amber-500/50 group bg-zinc-950 shadow-xl">
                <img src={editedImage} alt="Edited preview" className="w-full h-full object-contain" />
                <button
                  onClick={() => setEditedImage(null)}
                  className="absolute top-3 right-3 bg-black/80 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors shadow-lg"
                >
                  Change
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => { e.preventDefault(); setIsDraggingEdited(true); }}
                onDragLeave={() => setIsDraggingEdited(false)}
                onDrop={handleEditedDrop}
                className={`flex flex-col items-center justify-center aspect-[4/3] rounded-2xl border-2 border-dashed cursor-pointer transition-all p-6 text-center group ${
                isDraggingEdited
                  ? 'border-amber-500 bg-amber-50/80 scale-[1.01]'
                  : isLight
                    ? 'border-slate-300 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/60'
                    : 'border-zinc-700 hover:border-amber-400 bg-zinc-950 hover:bg-zinc-950/80'
              }`}>
                <div className={`p-3 rounded-full mb-3 transition-colors ${
                  isLight ? 'bg-white text-slate-400 group-hover:text-amber-600' : 'bg-zinc-900 text-zinc-400 group-hover:text-amber-400'
                }`}>
                  <ImageIcon className="w-8 h-8" />
                </div>
                <span className={`text-xs font-bold mb-1 ${isLight ? 'text-slate-700' : 'text-zinc-200'}`}>
                  {isDraggingEdited ? 'Drop to upload' : 'Click or drag & drop your final edited photo'}
                </span>
                <span className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>Supports JPEG, PNG, WebP — large photos are auto-resized</span>
                <input id="edited-photo-upload" type="file" accept="image/*" onChange={handleEditedImageUpload} className="hidden" />
              </label>
            )}
          </div>

          {/* Original Photo Upload (Optional) */}
          <div className="space-y-2">
            <div className={`text-xs font-semibold flex items-center justify-between ${isLight ? 'text-slate-700' : 'text-zinc-200'}`}>
              <span>Original Unedited Photo (Optional)</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Enables Before/After slider</span>
            </div>

            {originalImage ? (
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-zinc-700 group bg-zinc-950 shadow-xl">
                <img src={originalImage} alt="Original preview" className="w-full h-full object-contain" />
                <button
                  onClick={() => setOriginalImage(null)}
                  className="absolute top-3 right-3 bg-black/80 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors shadow-lg"
                >
                  Change
                </button>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center aspect-[4/3] rounded-2xl border-2 border-dashed cursor-pointer transition-all p-6 text-center group ${
                isLight
                  ? 'border-slate-200 hover:border-slate-400 bg-slate-50/60'
                  : 'border-zinc-800 hover:border-zinc-600 bg-zinc-950/50'
              }`}>
                <div className={`p-3 rounded-full mb-3 transition-colors ${
                  isLight ? 'bg-white/60 text-slate-400 group-hover:text-slate-600' : 'bg-zinc-900/50 text-zinc-600 group-hover:text-zinc-400'
                }`}>
                  <ImageIcon className="w-7 h-7" />
                </div>
                <span className={`text-xs font-medium mb-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Click to upload original unedited shot</span>
                <span className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-zinc-600'}`}>Optional for side-by-side view</span>
                <input id="original-photo-upload" type="file" accept="image/*" onChange={handleOriginalImageUpload} className="hidden" />
              </label>
            )}
          </div>
        </div>

        {/* Live Before / After Comparison Slider if both uploaded */}
        {originalImage && editedImage && (
          <div className={`pt-6 border-t space-y-3 ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
            <BeforeAfterSlider originalImage={originalImage} editedImage={editedImage} />
          </div>
        )}

        {/* Parsed EXIF Data */}
        {exif && (exif.cameraModel || exif.iso || exif.fNumber) && (
          <div className={`p-4 rounded-xl border text-xs space-y-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'}`}>
            <span className={`font-bold flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>
              <Camera className="w-4 h-4 text-amber-500" />
              Auto-Parsed EXIF Metadata:
            </span>
            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              <div className={`px-3 py-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'}`}>Camera: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{exif.cameraMake || ''} {exif.cameraModel || 'N/A'}</strong></div>
              <div className={`px-3 py-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'}`}>ISO: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{exif.iso || 'N/A'}</strong></div>
              <div className={`px-3 py-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'}`}>Aperture: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{exif.fNumber || 'N/A'}</strong></div>
              <div className={`px-3 py-1.5 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'}`}>Shutter: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{exif.shutterSpeed || 'N/A'}</strong></div>
            </div>
          </div>
        )}

        {/* Live Histogram Analysis */}
        {editedImage && (
          <HistogramCanvas imageUrl={editedImage} isLight={isLight} />
        )}

        {/* Step 2: Software & Notes */}
        <div className={`space-y-4 pt-6 border-t ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
          <h3 className={`text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            <Sliders className="w-4 h-4 text-amber-500" />
            Step 2: Software Selection & Editing Notes
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="submission-software-used" className={`text-xs block mb-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Software Used for this Edit</label>
              <select
                id="submission-software-used"
                value={softwareUsed}
                onChange={(e) => setSoftwareUsed(e.target.value as SoftwareName)}
                className={`w-full border rounded-xl px-4 py-3 text-sm font-medium focus:border-amber-500 focus:outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              >
                <option value="Lightroom Classic">Lightroom Classic</option>
                <option value="Lightroom CC">Lightroom CC</option>
                <option value="Adobe Photoshop">Adobe Photoshop</option>
                <option value="Capture One">Capture One</option>
                <option value="Darktable">Darktable</option>
                <option value="RawTherapee">RawTherapee</option>
                <option value="GIMP">GIMP</option>
                <option value="Affinity Photo">Affinity Photo</option>
                <option value="Apple Photos / iOS">Apple Photos / iOS</option>
                <option value="Other / Generic RAW Editor">Other / Generic RAW Editor</option>
              </select>
            </div>

            <div>
              <label htmlFor="submission-notes" className={`text-xs block mb-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Student Editing Notes</label>
              <input
                id="submission-notes"
                type="text"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="e.g. 'I used Tone Curve to lift midtones and lowered highlights by -60...'"
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:border-amber-500 focus:outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-xs text-red-500 flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-4 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !editedImage}
            className={`px-8 py-4 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-2xl ${
              isSubmitting || !editedImage
                ? isLight
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black shadow-amber-500/20 hover:scale-[1.02]'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-black" />
                <span>Prof. ISO is Reviewing Your Edit...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-black" />
                <span>Submit to Prof. ISO for Grading</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
