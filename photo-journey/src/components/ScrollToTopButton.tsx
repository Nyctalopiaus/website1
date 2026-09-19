import React, { useState, useEffect, RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  containerRef?: RefObject<HTMLElement | null>;
  threshold?: number;
  isLight?: boolean;
  maxWidthClass?: string;
}

export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  containerRef,
  threshold = 300,
  isLight = false,
  maxWidthClass = 'max-w-6xl',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const targetElement = containerRef?.current;

    const handleScroll = () => {
      const scrollOffset = targetElement
        ? targetElement.scrollTop
        : window.scrollY;

      setIsVisible(scrollOffset > threshold);
    };

    if (targetElement) {
      targetElement.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
      return () => targetElement.removeEventListener('scroll', handleScroll);
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [containerRef, threshold]);

  const scrollToTop = () => {
    const targetElement = containerRef?.current;
    if (targetElement) {
      targetElement.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 md:left-64 bottom-20 md:bottom-6 z-30 pointer-events-none flex justify-center px-4 lg:px-8">
      <div className={`w-full ${maxWidthClass} relative flex justify-end`}>
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Return to top"
          title="Return to top"
          className={`pointer-events-auto p-3 rounded-full shadow-xl backdrop-blur-xl border transition-all duration-300 transform hover:scale-110 active:scale-95 group focus:outline-none focus:ring-2 focus:ring-amber-500 absolute bottom-0 right-2 xl:right-auto xl:left-full xl:ml-4 ${
            isLight
              ? 'bg-white/90 text-slate-800 border-amber-200/80 hover:bg-amber-500 hover:text-black hover:border-amber-500 shadow-amber-500/10'
              : 'bg-zinc-900/90 text-amber-400 border-zinc-700/80 hover:bg-amber-500 hover:text-black hover:border-amber-500 shadow-black/50'
          }`}
        >
          <ArrowUp className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" />
        </button>
      </div>
    </div>
  );
};
