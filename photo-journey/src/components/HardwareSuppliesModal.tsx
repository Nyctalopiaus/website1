import React, { useState, useMemo } from 'react';
import { X, Package, Check, ShieldCheck, Sparkles, Filter, Info, Wrench, Camera, HelpCircle } from 'lucide-react';
import { UserProfile, Challenge, CustomMission } from '../types';

interface HardwareSuppliesModalProps {
  userProfile: UserProfile;
  challenges: Challenge[];
  customMissions: CustomMission[];
  onSave: (updatedProfile: UserProfile) => void;
  onClose: () => void;
}

export interface StandardGearItem {
  id: string;
  name: string;
  category: 'support' | 'lighting' | 'optics' | 'maintenance';
  description: string;
  keywords: string[]; // keywords used for matching gearNeeded strings
}

export const STANDARD_GEAR_CATALOG: StandardGearItem[] = [
  {
    id: 'tripod',
    name: 'Sturdy Tripod',
    category: 'support',
    description: 'Essential for long exposure, night shots, astrophotography, panoramas, and macro focus stacking.',
    keywords: ['tripod', '3-pod']
  },
  {
    id: 'remote_shutter',
    name: 'Remote Shutter / Intervalometer',
    category: 'support',
    description: 'Prevents camera shake during long exposures and automates time-lapse or star trail sequences.',
    keywords: ['remote shutter', 'intervalometer', 'self-timer', 'remote']
  },
  {
    id: 'macro_rail',
    name: 'Macro Focus Rail',
    category: 'support',
    description: 'Enables ultra-precise millimeter movements for macro focus stacking depth of field.',
    keywords: ['macro focus rail', 'focus rail', 'geared focus rail', 'nodal slide']
  },
  {
    id: 'led_panel',
    name: 'Portable LED Panel / Continuous Light',
    category: 'lighting',
    description: 'Provides constant bi-color light for macro detail, portrait fills, and video key light.',
    keywords: ['led', 'continuous light', 'light source', 'single light', '2 lights', '3 light']
  },
  {
    id: 'speedlight',
    name: 'Speedlight / Off-Camera Flash',
    category: 'lighting',
    description: 'High-speed sync flash for freezing motion, overpowering bright sunlight, or studio portraiture.',
    keywords: ['speedlight', 'flash', 'strobe', 'e-ttl', 'i-ttl', 'manual flash']
  },
  {
    id: 'flash_trigger',
    name: 'Wireless Flash Trigger & Receiver',
    category: 'lighting',
    description: 'Fires speedlights off-camera via 2.4GHz radio signal for flexible lighting angles.',
    keywords: ['wireless trigger', 'trigger', 'transmitter', 'receiver', 'sync cord', 'hss support']
  },
  {
    id: 'light_stand',
    name: 'Light Stand & Flash Bracket',
    category: 'support',
    description: 'Holds off-camera flashes, LED panels, and softboxes securely at adjustable heights.',
    keywords: ['light stand', 'cold shoe', 'flash bracket', 's-bracket', 'stand']
  },
  {
    id: 'reflector_diffuser',
    name: 'Collapsible Reflector / Diffuser',
    category: 'lighting',
    description: 'Bounces fill light into shadows or softens harsh direct sun or raw flash for flattering portraits.',
    keywords: ['reflector', 'diffuser', 'poster board', 'bedsheet', 'shower curtain', 'bounce card']
  },
  {
    id: 'softbox_grid',
    name: 'Softbox / Grid / Snoot Modifier',
    category: 'lighting',
    description: 'Controls beam angle and softens flash shadows for moody key lighting or rim highlights.',
    keywords: ['softbox', 'grid', 'snoot', 'gobo', 'flags', 'v-flats', 'beauty dish', 'umbrella']
  },
  {
    id: 'color_gels',
    name: 'Flash Color Gels (CTO / CTB)',
    category: 'lighting',
    description: 'Color correction and creative gels to match ambient tungsten/golden hour or add accent colors.',
    keywords: ['gel', 'gels', 'cto', 'ctb', 'color gel']
  },
  {
    id: 'nd_filter',
    name: 'Neutral Density (ND) Filter (6 to 10-stop)',
    category: 'optics',
    description: 'Cuts light entering lens to allow slow shutter speeds in bright daylight (silky water/clouds).',
    keywords: ['nd filter', 'nd1000', '10-stop', '6-stop']
  },
  {
    id: 'cpl_filter',
    name: 'Circular Polarizing (CPL) Filter',
    category: 'optics',
    description: 'Removes unwanted reflections from water/glass and boosts sky blue & foliage saturation.',
    keywords: ['polarizing', 'cpl', 'polarizer']
  },
  {
    id: 'macro_tubes_rings',
    name: 'Extension Tubes / Macro Reversal Ring',
    category: 'optics',
    description: 'Budget-friendly accessories that reduce minimum focus distance for extreme close-ups.',
    keywords: ['extension tube', 'reversal ring', 'macro lens']
  },
  {
    id: 'microfiber_cloth',
    name: 'Micro-fiber Cleaning Cloth & Lens Pen',
    category: 'maintenance',
    description: 'Safe optical cleaning gear for smudges, dust, water drops, and front element care in the field.',
    keywords: ['cloth', 'cleaning', 'micro-fiber', 'microfiber', 'lens pen', 'blower']
  },
  {
    id: 'power_memory',
    name: 'Spare Batteries & High-Speed Memory Cards',
    category: 'maintenance',
    description: 'Crucial for long cold-weather night shoots, RAW burst sequences, and day-long field expeditions.',
    keywords: ['battery', 'memory card', 'sd card', 'power']
  }
];

