import React, { useState } from 'react';
import { Camera, Sliders, Info, RotateCcw, X, Lock, Unlock, Image as ImageIcon, Sparkles, Sun, Eye, CheckCircle2, Target } from 'lucide-react';

interface ExposureTriangleSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  isLight?: boolean;
}

interface SceneConfig {
  id: string;
  label: string;
  url: string;
  mask: string;
  targetEv: number;
  ideal: {
    aperture: number;
    shutterSpeed: number;
    iso: number;
    label: string;
    reason: string;
  };
}

const SCENES: SceneConfig[] = [
  {
    id: 'landscape',
    label: '🏔️ Outdoor Landscape',
    url: 'backgrounds/bg-golden-landscape.jpg',
    mask: 'radial-gradient(ellipse 50% 60% at 20% 75%, black 35%, transparent 75%)',
    targetEv: 13.96,
    ideal: {
      aperture: 8.0,
      shutterSpeed: 1 / 250,
      iso: 100,
      label: 'f/8.0 · 1/250s · ISO 100',
      reason: 'Deep focus (f/8) keeps mountains sharp with zero sensor noise (ISO 100).'
    }
  },
  {
    id: 'studio',
    label: '💡 Studio Setup',
    url: 'backgrounds/bg-studio.jpg',
    mask: 'radial-gradient(ellipse 50% 50% at 50% 50%, black 40%, transparent 80%)',
    targetEv: 9.29,
    ideal: {
      aperture: 2.8,
      shutterSpeed: 1 / 160,
      iso: 200,
      label: 'f/2.8 · 1/160s · ISO 200',
      reason: 'Soft background blur isolates the subject with standard studio flash sync speed.'
    }
  },
  {
    id: 'vintage',
    label: '📷 Vintage Gear',
    url: 'backgrounds/bg-vintage.jpg',
    mask: 'radial-gradient(ellipse 50% 60% at 45% 55%, black 40%, transparent 80%)',
    targetEv: 11.66,
    ideal: {
      aperture: 1.8,
      shutterSpeed: 1 / 1000,
      iso: 100,
      label: 'f/1.8 · 1/1000s · ISO 100',
      reason: 'Ultra-shallow depth of field creates vintage creamy bokeh while fast shutter controls light.'
    }
  }
];

