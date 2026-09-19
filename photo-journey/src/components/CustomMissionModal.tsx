import React, { useState } from 'react';
import { UserProfile, CustomMission } from '../types';
import { generateCustomMissionWithAI } from '../services/ai';
import { Sparkles, Upload, X, Loader2, BookOpen, Layers, CheckCircle2 } from 'lucide-react';
import { importMissionsFromCSV } from '../utils/notionExporter';

interface CustomMissionModalProps {
  userProfile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onMissionCreated: (mission: CustomMission) => void;
  isLight: boolean;
  onOpenSettings: () => void;
}

export const CustomMissionModal: React.FC<CustomMissionModalProps> = ({
  userProfile,
  isOpen,
  onClose,
  onMissionCreated,
  isLight,
  onOpenSettings
}) => {
  const [topicPrompt, setTopicPrompt] = useState<string>('');
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  if (!isOpen) return null;

  const isAiConfigured = Boolean(userProfile.aiSettings.apiKey || userProfile.aiSettings.provider === 'ollama');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!isAiConfigured) {
      onOpenSettings();
      return;
    }

    if (!topicPrompt.trim() && !selectedImageBase64) {
      alert('Please enter a topic prompt or upload a photo to generate a custom mission.');
      return;
    }

    setIsGenerating(true);
    try {
      const mission = await generateCustomMissionWithAI(
        userProfile,
        topicPrompt || 'Custom Photo Mission',
        selectedImageBase64 || undefined
      );
      onMissionCreated(mission);
      onClose();
    } catch (err: any) {
      alert(`Custom Mission Generation Error: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const modalBgClass = isLight ? 'bg-white border-amber-200 text-slate-900' : 'bg-studio-900 border-studio-800 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${modalBgClass}`}>
        {/* Header */}
        <div className="p-6 border-b border-slate-200/60 dark:border-studio-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif-title font-bold text-lg">Generate Custom AI Mission</h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-studio-400'}`}>
                Create a detailed, multi-stage photography assignment tailored to your gear.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-2 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Option A: Prompt Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" /> What kind of mission do you want?
            </label>
            <textarea
              rows={3}
              value={topicPrompt}
              onChange={(e) => setTopicPrompt(e.target.value)}
              placeholder="e.g. 'I want a night portrait mission editing orange sand and blue sky' or 'A macro expedition focusing on spider webs'..."
              className={`w-full p-3.5 rounded-2xl text-xs border outline-none focus:border-amber-500 ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-studio-950 border-studio-800 text-white'
              }`}
            />
          </div>

          {/* Option B: Upload Image for Tailored Edit Plan */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-amber-600 dark:text-amber-400" /> (Optional) Upload an unedited photo to build a mission for it
            </label>
            <div className={`p-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              selectedImageBase64
                ? 'border-amber-500 bg-amber-500/10'
                : isLight
                  ? 'border-slate-300 hover:border-amber-400 bg-slate-50'
                  : 'border-studio-700 hover:border-studio-600 bg-studio-950'
            }`}>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="custom-mission-photo-input"
              />
              <label htmlFor="custom-mission-photo-input" className="cursor-pointer w-full h-full flex flex-col items-center">
                {selectedImageBase64 ? (
                  <div className="space-y-2">
                    <img
                      src={selectedImageBase64}
                      alt="Uploaded preview"
                      className="max-h-36 rounded-xl mx-auto shadow-md"
                    />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Photo Attached — AI will build mission specifically for this photo
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    <Upload className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-xs font-semibold">Click to select photo</p>
                    <p className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-studio-500'}`}>
                      AI will analyze lighting, subjects, and color to generate a custom step-by-step edit plan
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Option C: Import from Notion CSV */}
          <div className={`p-4 rounded-2xl border space-y-2 ${
            isLight ? 'bg-amber-50/50 border-amber-200/80' : 'bg-studio-950/60 border-studio-800'
          }`}>
            <label htmlFor="notion-csv-upload" className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4" /> Or Import Missions from Notion CSV File (.csv)
            </label>
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-studio-400'}`}>
              Exported a mission table from Notion? Select your <code>.csv</code> file to import your missions directly into Photo Journey.
            </p>
            <input
              id="notion-csv-upload"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                  const content = evt.target?.result as string;
                  if (content) {
                    const imported = importMissionsFromCSV(content);
                    if (imported.length > 0) {
                      imported.forEach(m => onMissionCreated(m));
                      alert(`Successfully imported ${imported.length} mission(s) from Notion CSV!`);
                      onClose();
                    } else {
                      alert('Could not parse any missions from this CSV file. Make sure it has a header row.');
                    }
                  }
                };
                reader.readAsText(file);
              }}
              className={`w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer ${
                isLight ? 'text-slate-700' : 'text-studio-300'
              }`}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200/60 dark:border-studio-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-studio-800 hover:bg-studio-700 text-white'
            }`}
          >
            Cancel
          </button>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Mission...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Create Mission with AI</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
