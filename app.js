document.addEventListener('DOMContentLoaded', () => {
  console.log('[SYSTEM] Nycto\'s Project Lab initialized.');

  // ==========================================
  // RETRO SYNTH SOUNDS (Web Audio API)
  // ==========================================
  class AudioSynth {
    constructor() {
      this.ctx = null;
    }
    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
    playHover() {
      try {
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        // Short high-pitched digital chirp
        osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.04);

        gain.gain.setValueAtTime(0.012, this.ctx.currentTime); // Low volume
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
      } catch (e) {
        // Fallback for browsers that block audio context
      }
    }
    playClick() {
      try {
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        // Double-beep retro synth chime
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.setValueAtTime(900, this.ctx.currentTime + 0.04);

        gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
      } catch (e) {
        // Fallback
      }
    }
  }

  const synth = new AudioSynth();

  // ==========================================
  // 3D CARD TILT & FLASHLIGHT EFFECT
  // ==========================================
  const activeCards = document.querySelectorAll('.project-card.active');

  activeCards.forEach(card => {
    // Mouse movement: calculate coordinates and tilt
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Set CSS variables for cursor tracking gradient
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);

      // 3D Tilt calculation (max 7 degrees)
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;
      const tiltX = -((y - halfHeight) / halfHeight) * 7;
      const tiltY = ((x - halfWidth) / halfWidth) * 7;

      // Apply transform and disable transitions during movement for responsiveness
      card.style.transition = 'none';
      card.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    // Mouse enter: initialize audio and trigger hover chime
    card.addEventListener('mouseenter', () => {
      synth.playHover();
    });

    // Mouse leave: reset values smoothly
    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.3s ease, box-shadow 0.3s ease';
      card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });

    // Launch button click: play click chime
    const btn = card.querySelector('.btn-launch');
    if (btn) {
      btn.addEventListener('click', (e) => {
        synth.playClick();
        
        // Let sound play slightly before navigation if it's an anchor
        if (btn.tagName === 'A') {
          e.preventDefault();
          setTimeout(() => {
            window.location.href = btn.getAttribute('href');
          }, 100);
        }
      });
    }
  });

  // Sound effects on secondary interactive elements
  const systemStatus = document.querySelector('.system-status');
  if (systemStatus) {
    systemStatus.addEventListener('mouseenter', () => {
      synth.playHover();
    });
  }
});