export const HardwareSuppliesModal: React.FC<HardwareSuppliesModalProps> = ({
  userProfile,
  challenges,
  customMissions,
  onSave,
  onClose
}) => {
  const [ownedGear, setOwnedGear] = useState<string[]>(userProfile.ownedGear || []);
  const [customNotes, setCustomNotes] = useState<string>(userProfile.customGearNotes || '');
  const [activeTab, setActiveTab] = useState<'demand' | 'catalog' | 'notes'>('demand');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  // Extract physical gear requirements from all challenges and custom missions
  const aggregatedDemand = useMemo(() => {
    const demandMap: Map<string, { catItem: StandardGearItem; count: number; sources: string[] }> = new Map();

    STANDARD_GEAR_CATALOG.forEach(cat => {
      demandMap.set(cat.id, {
        catItem: cat,
        count: 0,
        sources: []
      });
    });

    const processGearString = (gearStr: string, sourceTitle: string) => {
      if (!gearStr) return;
      const lower = gearStr.toLowerCase();
      if (lower.includes('not needed') || lower.includes('standard camera') || lower === 'off') return;

      STANDARD_GEAR_CATALOG.forEach(cat => {
        const matches = cat.keywords.some(kw => lower.includes(kw));
        if (matches) {
          const entry = demandMap.get(cat.id)!;
          entry.count += 1;
          if (!entry.sources.includes(sourceTitle)) {
            entry.sources.push(sourceTitle);
          }
        }
      });
    };

    // Process static challenges
    challenges.forEach(c => {
      if (c.gearNeeded) processGearString(c.gearNeeded, c.title);
    });

    // Process custom AI missions
    customMissions.forEach(m => {
      if (m.gearNeeded) processGearString(m.gearNeeded, m.title);
      if (m.flashSetup) processGearString(m.flashSetup, m.title);
    });

    return Array.from(demandMap.values())
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [challenges, customMissions]);

  const toggleGearOwned = (gearId: string) => {
    setOwnedGear(prev =>
      prev.includes(gearId) ? prev.filter(id => id !== gearId) : [...prev, gearId]
    );
  };

  const handleSave = () => {
    onSave({
      ...userProfile,
      ownedGear,
      customGearNotes: customNotes
    });
    onClose();
  };

  const categoryLabels = {
    support: { label: 'Support & Stability', icon: '🔭' },
    lighting: { label: 'Lighting & Modifiers', icon: '💡' },
    optics: { label: 'Optics & Filters', icon: '🔍' },
    maintenance: { label: 'Field & Maintenance', icon: '🧼' }
  };

  const ownedCount = ownedGear.length;
  const totalCatalogCount = STANDARD_GEAR_CATALOG.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className={`rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border transition-colors flex flex-col max-h-[90vh] ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2 rounded-xl border border-amber-500/30">
              <Package className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-serif-title">Expedition Hardware & Supplies</h3>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-xs ${
                  isLight
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {ownedCount} / {totalCatalogCount} Owned
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                Check off gear you own so Prof. ISO AI can tailor assignments to your kit.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className={`px-6 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
          isLight ? 'bg-slate-100/60 border-slate-200' : 'bg-zinc-950/50 border-zinc-800'
        }`}>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('demand')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'demand'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : isLight ? 'text-slate-600 hover:bg-slate-200/60' : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Curriculum Demand ({aggregatedDemand.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'catalog'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : isLight ? 'text-slate-600 hover:bg-slate-200/60' : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Full Gear Checklist ({STANDARD_GEAR_CATALOG.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'notes'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : isLight ? 'text-slate-600 hover:bg-slate-200/60' : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>My Custom Gear Notes</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 grow">
          {/* TAB 1: CURRICULUM DEMAND */}
          {activeTab === 'demand' && (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                isLight ? 'bg-amber-50/70 border-amber-200 text-slate-700' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}>
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong>AI & Challenge Analysis:</strong> These items are automatically aggregated from all <strong>{challenges.length} course assignments</strong> and <strong>{customMissions.length} custom AI missions</strong>. Checking items off updates your profile in real-time.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aggregatedDemand.map(item => {
                  const isOwned = ownedGear.includes(item.catItem.id);
                  const catMeta = categoryLabels[item.catItem.category];

                  return (
                    <div
                      key={item.catItem.id}
                      onClick={() => toggleGearOwned(item.catItem.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                        isOwned
                          ? isLight
                            ? 'bg-amber-500/10 border-amber-400 text-slate-900 shadow-sm'
                            : 'bg-amber-500/15 border-amber-500/50 text-white shadow-sm'
                          : isLight
                            ? 'bg-slate-50 border-slate-200 hover:border-amber-300 text-slate-800'
                            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-200'
                      }`}
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        isOwned
                          ? 'bg-amber-500 border-amber-500 text-black'
                          : isLight ? 'border-slate-300 bg-white' : 'border-zinc-700 bg-zinc-900'
                      }`}>
                        {isOwned && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>

                      <div className="grow min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="text-xs font-bold leading-snug flex items-start gap-1.5 grow min-w-0">
                            <span className="shrink-0 mt-0.5">{catMeta.icon}</span>
                            <span className="break-words">{item.catItem.name}</span>
                          </h4>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 shadow-xs whitespace-nowrap ${
                            isLight
                              ? 'bg-amber-100 text-amber-950 border-amber-300'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            {item.count} {item.count === 1 ? 'assignment' : 'assignments'}
                          </span>
                        </div>
                        <p className={`text-[11px] leading-relaxed mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                          {item.catItem.description}
                        </p>
                        <p className={`text-[10px] font-mono mt-1.5 line-clamp-1 ${isLight ? 'text-slate-400' : 'text-zinc-500'}`}>
                          Needed in: {item.sources.slice(0, 3).join(', ')}{item.sources.length > 3 ? `, +${item.sources.length - 3} more` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: FULL GEAR CATALOG & INVENTORY */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
                    filterCategory === 'all'
                      ? 'bg-amber-500 text-black border-amber-400 font-bold'
                      : isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                  }`}
                >
                  All Categories
                </button>
                {Object.entries(categoryLabels).map(([catKey, catMeta]) => (
                  <button
                    key={catKey}
                    onClick={() => setFilterCategory(catKey)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1 ${
                      filterCategory === catKey
                        ? 'bg-amber-500 text-black border-amber-400 font-bold'
                        : isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    <span>{catMeta.icon}</span>
                    <span>{catMeta.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {STANDARD_GEAR_CATALOG
                  .filter(item => filterCategory === 'all' || item.category === filterCategory)
                  .map(item => {
                    const isOwned = ownedGear.includes(item.id);
                    const catMeta = categoryLabels[item.category];

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleGearOwned(item.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                          isOwned
                            ? isLight
                              ? 'bg-amber-500/10 border-amber-400 text-slate-900 shadow-sm'
                              : 'bg-amber-500/15 border-amber-500/50 text-white shadow-sm'
                            : isLight
                              ? 'bg-slate-50 border-slate-200 hover:border-amber-300 text-slate-800'
                              : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-200'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                          isOwned
                            ? 'bg-amber-500 border-amber-500 text-black'
                            : isLight ? 'border-slate-300 bg-white' : 'border-zinc-700 bg-zinc-900'
                        }`}>
                          {isOwned && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        <div className="grow min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <h4 className="text-xs font-bold leading-snug flex items-start gap-1.5 grow min-w-0">
                              <span className="shrink-0 mt-0.5">{catMeta.icon}</span>
                              <span className="break-words">{item.name}</span>
                            </h4>
                            {isOwned && (
                              <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 shrink-0 whitespace-nowrap">
                                Owned
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] leading-relaxed mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM GEAR NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                Add specific model numbers, filter sizes, tripod models, or special field equipment you own (e.g., <i>"Manfrotto 055 aluminum tripod, Peak Design 20L bag, K&F 77mm CPL filter, Godox V860III speedlight"</i>). Prof. ISO will consider these details when advising on field missions!
              </p>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                rows={6}
                placeholder="List your exact tripod models, filter thread sizes, flash models, macro accessories, or backup gear here..."
                className={`w-full border rounded-2xl p-4 text-xs font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-zinc-950 border-zinc-700 text-white'
                }`}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
              Saved to your local profile & synced with AI
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              Save Supplies & Gear Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
