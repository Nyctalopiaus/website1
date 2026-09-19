import React, { useEffect, useRef, useState } from 'react';
import { BarChart2, AlertCircle, Eye } from 'lucide-react';

interface HistogramCanvasProps {
  imageUrl?: string;
  isLight?: boolean;
}

export const HistogramCanvas: React.FC<HistogramCanvasProps> = ({ imageUrl, isLight = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [channel, setChannel] = useState<'rgb' | 'luminance' | 'red' | 'green' | 'blue'>('rgb');
  const [stats, setStats] = useState<{ mean: number; shadowClipping: number; highlightClipping: number } | null>(null);
  const [showClipping, setShowClipping] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!imageUrl) return;

    setLoading(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      const offCanvas = document.createElement('canvas');
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return;

      // Downsample for fast histogram calculation
      const width = 300;
      const height = Math.round((img.height / img.width) * 300) || 200;
      offCanvas.width = width;
      offCanvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      const rHist = new Array(256).fill(0);
      const gHist = new Array(256).fill(0);
      const bHist = new Array(256).fill(0);
      const lHist = new Array(256).fill(0);

      let totalLum = 0;
      let shadowClipped = 0;
      let highlightClipped = 0;
      const totalPixels = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

        rHist[r]++;
        gHist[g]++;
        bHist[b]++;
        lHist[lum]++;

        totalLum += lum;
        if (lum <= 5) shadowClipped++;
        if (lum >= 250) highlightClipped++;
      }

      setStats({
        mean: Math.round(totalLum / totalPixels),
        shadowClipping: Math.round((shadowClipped / totalPixels) * 100),
        highlightClipping: Math.round((highlightClipped / totalPixels) * 100)
      });

      // Draw Histogram on Visible Canvas
      const visCanvas = canvasRef.current;
      if (!visCanvas) return;
      const visCtx = visCanvas.getContext('2d');
      if (!visCtx) return;

      const cWidth = visCanvas.width;
      const cHeight = visCanvas.height;

      visCtx.clearRect(0, 0, cWidth, cHeight);

      // Max bin count for normalization
      let maxBin = 1;
      for (let i = 0; i < 256; i++) {
        if (channel === 'rgb' || channel === 'luminance') {
          maxBin = Math.max(maxBin, lHist[i], rHist[i], gHist[i], bHist[i]);
        } else if (channel === 'red') {
          maxBin = Math.max(maxBin, rHist[i]);
        } else if (channel === 'green') {
          maxBin = Math.max(maxBin, gHist[i]);
        } else if (channel === 'blue') {
          maxBin = Math.max(maxBin, bHist[i]);
        }
      }

      const drawChannel = (hist: number[], color: string, fillStyle?: string) => {
        visCtx.fillStyle = fillStyle || color;
        visCtx.strokeStyle = color;
        visCtx.beginPath();
        visCtx.moveTo(0, cHeight);

        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * cWidth;
          const h = (hist[i] / maxBin) * (cHeight - 10);
          const y = cHeight - h;
          visCtx.lineTo(x, y);
        }
        visCtx.lineTo(cWidth, cHeight);
        visCtx.closePath();
        if (fillStyle) visCtx.fill();
        visCtx.stroke();
      };

      if (channel === 'rgb') {
        visCtx.globalCompositeOperation = 'screen';
        drawChannel(rHist, 'rgba(239, 68, 68, 0.9)', 'rgba(239, 68, 68, 0.25)');
        drawChannel(gHist, 'rgba(34, 197, 94, 0.9)', 'rgba(34, 197, 94, 0.25)');
        drawChannel(bHist, 'rgba(59, 130, 246, 0.9)', 'rgba(59, 130, 246, 0.25)');
        visCtx.globalCompositeOperation = 'source-over';
      } else if (channel === 'luminance') {
        drawChannel(lHist, 'rgba(245, 158, 11, 0.95)', 'rgba(245, 158, 11, 0.3)');
      } else if (channel === 'red') {
        drawChannel(rHist, 'rgba(239, 68, 68, 0.95)', 'rgba(239, 68, 68, 0.3)');
      } else if (channel === 'green') {
        drawChannel(gHist, 'rgba(34, 197, 94, 0.95)', 'rgba(34, 197, 94, 0.3)');
      } else if (channel === 'blue') {
        drawChannel(bHist, 'rgba(59, 130, 246, 0.95)', 'rgba(59, 130, 246, 0.3)');
      }

      setLoading(false);
    };
  }, [imageUrl, channel]);

  if (!imageUrl) {
    return (
      <div className={`p-4 rounded-2xl text-center text-xs border ${
        isLight ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'
      }`}>
        Upload an image to generate live RGB Histogram
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-2xl border space-y-3 ${
      isLight ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-zinc-950/90 border-zinc-800 text-zinc-200'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider">Live RGB Histogram</h4>
        </div>

        {/* Channel Selector */}
        <div className="flex items-center gap-1 bg-black/5 p-1 rounded-lg">
          {(['rgb', 'luminance', 'red', 'green', 'blue'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                channel === ch
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {ch === 'luminance' ? 'LUM' : ch}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl overflow-hidden bg-black/90 p-2 border border-slate-800">
        <canvas
          ref={canvasRef}
          width={280}
          height={110}
          className="w-full h-28 object-contain"
        />
        {loading && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-xs text-amber-400">
            Analyzing Exposure...
          </div>
        )}
      </div>

      {/* Metrics & Clipping Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className={`p-2 rounded-xl border text-center ${
            isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
          }`}>
            <span className="text-[9px] uppercase text-slate-400 block font-bold">Avg Exposure</span>
            <span className="font-bold text-amber-500">{stats.mean} / 255</span>
          </div>

          <div className={`p-2 rounded-xl border text-center ${
            stats.shadowClipping > 5 ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 font-bold' : isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}>
            <span className="text-[9px] uppercase block font-bold">Crushed Shadows</span>
            <span>{stats.shadowClipping}%</span>
          </div>

          <div className={`p-2 rounded-xl border text-center ${
            stats.highlightClipping > 5 ? 'bg-red-500/10 border-red-500/30 text-red-500 font-bold' : isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}>
            <span className="text-[9px] uppercase block font-bold">Clipped Highlights</span>
            <span>{stats.highlightClipping}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
