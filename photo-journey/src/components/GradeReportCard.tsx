import React from 'react';
import { StudentSubmission, Challenge } from '../types';
import { Award, CheckCircle2, AlertCircle, Sliders, ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { HistogramCanvas } from './HistogramCanvas';

interface GradeReportCardProps {
  submission: StudentSubmission;
  challenge: Challenge;
  isLight?: boolean;
  recommendedChallenge?: Challenge;
  onSelectNextChallenge?: (challenge: Challenge) => void;
}

export const GradeReportCard: React.FC<GradeReportCardProps> = ({
  submission,
  challenge,
  isLight = true,
  recommendedChallenge,
  onSelectNextChallenge
}) => {
  const grade = submission.grade;
  if (!grade) return null;

  const getGradeColor = (letter: string) => {
    if (letter.startsWith('A')) return 'from-emerald-400 via-emerald-500 to-emerald-700 text-emerald-950 border-emerald-400/40';
    if (letter.startsWith('B')) return 'from-amber-400 via-amber-500 to-amber-700 text-amber-950 border-amber-400/40';
    return 'from-blue-400 via-blue-500 to-blue-700 text-blue-950 border-blue-400/40';
  };

  const cardClass = isLight ? 'bg-white/85 border-amber-100/80' : 'bg-zinc-900 border-zinc-800';
  const innerWellClass = isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800';
  const headingClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-zinc-400';
  const bodyClass = isLight ? 'text-slate-700' : 'text-zinc-300';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Grade Header Card */}
      <div className={`rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl border transition-colors ${cardClass}`}>
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b ${isLight ? 'border-slate-200' : 'border-zinc-800'}`}>
          <div>
            <span className="text-xs font-extrabold text-amber-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Official Art School Critique Report
            </span>
            <h2 className={`font-serif-title text-2xl sm:text-3xl font-bold mb-2 ${headingClass}`}>
              {challenge.title}
            </h2>
            <p className={`text-xs ${mutedClass}`}>
              Evaluated by Prof. ISO • Software: <strong className={headingClass}>{submission.softwareUsed}</strong> • Camera: <strong className={headingClass}>{submission.cameraUsed}</strong>
            </p>
          </div>

          {/* Big Grade Badge */}
          <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl border shadow-inner shrink-0 ${innerWellClass}`}>
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getGradeColor(grade.overallGrade)} font-serif-title text-3xl font-extrabold flex items-center justify-center shadow-2xl border`}>
              {grade.overallGrade}
            </div>
            <div>
              <div className={`text-2xl font-bold font-mono ${headingClass}`}>{grade.numericScore}<span className={`text-xs ${mutedClass}`}>/100</span></div>
              <div className="text-[11px] font-extrabold text-amber-500 uppercase tracking-wider">Overall Score</div>
            </div>
          </div>
        </div>

        {/* Professor Summary */}
        <div className="pt-6 space-y-2">
          <h3 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${mutedClass}`}>
            <Award className="w-4 h-4 text-amber-500" />
            Professor ISO's Summary Critique
          </h3>
          <p className={`text-xs sm:text-sm leading-relaxed italic p-5 rounded-2xl border font-serif shadow-inner ${bodyClass} ${innerWellClass}`}>
            "{grade.professorSummary}"
          </p>
        </div>
      </div>

      {/* Submission Image View */}
      <div className={`rounded-3xl p-6 shadow-2xl space-y-4 backdrop-blur-xl border transition-colors ${cardClass}`}>
        <h3 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${headingClass}`}>
          <Sliders className="w-4 h-4 text-amber-500" />
          Graded Photograph Submission
        </h3>
        {submission.originalImageBase64 ? (
          <BeforeAfterSlider
            originalImage={submission.originalImageBase64}
            editedImage={submission.editedImageBase64}
          />
        ) : (
          <div className="aspect-[16/10] rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800">
            <img src={submission.editedImageBase64} alt="Submission" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Live RGB Histogram for Graded Image */}
        <HistogramCanvas imageUrl={submission.editedImageBase64} isLight={isLight} />
      </div>

      {/* Rubric Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rubric Scores */}
        <div className={`rounded-3xl p-6 shadow-2xl space-y-4 backdrop-blur-xl border transition-colors ${cardClass}`}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500">
            Criteria Rubric Breakdown
          </h3>
          <div className="space-y-3">
            {grade.rubricScores.map((score, idx) => (
              <div key={idx} className={`p-3.5 rounded-xl border space-y-1.5 ${innerWellClass}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${headingClass}`}>{score.criterion}</span>
                  <span className="font-bold text-amber-500 font-mono">{score.score}/10</span>
                </div>
                <div className={`w-full h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`}>
                  <div
                    className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full transition-all"
                    style={{ width: `${(score.score / 10) * 100}%` }}
                  ></div>
                </div>
                <p className={`text-[11px] pt-0.5 ${mutedClass}`}>{score.feedback}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Strengths & Areas for Improvement */}
        <div className={`rounded-3xl p-6 shadow-2xl space-y-4 backdrop-blur-xl border transition-colors ${cardClass}`}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-500">
            Strengths & Actionable Critique
          </h3>

          <div className="space-y-3">
            <div className="bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20 space-y-2">
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Notable Strengths
              </span>
              <ul className={`text-xs space-y-1.5 pl-5 list-disc ${bodyClass}`}>
                {grade.strengths.map((str, i) => (
                  <li key={i}>{str}</li>
                ))}
              </ul>
            </div>

            <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20 space-y-2">
              <span className="text-xs font-bold text-amber-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Areas for Improvement
              </span>
              <ul className={`text-xs space-y-1.5 pl-5 list-disc ${bodyClass}`}>
                {grade.areasForImprovement.map((area, i) => (
                  <li key={i}>{area}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Software-Specific Guidance */}
      <div className={`rounded-3xl p-6 shadow-2xl space-y-4 backdrop-blur-xl border transition-colors ${cardClass}`}>
        <h3 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${headingClass}`}>
          <Sliders className="w-4 h-4 text-amber-500" />
          Professor's Action Steps for {submission.softwareUsed}
        </h3>
        <div className={`p-5 rounded-2xl border space-y-3 ${innerWellClass}`}>
          {grade.softwareSpecificTips.map((tip, idx) => (
            <div key={idx} className={`flex items-start gap-3 text-xs ${bodyClass}`}>
              <span className="bg-amber-500/20 text-amber-500 px-2.5 py-0.5 rounded-md font-mono font-bold text-[11px] shrink-0">
                Step {idx + 1}
              </span>
              <span className="leading-relaxed">{tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Next Assignment */}
      {recommendedChallenge && (
        <div className="rounded-3xl p-6 shadow-2xl backdrop-blur-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-700/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-extrabold text-amber-500 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Prof. ISO Recommends Next
            </span>
            <h4 className={`font-serif-title text-lg font-bold ${headingClass}`}>{recommendedChallenge.title}</h4>
            <p className={`text-xs mt-1 ${mutedClass}`}>{recommendedChallenge.level} • {recommendedChallenge.summary}</p>
          </div>
          <button
            onClick={() => onSelectNextChallenge?.(recommendedChallenge)}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-5 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <span>Start This Assignment</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
