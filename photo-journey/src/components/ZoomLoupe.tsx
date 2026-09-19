import React, { useState, useRef } from 'react';
import { ZoomIn, Eye } from 'lucide-react';

interface ZoomLoupeProps {
  imageUrl: string;
  alt?: string;
  className?: string;
  zoomLevel?: number;
}

export const ZoomLoupe: React.FC<ZoomLoupeProps> = ({
  imageUrl,
  alt = 'Photo Submission',
  className = '',
  zoomLevel = 2.5
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgBounds, setImgBounds] = useState<{ width: number; height: number; left: number; top: number }>({
    width: 0,
    height: 0,
    left: 0,
    top: 0
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  const updatePosFromPoint = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setMousePos({ x, y });
    setImgBounds({
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    updatePosFromPoint(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsActive(true);
    updatePosFromPoint(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    updatePosFromPoint(touch.clientX, touch.clientY);
  };

  const loupeSize = 140;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setIsActive(false)}
      className={`relative overflow-hidden cursor-crosshair group touch-none ${className}`}
    >
      <img
        src={imageUrl}
        alt={alt}
        className="w-full h-full object-cover transition-opacity"
      />

      {/* Loupe Toggle Hint Badge */}
      <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">
        <ZoomIn className="w-3 h-3 text-amber-400" />
        <span>Hover or Touch to Inspect 2.5x</span>
      </div>

      {/* Circular Viewfinder Loupe */}
      {isActive && imgBounds.width > 0 && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-amber-400 shadow-2xl overflow-hidden z-30"
          style={{
            width: `${loupeSize}px`,
            height: `${loupeSize}px`,
            left: `${mousePos.x - loupeSize / 2}px`,
            top: `${mousePos.y - loupeSize / 2}px`,
            boxShadow: '0 0 0 3px rgba(0,0,0,0.5), 0 20px 25px -5px rgba(0,0,0,0.5)'
          }}
        >
          {/* Magnified Image */}
          <div
            className="w-full h-full bg-no-repeat"
            style={{
              backgroundImage: `url('${imageUrl}')`,
              backgroundSize: `${imgBounds.width * zoomLevel}px ${imgBounds.height * zoomLevel}px`,
              backgroundPosition: `-${mousePos.x * zoomLevel - loupeSize / 2}px -${mousePos.y * zoomLevel - loupeSize / 2}px`
            }}
          />

          {/* Viewfinder Crosshair */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-full h-[1px] bg-amber-400/40" />
            <div className="h-full w-[1px] bg-amber-400/40 absolute" />
            <div className="w-6 h-6 border border-amber-400/60 rounded-full absolute" />
          </div>
        </div>
      )}
    </div>
  );
};
