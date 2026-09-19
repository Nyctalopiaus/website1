import React from 'react';
import { BookOpen, UploadCloud, Award, Sliders, MessageSquareText, Sparkles, Compass, MapPin } from 'lucide-react';
import { BackgroundTheme } from '../types';

export type TabType = 'challenges' | 'expeditions' | 'field_guide' | 'studio' | 'grades' | 'software_guide' | 'chat';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  gradedCount: number;
  theme?: BackgroundTheme;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, gradedCount, theme = 'natural-daylight' }) => {
  const isLight = theme !== 'studio-dark';

  const navItems = [
    {
      id: 'challenges' as TabType,
      label: 'Photo Challenges',
      shortLabel: 'Challenges',
      icon: BookOpen,
      badge: null,
      desc: 'Assignment Curriculum'
    },
    {
      id: 'expeditions' as TabType,
      label: 'Expedition Plans',
      shortLabel: 'Expeditions',
      icon: MapPin,
      badge: null,
      desc: 'Curriculum Roadmap'
    },
    {
      id: 'field_guide' as TabType,
      label: 'Field Guide',
      shortLabel: 'Field Guide',
      icon: Compass,
      badge: null,
      desc: 'Camera Baselines & Cheat Sheet'
    },
    {
      id: 'studio' as TabType,
      label: 'Grading Studio',
      shortLabel: 'Studio',
      icon: UploadCloud,
      badge: null,
      desc: 'Submit & Compare Edits'
    },
    {
      id: 'grades' as TabType,
      label: 'Report Cards',
      shortLabel: 'Grades',
      icon: Award,
      badge: gradedCount > 0 ? gradedCount : null,
      desc: 'Prof. ISO Critiques'
    },
    {
      id: 'software_guide' as TabType,
      label: 'Software Lookup',
      shortLabel: 'Guide',
      icon: Sliders,
      badge: null,
      desc: 'Shortcuts & Tool Paths'
    },
    {
      id: 'chat' as TabType,
      label: 'Ask Prof. ISO',
      shortLabel: 'Chat',
      icon: MessageSquareText,
      badge: null,
      desc: 'Camera Specs Assistant'
    }
  ];



  return (
    <>
    {/* Mobile: a thumb-reachable bottom tab bar, so the catalog/content isn't
        buried below a full nav list on a phone — and it's what a student
        actually wants reachable one-handed out in the field. */}
    <nav
      className={`md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-xl flex items-stretch transition-colors ${
        isLight ? 'bg-white/90 border-amber-200/70' : 'bg-zinc-950/90 border-zinc-800'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold transition-colors ${
              isActive ? 'text-amber-500' : isLight ? 'text-slate-500' : 'text-zinc-500'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="leading-none">{item.shortLabel}</span>
            {item.badge !== null && (
              <span className="absolute top-1 right-[24%] min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[9px] font-extrabold flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>

    {/* Tablet / desktop: the full vertical nav with descriptions */}
    <aside className={`hidden md:flex md:w-64 border-r p-4 shrink-0 md:h-full overflow-y-auto flex-col justify-between backdrop-blur-xl transition-colors ${
      isLight ? 'bg-white/70 border-amber-200/60 text-slate-900' : 'bg-zinc-950/70 border-zinc-800 text-zinc-100'
    }`}>
      <div className="space-y-1.5">
        <div className={`px-3 py-2 text-[11px] font-bold uppercase tracking-widest ${
          isLight ? 'text-slate-400' : 'text-zinc-500'
        }`}>
          Studio Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold transition-all group ${
                isActive
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-bold'
                  : isLight
                    ? 'text-slate-700 hover:bg-amber-50/80 hover:text-slate-900'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-900/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-black text-amber-400'
                    : isLight
                      ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-100'
                      : 'bg-zinc-900 text-amber-400 group-hover:bg-zinc-800'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div>{item.label}</div>
                  <div className={`text-[10px] ${
                    isActive
                      ? 'text-zinc-900 font-medium'
                      : isLight
                        ? 'text-slate-500'
                        : 'text-zinc-500'
                  }`}>
                    {item.desc}
                  </div>
                </div>
              </div>
              {item.badge !== null && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                  isActive ? 'bg-black text-amber-400' : 'bg-amber-500 text-black'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={`mt-8 pt-4 border-t px-3 text-xs ${
        isLight ? 'border-amber-200/60 text-slate-600' : 'border-zinc-900 text-zinc-400'
      }`}>
        <div className="flex items-center gap-2 font-bold mb-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Art School Methodology</span>
        </div>
        <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
          Combine camera hardware specs with non-destructive photo editing for professional results.
        </p>
      </div>
    </aside>
    </>
  );
};
