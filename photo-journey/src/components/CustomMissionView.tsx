import React, { useState } from 'react';
import { CustomMission, UserProfile } from '../types';
import { Sparkles, Clock, Star, Target, Lightbulb, Shield, Camera, Zap, CheckCircle2, Circle, ChevronDown, Layers, HelpCircle, BookOpen, Printer, ArrowDown, Copy, Download, Smartphone, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { exportMissionToMarkdown, exportMissionsToCSV, downloadFile, copyToClipboard } from '../utils/notionExporter';
import { pushMissionToNotion } from '../services/notionService';

interface CustomMissionViewProps {
  mission: CustomMission;
  isLight: boolean;
  userProfile?: UserProfile;
  onClose?: () => void;
  onStartSubmission?: () => void;
}

export const CustomMissionView: React.FC<CustomMissionViewProps> = ({
  mission,
  isLight,
  userProfile,
  onClose,
  onStartSubmission
}) => {
  const [completedStepIndices, setCompletedStepIndices] = useState<number[]>([]);
  const [isPrintMode, setIsPrintMode] = useState<boolean>(false);
  const [isPortfolioSaved, setIsPortfolioSaved] = useState<boolean>(false);
  const [copiedMd, setCopiedMd] = useState<boolean>(false);
  const [notionPushStatus, setNotionPushStatus] = useState<{ loading: boolean; success?: boolean; message?: string; pageUrl?: string }>({ loading: false });

  const toggleStepCompleted = (index: number) => {
    setCompletedStepIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const cardClass = isLight ? 'bg-white/95 border-amber-100/90 text-slate-900 shadow-xl' : 'bg-studio-900/95 border-studio-800 text-studio-100 shadow-2xl';

  const defaultWorkflowSteps = [
    'Crop First',
    'Base Exposure & Tone',
    'Color Control & White Balance',
    'Subject Masking',
    'Sky & Environment Masking',
    'Horizon & Foreground Gradients',
    'Color Grading',
    'Noise Reduction',
    'Sharpening & Final Before/After'
  ];

  if (isPrintMode) {
    return (
      <div className="p-8 max-w-4xl mx-auto bg-white text-black font-sans space-y-6 print:p-0">
        {/* Printable Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-amber-600 block">
              Expedition: {mission.expeditionName}
            </span>
            <h1 className="text-3xl font-bold font-serif-title mt-1">{mission.title}</h1>
          </div>
          <button
            onClick={() => setIsPrintMode(false)}
            className="no-print bg-slate-900 text-white text-xs px-4 py-2 rounded-xl font-bold cursor-pointer"
          >
            ← Back to App
          </button>
        </div>

        {/* Printable Metadata Table */}
        <table className="w-full text-xs text-left border-collapse border border-slate-300">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-100 border-r border-slate-300 w-32">Estimated Time</td>
              <td className="p-2 border-r border-slate-300 font-semibold">{mission.estimatedTime}</td>
              <td className="p-2 font-bold bg-slate-100 border-r border-slate-300 w-32">Difficulty</td>
              <td className="p-2 text-amber-600 font-bold">
                {Array.from({ length: mission.difficultyStars }).map(() => '★').join(' ')}
              </td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="p-2 font-bold bg-slate-100 border-r border-slate-300">Subject Tags</td>
              <td className="p-2 border-r border-slate-300">{mission.subjectTags.join(', ')}</td>
              <td className="p-2 font-bold bg-slate-100 border-r border-slate-300">Skills Learned</td>
              <td className="p-2">{mission.skillsLearned.join(', ')}</td>
            </tr>
          </tbody>
        </table>

        {/* Objective & Why This Matters */}
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
            <h3 className="font-bold text-amber-700 text-sm">🎯 Mission Objective</h3>
            <p className="text-xs text-slate-800 leading-relaxed">{mission.objective}</p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <h3 className="font-bold text-slate-700 text-sm">🌎 Why This Matters</h3>
            <p className="text-xs text-slate-800 leading-relaxed">{mission.whyThisMatters}</p>
          </div>
        </div>

        {/* Setup Requirements */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
            <span className="font-bold text-slate-800 block">🎒 Gear</span>
            <span className="text-slate-600">{mission.gearNeeded}</span>
          </div>
          <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
            <span className="font-bold text-slate-800 block">⚙ Camera Setup</span>
            <span className="text-slate-600">{mission.cameraSetup}</span>
          </div>
          <div className="p-3 border border-slate-300 rounded-xl bg-slate-50">
            <span className="font-bold text-slate-800 block">⚡ Flash Setup</span>
            <span className="text-slate-600">{mission.flashSetup}</span>
          </div>
        </div>

        {/* Step-by-Step Edit Plan */}
        <div className="space-y-3 pt-2">
          <h2 className="text-base font-bold font-serif-title text-amber-700 border-b border-amber-200 pb-1">
            📸 Step-by-Step Plan
          </h2>
          <div className="space-y-2 text-xs">
            {mission.steps.map((s, idx) => (
              <div key={idx} className="p-3 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold block text-slate-900">{idx + 1}. {s.title}</span>
                <p className="text-slate-700">{s.instruction}</p>
                {s.tryValues && <p className="font-mono text-amber-700 text-[11px]">Try: {s.tryValues}</p>}
                {s.watchFor && <p className="text-slate-500 italic text-[11px]">Watch: {s.watchFor}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Challenge Variants A vs B */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="p-4 border border-amber-300 bg-amber-50 rounded-xl text-xs space-y-1">
            <h3 className="font-bold text-amber-800">{mission.versionA.title}</h3>
            <p className="text-slate-700">{mission.versionA.description}</p>
            <ul className="list-disc list-inside text-slate-800 space-y-0.5">
              {mission.versionA.bulletPoints.map((bp, i) => (
                <li key={i}>{bp}</li>
              ))}
            </ul>
          </div>

          <div className="p-4 border border-sky-300 bg-sky-50 rounded-xl text-xs space-y-1">
            <h3 className="font-bold text-sky-800">{mission.versionB.title}</h3>
            <p className="text-slate-700">{mission.versionB.description}</p>
            <ul className="list-disc list-inside text-slate-800 space-y-0.5">
              {mission.versionB.bulletPoints.map((bp, i) => (
                <li key={i}>{bp}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Technical Corner & Field Notes */}
        <div className="border-t border-slate-300 pt-4 grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <h3 className="font-bold text-amber-700">📖 Technical Corner: {mission.technicalCornerTitle}</h3>
            <p className="text-slate-700">{mission.technicalCornerText}</p>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold text-amber-700">✏️ Field Notes</h3>
            <ul className="list-disc list-inside text-slate-700 space-y-0.5">
              {mission.fieldNotes.map((fn, i) => (
                <li key={i}>{fn}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const handleCopyNotionMarkdown = async () => {
    const md = exportMissionToMarkdown(mission);
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2500);
    }
  };

  const handleDownloadMarkdown = () => {
    const md = exportMissionToMarkdown(mission);
    const fileName = `${mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-notion.md`;
    downloadFile(md, fileName, 'text/markdown');
  };

  const handleDownloadCSV = () => {
    const csv = exportMissionsToCSV([mission]);
    const fileName = `${mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-notion.csv`;
    downloadFile(csv, fileName, 'text/csv');
  };

  const handlePushToNotion = async () => {
    if (!userProfile?.notionSettings?.apiKey || !userProfile?.notionSettings?.databaseId) {
      setNotionPushStatus({
        loading: false,
        success: false,
        message: 'Please set up your Notion Integration Secret and Database ID in Settings first.'
      });
      return;
    }
    setNotionPushStatus({ loading: true });
    const res = await pushMissionToNotion(
      userProfile.notionSettings.apiKey,
      userProfile.notionSettings.databaseId,
      mission
    );
    setNotionPushStatus({
      loading: false,
      success: res.success,
      message: res.message,
      pageUrl: res.pageUrl
    });
  };

  return (
    <div className={`max-w-4xl mx-auto rounded-3xl border p-6 md:p-8 space-y-8 backdrop-blur-xl ${cardClass}`}>
      {/* Top Banner / Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-studio-800 pb-4">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
            {mission.expeditionName}
          </span>
          <h1 className="font-serif-title font-bold text-3xl mt-2">{mission.title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPrintMode(true)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all cursor-pointer ${
              isLight ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800' : 'bg-studio-800 hover:bg-studio-700 border-studio-700 text-white'
            }`}
          >
            <Printer className="w-4 h-4 text-amber-500" />
            <span>Export PDF / Print</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-studio-800 hover:bg-studio-700 text-white'
              }`}
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Notion Export & Mobile Sync Action Bar */}
      <div className={`p-4 rounded-2xl border space-y-3 ${
        isLight ? 'bg-emerald-50/70 border-emerald-200/80 text-slate-800' : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-100'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
            <div>
              <span className="text-xs font-bold block">Notion Mobile Field Sync & Exporters</span>
              <span className="text-[11px] text-slate-500 dark:text-emerald-300/80">
                Track this mission on your phone with apps.notion.com
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyNotionMarkdown}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-studio-700 bg-white dark:bg-studio-900 hover:bg-slate-50 text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Copy formatted Markdown checklist to paste directly into Notion page"
            >
              {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-amber-500" />}
              {copiedMd ? 'Copied Notion MD!' : 'Copy Notion MD'}
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-studio-700 bg-white dark:bg-studio-900 hover:bg-slate-50 text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download .md file for Notion import"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              <span>.md</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCSV}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-studio-700 bg-white dark:bg-studio-900 hover:bg-slate-50 text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download .csv file for Notion Database import"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>.csv</span>
            </button>

            <button
              type="button"
              onClick={handlePushToNotion}
              disabled={notionPushStatus.loading}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-60 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{notionPushStatus.loading ? 'Pushing...' : 'Push to Notion API'}</span>
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {notionPushStatus.message && (
          <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between font-semibold border ${
            notionPushStatus.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
          }`}>
            <span className="flex items-center gap-1.5">
              {notionPushStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
              {notionPushStatus.message}
            </span>
            {notionPushStatus.pageUrl && (
              <a
                href={notionPushStatus.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] underline flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"
              >
                <span>Open Page in Notion</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Metadata Overview Grid */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl border text-xs ${
        isLight ? 'bg-amber-50/50 border-amber-200/60' : 'bg-studio-950/60 border-studio-800'
      }`}>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estimated Time</span>
          <div className="font-bold flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" /> {mission.estimatedTime}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Difficulty</span>
          <div className="font-bold flex items-center gap-0.5 text-amber-500 mt-0.5">
            {Array.from({ length: mission.difficultyStars }).map((_, i) => (
              <Star key={i} className="w-3.5 h-3.5 fill-amber-500" />
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Subject Tags</span>
          <div className="font-semibold flex flex-wrap gap-1 mt-0.5">
            {mission.subjectTags.map((tag, idx) => (
              <span key={idx} className="bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded text-[10px]">{tag}</span>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Skills</span>
          <div className="font-semibold flex flex-wrap gap-1 mt-0.5">
            {mission.skillsLearned.map((skill, idx) => (
              <span key={idx} className="bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded text-[10px]">{skill}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Mission Objective */}
      <div className="space-y-3">
        <h2 className="font-serif-title text-xl font-bold flex items-center gap-2 text-amber-500">
          <Target className="w-5 h-5" /> Mission Objective
        </h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-studio-200">
          {mission.objective}
        </p>
      </div>

      {/* Why This Matters */}
      <div className="space-y-3">
        <h2 className="font-serif-title text-xl font-bold flex items-center gap-2 text-amber-500">
          <Lightbulb className="w-5 h-5" /> Why This Matters
        </h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-studio-200">
          {mission.whyThisMatters}
        </p>
      </div>

      {/* Setup Requirements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-4 rounded-2xl border text-xs space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-studio-950 border-studio-800'}`}>
          <span className="font-bold text-amber-500 flex items-center gap-1.5">
            <Shield className="w-4 h-4" /> Gear
          </span>
          <p className="text-slate-600 dark:text-studio-300">{mission.gearNeeded}</p>
        </div>

        <div className={`p-4 rounded-2xl border text-xs space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-studio-950 border-studio-800'}`}>
          <span className="font-bold text-amber-500 flex items-center gap-1.5">
            <Camera className="w-4 h-4" /> Camera Setup
          </span>
          <p className="text-slate-600 dark:text-studio-300">{mission.cameraSetup}</p>
        </div>

        <div className={`p-4 rounded-2xl border text-xs space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-studio-950 border-studio-800'}`}>
          <span className="font-bold text-amber-500 flex items-center gap-1.5">
            <Zap className="w-4 h-4" /> Flash Setup
          </span>
          <p className="text-slate-600 dark:text-studio-300">{mission.flashSetup}</p>
        </div>
      </div>

      {/* Step-by-Step Edit / Shooting Plan with Interactive Checkboxes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif-title text-xl font-bold flex items-center gap-2 text-amber-500">
            <Layers className="w-5 h-5" /> Step-by-Step Interactive Plan
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            {completedStepIndices.length} / {mission.steps.length} Steps Completed
          </span>
        </div>

        <div className="space-y-3">
          {mission.steps.map((step, idx) => {
            const isDone = completedStepIndices.includes(idx);
            return (
              <div
                key={idx}
                onClick={() => toggleStepCompleted(idx)}
                className={`p-4 rounded-2xl border space-y-2 transition-all cursor-pointer ${
                  isDone
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-900 dark:text-white'
                    : isLight
                      ? 'bg-slate-50/80 border-slate-200/80 hover:border-amber-300'
                      : 'bg-studio-950/80 border-studio-800 hover:border-studio-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2.5">
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400 shrink-0" />
                    )}
                    <span className={isDone ? 'line-through text-slate-500' : ''}>{step.title}</span>
                  </h3>
                </div>

                <p className="text-xs text-slate-700 dark:text-studio-300 leading-relaxed pl-7">
                  {step.instruction}
                </p>
                {step.tryValues && (
                  <div className="pl-7 text-xs font-mono text-amber-600 dark:text-amber-400">
                    <span className="font-sans font-semibold">Try:</span> {step.tryValues}
                  </div>
                )}
                {step.watchFor && (
                  <div className="pl-7 text-xs text-slate-500 dark:text-studio-400 italic">
                    <span>💡 Watch:</span> {step.watchFor}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightroom & Photoshop Workflow Flowchart (Matching PDF 2) */}
      <div className={`p-6 rounded-2xl border space-y-3 ${isLight ? 'bg-amber-50/40 border-amber-200/80' : 'bg-studio-950 border-studio-800'}`}>
        <h2 className="font-serif-title text-lg font-bold text-amber-500 flex items-center gap-2">
          💻 Lightroom & Photoshop Recommended Workflow Sequence
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {defaultWorkflowSteps.map((stepName, idx) => (
            <React.Fragment key={idx}>
              <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-studio-900 border border-slate-200 dark:border-studio-700 shadow-sm">
                {stepName}
              </span>
              {idx < defaultWorkflowSteps.length - 1 && (
                <ArrowDown className="w-3.5 h-3.5 text-amber-500 -rotate-90 shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Version A vs Version B Challenge */}
      <div className="space-y-4">
        <h2 className="font-serif-title text-xl font-bold flex items-center gap-2 text-amber-500">
          <Star className="w-5 h-5" /> Creative Challenge Options
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-2xl border space-y-2 ${isLight ? 'bg-amber-50/60 border-amber-200' : 'bg-studio-950 border-studio-800'}`}>
            <h3 className="font-bold text-sm text-amber-600">{mission.versionA.title}</h3>
            <p className="text-xs text-slate-600 dark:text-studio-300">{mission.versionA.description}</p>
            <ul className="text-xs space-y-1 list-disc list-inside text-slate-700 dark:text-studio-200">
              {mission.versionA.bulletPoints.map((bp, idx) => (
                <li key={idx}>{bp}</li>
              ))}
            </ul>
          </div>

          <div className={`p-4 rounded-2xl border space-y-2 ${isLight ? 'bg-sky-50/60 border-sky-200' : 'bg-studio-950 border-studio-800'}`}>
            <h3 className="font-bold text-sm text-sky-600 dark:text-sky-400">{mission.versionB.title}</h3>
            <p className="text-xs text-slate-600 dark:text-studio-300">{mission.versionB.description}</p>
            <ul className="text-xs space-y-1 list-disc list-inside text-slate-700 dark:text-studio-200">
              {mission.versionB.bulletPoints.map((bp, idx) => (
                <li key={idx}>{bp}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Portfolio Selection Box (Matching PDF 2) */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
        isPortfolioSaved
          ? 'bg-emerald-500/10 border-emerald-500/40'
          : isLight ? 'bg-slate-50 border-slate-200' : 'bg-studio-950 border-studio-800'
      }`}>
        <div>
          <h4 className="font-bold text-xs uppercase tracking-wider text-amber-500">Portfolio Selection</h4>
          <p className="text-xs text-slate-600 dark:text-studio-300">
            Choose ONE final edit version that makes you stop and look at it longer. Link back to: <span className="font-bold">{mission.title}</span>.
          </p>
        </div>

        <button
          onClick={() => setIsPortfolioSaved(!isPortfolioSaved)}
          className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
            isPortfolioSaved
              ? 'bg-emerald-500 text-black shadow-md'
              : 'bg-amber-500 hover:bg-amber-400 text-black shadow-md'
          }`}
        >
          {isPortfolioSaved ? '✓ Added to Portfolio' : 'Select for Portfolio'}
        </button>
      </div>

      {/* Field Notes & Technical Corner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200/60 dark:border-studio-800">
        <div className="space-y-2">
          <h3 className="font-serif-title font-bold text-base flex items-center gap-2 text-amber-500">
            <HelpCircle className="w-4 h-4" /> Field Notes / Reflection
          </h3>
          <ul className="text-xs space-y-1.5 text-slate-600 dark:text-studio-300 list-disc list-inside">
            {mission.fieldNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="font-serif-title font-bold text-base flex items-center gap-2 text-amber-500">
            <BookOpen className="w-4 h-4" /> Technical Corner: {mission.technicalCornerTitle}
          </h3>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-studio-300">
            {mission.technicalCornerText}
          </p>
        </div>
      </div>
    </div>
  );
};
