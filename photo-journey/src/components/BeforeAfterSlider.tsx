import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SlidersHorizontal, Columns, ZoomIn, Eye } from 'lucide-react';
import { ZoomLoupe } from './ZoomLoupe';

interface BeforeAfterSliderProps {
  originalImage: string;
  editedImage: string;
  originalLabel?: string;
  editedLabel?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  originalImage,
  editedImage,
  originalLabel = 'Original Photo',
  editedLabel = 'Graded Edit'
}) => {
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side' | 'loupe'>('slider');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  }, [isDragging, handleMove]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  }, [isDragging, handleMove]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  return (
    <div className="space-y-3">
      {/* View Mode Switcher Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-amber-400" />
          Comparison Inspector Mode:
        </span>
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs">
          <button
            onClick={() => setViewMode('slider')}
            className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'slider' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Drag Slider
          </button>
          <button
            onClick={() => setViewMode('side-by-side')}
            className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'side-by-side' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5" /> Side-by-Side
          </button>
          <button
            onClick={() => setViewMode('loupe')}
            className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'loupe' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" /> Loupe Lens 2.5x
          </button>
        </div>
      </div>

      {/* MODE A: Interactive Drag Slider */}
      {viewMode === 'slider' && (
        <div
          ref={containerRef}
          className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 select-none group cursor-ew-resize shadow-2xl"
          onMouseDown={(e) => {
            setIsDragging(true);
            handleMove(e.clientX);
          }}
          onTouchStart={(e) => {
            setIsDragging(true);
            handleMove(e.touches[0].clientX);
          }}
        >
          <img
            src={originalImage}
            alt="Original Photo"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />
          <div className="absolute top-4 left-4 bg-zinc-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider text-zinc-300 border border-zinc-800 pointer-events-none shadow-md">
            {originalLabel}
          </div>

          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)` }}
          >
            <img
              src={editedImage}
              alt="Edited Photo"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
            <div className="absolute top-4 right-4 bg-amber-500 text-black backdrop-blur-md px-3 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider shadow-lg pointer-events-none">
              {editedLabel}
            </div>
          </div>

          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.8)] pointer-events-none"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-amber-400 text-black shadow-2xl flex items-center justify-center border-2 border-white transform transition-transform group-hover:scale-110">
              <SlidersHorizontal className="w-4 h-4 stroke-[2.5]" />
            </div>
          </div>
        </div>
      )}

      {/* MODE B: Side by Side Grid */}
      {viewMode === 'side-by-side' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-xl">
            <img src={originalImage} alt="Original" className="w-full h-full object-contain" />
            <div className="absolute top-3 left-3 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-bold text-zinc-300 border border-zinc-800">
              {originalLabel}
            </div>
          </div>
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-950 border border-amber-500/50 shadow-xl">
            <img src={editedImage} alt="Edited" className="w-full h-full object-contain" />
            <div className="absolute top-3 right-3 bg-amber-500 text-black font-extrabold px-2.5 py-1 rounded-lg text-[11px]">
              {editedLabel}
            </div>
          </div>
        </div>
      )}

      {/* MODE C: Zoom Loupe Magnifier */}
      {viewMode === 'loupe' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-zinc-400 block px-1">Original Photo:</span>
            <ZoomLoupe imageUrl={originalImage} alt={originalLabel} className="aspect-[4/3] rounded-2xl border border-zinc-800 bg-zinc-950" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-amber-400 block px-1">Graded Edit:</span>
            <ZoomLoupe imageUrl={editedImage} alt={editedLabel} className="aspect-[4/3] rounded-2xl border border-amber-500/50 bg-zinc-950" />
          </div>
        </div>
      )}
    </div>
  );
};