export const ExposureTriangleSimulator: React.FC<ExposureTriangleSimulatorProps> = ({ isOpen, onClose, isLight = true }) => {
  const [aperture, setAperture] = useState<number>(8.0); // Default to landscape target
  const [shutterSpeed, setShutterSpeed] = useState<number>(1 / 250); // Default 1/250s
  const [iso, setIso] = useState<number>(100); // Default ISO 100
  const [activeScene, setActiveScene] = useState<string>('landscape');
  const [isAutoEv, setIsAutoEv] = useState<boolean>(false);

  if (!isOpen) return null;

  // Aperture steps
  const apertureSteps = [1.4, 1.8, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0, 22.0];
  // Shutter steps (in seconds)
  const shutterSteps = [
    { label: '1/4000s', value: 1 / 4000 },
    { label: '1/2000s', value: 1 / 2000 },
    { label: '1/1000s', value: 1 / 1000 },
    { label: '1/500s', value: 1 / 500 },
    { label: '1/250s', value: 1 / 250 },
    { label: '1/125s', value: 1 / 125 },
    { label: '1/60s', value: 1 / 60 },
    { label: '1/30s', value: 1 / 30 },
    { label: '1/4s', value: 1 / 4 },
    { label: '1s', value: 1 }
  ];
  // ISO steps
  const isoSteps = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];

  const currentSceneObj = SCENES.find((s) => s.id === activeScene) || SCENES[0];

  // Check if current user settings match the active scene's ideal setup
  const isMatchIdeal =
    aperture === currentSceneObj.ideal.aperture &&
    Math.abs(shutterSpeed - currentSceneObj.ideal.shutterSpeed) < 0.0001 &&
    iso === currentSceneObj.ideal.iso;

  // Switch scene and apply its ideal settings
  const handleSelectScene = (sceneId: string) => {
    setActiveScene(sceneId);
    const targetScene = SCENES.find((s) => s.id === sceneId);
    if (targetScene) {
      setAperture(targetScene.ideal.aperture);
      setShutterSpeed(targetScene.ideal.shutterSpeed);
      setIso(targetScene.ideal.iso);
    }
  };

  // Helper for Auto-EV Shutter calculation
  const getAutoShutterSpeed = (newAperture: number, newIso: number) => {
    const targetT = (newAperture * newAperture * 100) / (2048 * newIso);
    let closest = shutterSteps[0];
    let minDiff = Math.abs(shutterSteps[0].value - targetT);
    for (let i = 1; i < shutterSteps.length; i++) {
      const diff = Math.abs(shutterSteps[i].value - targetT);
      if (diff < minDiff) {
        minDiff = diff;
        closest = shutterSteps[i];
      }
    }
    return closest.value;
  };

  // Handlers with Auto-EV Lock
  const handleApertureChange = (newAperture: number) => {
    setAperture(newAperture);
    if (isAutoEv) {
      const autoT = getAutoShutterSpeed(newAperture, iso);
      setShutterSpeed(autoT);
    }
  };

  const handleIsoChange = (newIso: number) => {
    setIso(newIso);
    if (isAutoEv) {
      const autoT = getAutoShutterSpeed(aperture, newIso);
      setShutterSpeed(autoT);
    }
  };

  const handleShutterChange = (newShutter: number) => {
    setShutterSpeed(newShutter);
    if (isAutoEv) {
      const targetF = Math.sqrt((newShutter * 2048 * iso) / 100);
      let closestF = apertureSteps[0];
      let minDiff = Math.abs(apertureSteps[0] - targetF);
      for (let i = 1; i < apertureSteps.length; i++) {
        const diff = Math.abs(apertureSteps[i] - targetF);
        if (diff < minDiff) {
          minDiff = diff;
          closestF = apertureSteps[i];
        }
      }
      setAperture(closestF);
    }
  };

  // Preset Handlers
  const applyPreset = (preset: 'portrait' | 'landscape' | 'astro' | 'action') => {
    switch (preset) {
      case 'portrait':
        setAperture(1.8);
        setShutterSpeed(1 / 1000);
        setIso(100);
        break;
      case 'landscape':
        setAperture(8.0);
        setShutterSpeed(1 / 250);
        setIso(100);
        break;
      case 'astro':
        setAperture(2.8);
        setShutterSpeed(1);
        setIso(3200);
        break;
      case 'action':
        setAperture(4.0);
        setShutterSpeed(1 / 2000);
        setIso(400);
        break;
    }
  };

  const applyIdealForScene = () => {
    setAperture(currentSceneObj.ideal.aperture);
    setShutterSpeed(currentSceneObj.ideal.shutterSpeed);
    setIso(currentSceneObj.ideal.iso);
  };

  // Visual simulation calculations:
  // Aperture depth of field calculation: f/8.0 and narrower (f/8-f/22) produce deep focus (0px background blur).
  // f/1.4 to f/5.6 produce progressively shallower depth of field (creamy background blur).
  const getBlurAmount = (fStop: number) => {
    if (fStop >= 8.0) return 0;
    if (fStop === 5.6) return 0.8;
    if (fStop === 4.0) return 2.2;
    if (fStop === 2.8) return 5.5;
    if (fStop === 1.8) return 9.0;
    if (fStop === 1.4) return 13.5;
    return Math.max(0, (8.0 - fStop) * 2.0);
  };
  const apertureIndex = apertureSteps.indexOf(aperture);
  const blurAmount = getBlurAmount(aperture);

  const shutterIndex = shutterSteps.findIndex((s) => Math.abs(s.value - shutterSpeed) < 0.0001);
  const motionBlurAmount = Math.max(0, (shutterIndex - 3) * 1.2);

  // EV = log2(f^2 / t) - log2(ISO/100)
  const evValue = Math.log2((aperture * aperture) / shutterSpeed) - Math.log2(iso / 100);
  const sceneTargetEv = currentSceneObj.targetEv || 13.96;
  const evDiff = evValue - sceneTargetEv; // 0 = balanced, >0 = underexposed (less light), <0 = overexposed (more light)

  const brightnessFilter = Math.min(2.2, Math.max(0.25, Math.pow(2, -evDiff * 0.45)));

  const isoIndex = isoSteps.indexOf(iso);
  const grainOpacity = Math.min(0.6, (isoIndex / (isoSteps.length - 1)) * 0.5);

  // Lightmeter calculation (-3 to +3 EV)
  const meterValue = Math.max(-3, Math.min(3, -evDiff));
  const meterPercentage = ((meterValue + 3) / 6) * 100;

  const resetControls = () => {
    setAperture(8.0);
    setShutterSpeed(1 / 250);
    setIso(100);
    setIsAutoEv(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className={`rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-lg font-bold font-serif-title">Interactive Exposure Triangle Simulator</h3>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                Master Aperture, Shutter Speed, and ISO in real-time
              </p>
            </div>
          </div>

          {/* Scene Switcher Buttons */}
          <div className="flex items-center gap-1.5 bg-black/10 p-1 rounded-2xl border border-slate-200/50 dark:border-zinc-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> Select Scene:
            </span>
            {SCENES.map((sc) => (
              <button
                key={sc.id}
                onClick={() => handleSelectScene(sc.id)}
                className={`text-xs px-3 py-1 rounded-xl font-semibold transition-all cursor-pointer ${
                  activeScene === sc.id
                    ? 'bg-amber-500 text-black font-bold shadow-md'
                    : isLight
                      ? 'text-slate-700 hover:bg-slate-200'
                      : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scene Ideal Recommendation Banner */}
        <div className={`px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs ${
          isMatchIdeal
            ? isLight
              ? 'bg-emerald-100 border-emerald-300 text-emerald-950 font-bold'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 font-bold'
            : isLight
              ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold'
              : 'bg-zinc-950 border-zinc-800 text-amber-300 font-bold'
        }`}>
          <div className="flex items-center gap-2">
            {isMatchIdeal ? (
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${isLight ? 'text-emerald-800' : 'text-emerald-300'}`} />
            ) : (
              <Target className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-800' : 'text-amber-400'}`} />
            )}
            <div>
              <span className="font-bold">
                {isMatchIdeal ? '✅ Perfect Setup Loaded:' : `🎯 Recommended for ${currentSceneObj.label}:`}
              </span>{' '}
              <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                isLight
                  ? 'bg-amber-200/90 text-amber-950 border-amber-400'
                  : 'bg-amber-500/30 text-amber-200 border-amber-500/50'
              }`}>
                {currentSceneObj.ideal.label}
              </span>
              <span className="ml-2 text-[11px] opacity-90 hidden sm:inline">— {currentSceneObj.ideal.reason}</span>
            </div>
          </div>

          {!isMatchIdeal && (
            <button
              onClick={applyIdealForScene}
              className="text-[11px] font-bold bg-amber-500 text-black px-3 py-1 rounded-lg hover:bg-amber-400 transition-colors shadow-sm cursor-pointer shrink-0"
            >
              Apply Recommended Setup
            </button>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[75vh] overflow-y-auto">
          {/* Left Column: Viewfinder & Presets */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[4/3] shadow-inner group">
              {/* Simulated Background Layer (Bokeh / Aperture Blur) */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-300"
                style={{
                  backgroundImage: `url('${currentSceneObj.url}')`,
                  filter: `blur(${blurAmount}px) brightness(${brightnessFilter})`
                }}
              />

              {/* Foreground Focused Subject Layer */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-300 pointer-events-none"
                style={{
                  backgroundImage: `url('${currentSceneObj.url}')`,
                  filter: `blur(${motionBlurAmount}px) brightness(${brightnessFilter})`,
                  WebkitMaskImage: currentSceneObj.mask,
                  maskImage: currentSceneObj.mask
                }}
              />

              {/* Digital Sensor ISO Grain Layer */}
              {grainOpacity > 0.05 && (
                <div
                  className="absolute inset-0 pointer-events-none bg-camera-dots-dark mix-blend-overlay"
                  style={{ opacity: grainOpacity }}
                />
              )}

              {/* Camera Viewfinder OSD Overlay */}
              <div className="absolute inset-0 border-[16px] border-black/40 pointer-events-none flex flex-col justify-between p-4 font-mono text-xs text-emerald-400">
                {/* Top OSD Bar */}
                <div className="flex items-center justify-between">
                  <span className="bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-zinc-800 text-amber-400 font-bold">
                    f/{aperture}
                  </span>
                  <span className="bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-zinc-800 text-amber-400 font-bold">
                    {shutterSteps.find((s) => Math.abs(s.value - shutterSpeed) < 0.0001)?.label}
                  </span>
                  <span className="bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-zinc-800 text-amber-400 font-bold">
                    ISO {iso}
                  </span>
                </div>

                {/* Center / Bottom OSD Bar: DSLR Lightmeter Scale & EV Readout */}
                <div className="flex flex-col items-center gap-2">
                  {/* Real Camera Lightmeter Bar (-3 to +3 EV) */}
                  <div className="flex flex-col items-center gap-1 bg-black/75 backdrop-blur-sm px-4 py-2 rounded-xl border border-zinc-800/80 shadow-lg">
                    <div className="flex items-center gap-3 font-mono text-[10px] tracking-widest text-zinc-400">
                      <span className="text-blue-400 font-bold">-3</span>
                      <span>-2</span>
                      <span>-1</span>
                      <span className="text-emerald-400 font-extrabold text-xs">0</span>
                      <span>+1</span>
                      <span>+2</span>
                      <span className="text-amber-400 font-bold">+3</span>
                    </div>
                    {/* Meter Needle Bar */}
                    <div className="relative w-40 h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-700">
                      <div className="absolute top-0 bottom-0 w-0.5 bg-emerald-500/50 left-1/2 -translate-x-1/2" />
                      <div
                        className="absolute top-0 bottom-0 w-2.5 rounded-full transition-all duration-300 -translate-x-1/2 shadow-sm"
                        style={{
                          left: `${meterPercentage}%`,
                          backgroundColor: Math.abs(evDiff) < 0.5 ? '#10b981' : evDiff > 0 ? '#60a5fa' : '#f59e0b'
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full">
                    <span className={`px-2.5 py-1 rounded-md font-bold bg-black/80 ${
                      Math.abs(evDiff) < 0.5
                        ? 'text-emerald-400 border border-emerald-500/40'
                        : evDiff > 0
                          ? 'text-blue-400 border border-blue-500/40'
                          : 'text-amber-400 border border-amber-500/40'
                    }`}>
                      {Math.abs(evDiff) < 0.5 ? 'EV ±0 (Balanced)' : evDiff > 0 ? `EV -${Math.abs(evDiff).toFixed(1)} (Underexposed)` : `EV +${Math.abs(evDiff).toFixed(1)} (Overexposed)`}
                    </span>

                    <span className="text-[10px] text-zinc-400 bg-black/50 px-2 py-0.5 rounded">Viewfinder OSD</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Presets & Toolbar */}
            <div className={`p-4 rounded-2xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold flex items-center gap-1.5 ${isLight ? 'text-slate-900' : 'text-amber-300'}`}>
                  <Sparkles className={`w-4 h-4 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} /> Quick Scenario Presets:
                </span>
                
                {/* Auto EV Lock Toggle */}
                <button
                  onClick={() => setIsAutoEv(!isAutoEv)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isAutoEv
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                      : isLight
                        ? 'bg-white text-slate-700 border-slate-300 hover:border-amber-400'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  {isAutoEv ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  Auto-EV Lock: {isAutoEv ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => applyPreset('portrait')}
                  className={`p-2 rounded-xl text-xs border font-semibold text-center hover:border-amber-500 transition-colors shadow-sm cursor-pointer ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  👤 Portrait (Bokeh)
                  <span className={`block text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>f/1.8 · 1/1000s</span>
                </button>
                <button
                  onClick={() => applyPreset('landscape')}
                  className={`p-2 rounded-xl text-xs border font-semibold text-center hover:border-amber-500 transition-colors shadow-sm cursor-pointer ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  🏔️ Landscape
                  <span className={`block text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>f/8.0 · 1/250s</span>
                </button>
                <button
                  onClick={() => applyPreset('astro')}
                  className={`p-2 rounded-xl text-xs border font-semibold text-center hover:border-amber-500 transition-colors shadow-sm cursor-pointer ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  🌌 Night Astro
                  <span className={`block text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>f/2.8 · 1s · ISO 3200</span>
                </button>
                <button
                  onClick={() => applyPreset('action')}
                  className={`p-2 rounded-xl text-xs border font-semibold text-center hover:border-amber-500 transition-colors shadow-sm cursor-pointer ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  🏃 Fast Action
                  <span className={`block text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>f/4.0 · 1/2000s</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                  {isAutoEv ? '🔒 Auto-EV enabled: Changing controls automatically balances shutter speed.' : '💡 Adjust sliders freely to see EV changes.'}
                </span>
                <button
                  onClick={resetControls}
                  className={`text-[11px] font-bold hover:underline flex items-center gap-1 shrink-0 cursor-pointer ${
                    isLight ? 'text-amber-900 hover:text-amber-950' : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <RotateCcw className="w-3 h-3" /> Reset Controls
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Sliders & Professor Analysis */}
          <div className="lg:col-span-5 space-y-5">
            {/* 1. Aperture Slider */}
            <div className={`p-4 rounded-2xl border space-y-2 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className={`flex items-center gap-1 ${isLight ? 'text-slate-900' : 'text-amber-300'}`}>
                  <Eye className="w-4 h-4 text-amber-500" /> 1. Aperture (f-stop)
                </span>
                <span className={`font-mono text-sm px-2.5 py-0.5 rounded border font-bold ${
                  isLight
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                }`}>
                  f/{aperture}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={apertureSteps.length - 1}
                value={apertureIndex}
                onChange={(e) => handleApertureChange(apertureSteps[parseInt(e.target.value)])}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className={`flex justify-between text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                <span>f/1.4 (Blur/Bokeh)</span>
                <span>f/22 (Sharp Landscape)</span>
              </div>
            </div>

            {/* 2. Shutter Speed Slider */}
            <div className={`p-4 rounded-2xl border space-y-2 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className={`flex items-center gap-1 ${isLight ? 'text-slate-900' : 'text-amber-300'}`}>
                  <Sliders className="w-4 h-4 text-amber-500" /> 2. Shutter Speed
                </span>
                <span className={`font-mono text-sm px-2.5 py-0.5 rounded border font-bold ${
                  isLight
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                }`}>
                  {shutterSteps.find((s) => Math.abs(s.value - shutterSpeed) < 0.0001)?.label}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={shutterSteps.length - 1}
                value={shutterIndex}
                onChange={(e) => handleShutterChange(shutterSteps[parseInt(e.target.value)].value)}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className={`flex justify-between text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                <span>1/4000s (Freeze Motion)</span>
                <span>1s (Motion Blur)</span>
              </div>
            </div>

            {/* 3. ISO Sensitivity Slider */}
            <div className={`p-4 rounded-2xl border space-y-2 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950 border-zinc-800'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className={`flex items-center gap-1 ${isLight ? 'text-slate-900' : 'text-amber-300'}`}>
                  <Sun className="w-4 h-4 text-amber-500" /> 3. ISO Sensitivity
                </span>
                <span className={`font-mono text-sm px-2.5 py-0.5 rounded border font-bold ${
                  isLight
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                }`}>
                  ISO {iso}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={isoSteps.length - 1}
                value={isoIndex}
                onChange={(e) => handleIsoChange(isoSteps[parseInt(e.target.value)])}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className={`flex justify-between text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                <span>100 (Clean Sensor)</span>
                <span>25600 (High Noise)</span>
              </div>
            </div>

            {/* Professor ISO's Real-Time Critique */}
            <div className={`p-4 rounded-2xl border space-y-1.5 text-xs ${
              isLight
                ? 'bg-amber-100/70 border-amber-300 text-slate-900'
                : 'bg-amber-500/10 border-amber-500/30 text-zinc-100'
            }`}>
              <span className={`font-bold uppercase tracking-wider block text-[10px] ${
                isLight ? 'text-amber-950' : 'text-amber-300'
              }`}>
                👨‍🏫 Prof. ISO's Exposure Analysis:
              </span>
              <p className="leading-relaxed">
                {aperture <= 2.8 && "Wide aperture (f/1.4 - f/2.8) yields shallow depth of field for portrait isolation. "}
                {aperture >= 8 && "Narrow aperture (f/8 - f/16) keeps foreground and background sharp. "}
                {aperture > 2.8 && aperture < 8 && "Moderate aperture (f/4 - f/5.6) offers balanced sharpness for general subjects. "}
                {shutterSpeed <= 1 / 1000 && "Fast shutter speed freezes rapid motion cleanly. "}
                {shutterSpeed >= 1 / 30 && "Slow shutter speed risks camera shake unless on a tripod! "}
                {shutterSpeed > 1 / 1000 && shutterSpeed < 1 / 30 && "Standard shutter speed for steady handheld shots. "}
                {iso >= 3200 && "High ISO introduces digital sensor grain noise. "}
                {iso <= 200 && "Low ISO ensures pristine sensor clarity with zero noise."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
