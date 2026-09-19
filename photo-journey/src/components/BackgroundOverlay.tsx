import React from 'react';
import { BackgroundTheme } from '../types';

interface BackgroundOverlayProps {
  theme: BackgroundTheme;
}

export const BackgroundOverlay: React.FC<BackgroundOverlayProps> = ({ theme }) => {
  const getPhotoPath = (t: BackgroundTheme): string | null => {
    switch (t) {
      case 'golden-landscape':
        return 'backgrounds/bg-golden-landscape.jpg';
      case 'camera-lens':
        return 'backgrounds/bg-lens.jpg';
      case 'photo-studio':
        return 'backgrounds/bg-studio.jpg';
      case 'vintage-film':
        return 'backgrounds/bg-vintage.jpg';
      case 'camera-optics':
        return 'backgrounds/bg-optics.jpg';
      default:
        return null;
    }
  };

  const photoPath = getPhotoPath(theme);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Real Photography Backdrop Image */}
      {photoPath ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-700 scale-[1.01]"
            style={{ backgroundImage: `url('${photoPath}')` }}
          />
          {/* Light vignette overlay allowing the background photograph to shine through vividly */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/25" />
          <div className="absolute inset-0 bg-amber-500/5 mix-blend-soft-light" />
          <div className="absolute inset-0 bg-viewfinder-grid-light opacity-25 mix-blend-overlay" />
        </>
      ) : (
        <>
          {/* Fallback theme gradients */}
          {theme === 'natural-daylight' && (
            <>
              <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-amber-200/40 rounded-full blur-[160px]" />
              <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-sky-200/30 rounded-full blur-[150px]" />
              <div className="absolute -bottom-40 left-1/4 w-[600px] h-[600px] bg-amber-100/40 rounded-full blur-[160px]" />
              <div className="absolute inset-0 bg-viewfinder-grid-light opacity-80" />
            </>
          )}

          {theme === 'gallery-white' && (
            <>
              <div className="absolute top-0 right-0 left-0 h-[300px] bg-gradient-to-b from-amber-100/30 via-slate-100/20 to-transparent" />
              <div className="absolute inset-0 bg-viewfinder-grid-light opacity-60" />
            </>
          )}

          {theme === 'analog-pastel' && (
            <>
              <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-rose-200/35 rounded-full blur-[160px]" />
              <div className="absolute top-1/4 -right-40 w-[600px] h-[600px] bg-amber-200/35 rounded-full blur-[150px]" />
              <div className="absolute inset-0 bg-camera-dots-light opacity-40" />
            </>
          )}

          {theme === 'studio-dark' && (
            <>
              <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[140px]" />
              <div className="absolute top-1/3 -right-40 w-[700px] h-[700px] bg-cyan-500/5 rounded-full blur-[160px]" />
              <div className="absolute inset-0 bg-viewfinder-grid-dark opacity-60" />
            </>
          )}
        </>
      )}
    </div>
  );
};
