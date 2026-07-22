import { ICONS, escapeHtml } from './utils.js';

export function initArtistInsights() {
  document.addEventListener('click', async event => {
    const btn = event.target.closest('.btn-insights');
    if (!btn) return;

    event.preventDefault();
    const card = btn.closest('.event-card');
    if (!card) return;

    const artistName = btn.getAttribute('data-artist');
    const wrapper = card.querySelector('.insights-drawer-wrapper');
    const drawer = card.querySelector('.insights-drawer');
    if (!wrapper || !drawer) return;

    if (wrapper.classList.contains('open')) {
      wrapper.classList.remove('open');
      btn.classList.remove('active');
      return;
    }

    document.querySelectorAll('.insights-drawer-wrapper.open').forEach(openWrapper => {
      openWrapper.classList.remove('open');
      const otherCard = openWrapper.closest('.event-card');
      const otherBtn = otherCard ? otherCard.querySelector('.btn-insights') : null;
      if (otherBtn) otherBtn.classList.remove('active');
    });

    document.querySelectorAll('.audio-drawer').forEach(drawerEl => {
      drawerEl.style.display = 'none';
      const otherCard = drawerEl.closest('.event-card');
      const listenBtn = otherCard ? otherCard.querySelector('.btn-listen:not(.btn-insights)') : null;
      if (listenBtn) listenBtn.classList.remove('active');
    });

    btn.classList.add('active');
    wrapper.classList.add('open');

    if (wrapper.getAttribute('data-loaded') === 'true') {
      return;
    }

    drawer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem; width: 100%;">
        <div class="skeleton-pulse" style="height: 14px; width: 90%;"></div>
        <div class="skeleton-pulse" style="height: 14px; width: 75%;"></div>
        <div class="skeleton-pulse" style="height: 14px; width: 60%;"></div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <div class="skeleton-pulse" style="height: 20px; width: 70px; border-radius: 4px;"></div>
          <div class="skeleton-pulse" style="height: 20px; width: 60px; border-radius: 4px;"></div>
          <div class="skeleton-pulse" style="height: 20px; width: 80px; border-radius: 4px;"></div>
        </div>
      </div>
    `;

    try {
      const response = await fetch(`artist-details.php?artist=${encodeURIComponent(artistName)}`);
      if (!response.ok) {
        drawer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">${ICONS.warning} Network error loading details.</div>`;
        return;
      }

      const payload = await response.json();
      if (payload.status === 'success' && payload.data) {
        const details = payload.data;
        let tagsHtml = '';
        if (details.top_tags && details.top_tags.length > 0) {
          details.top_tags.slice(0, 5).forEach(tag => {
            tagsHtml += `<span class="insight-tag-pill">${escapeHtml(tag)}</span>`;
          });
        }

        drawer.innerHTML = `
          <div class="insights-bio">${escapeHtml(details.bio_summary || '')}</div>
          ${tagsHtml ? `<div class="insights-tags">${tagsHtml}</div>` : ''}
        `;
      } else {
        drawer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 0.5rem 0;">No biographical insights available for this artist.</div>';
      }
      wrapper.setAttribute('data-loaded', 'true');
    } catch (error) {
      console.error('Fetch details error', error);
      drawer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">${ICONS.warning} Error connecting to server.</div>`;
    }
  });
}

export function initAudioPreview() {
  document.addEventListener('click', async event => {
    const btn = event.target.closest('.btn-listen');
    if (!btn) return;

    event.preventDefault();
    const artist = btn.getAttribute('data-artist');
    const card = btn.closest('.event-card');
    const drawer = card ? card.querySelector('.audio-drawer') : null;
    if (!card || !drawer) return;

    if (drawer.style.display === 'block') {
      drawer.style.display = 'none';
      btn.classList.remove('active');
      const localAudio = drawer.querySelector('audio');
      if (localAudio) localAudio.pause();
      drawer.querySelectorAll('.btn-play-preview').forEach(playBtn => {
        playBtn.textContent = ICONS.play;
      });
      return;
    }

    document.querySelectorAll('.audio-drawer').forEach(otherDrawer => {
      if (otherDrawer !== drawer) {
        otherDrawer.style.display = 'none';
        const otherAudio = otherDrawer.querySelector('audio');
        if (otherAudio) otherAudio.pause();
        otherDrawer.querySelectorAll('.btn-play-preview').forEach(playBtn => {
          playBtn.textContent = ICONS.play;
        });
      }
    });
    document.querySelectorAll('.btn-listen').forEach(otherBtn => {
      if (otherBtn !== btn) otherBtn.classList.remove('active');
    });

    drawer.style.display = 'block';
    btn.classList.add('active');

    if (drawer.getAttribute('data-loaded') === 'true') {
      return;
    }

    drawer.innerHTML = `<div class="audio-loading">${ICONS.headphones} Searching tracks on iTunes...</div>`;

    try {
      const parts = artist.split(/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*)/i);
      const primaryArtist = parts[0].trim();
      const term = encodeURIComponent(primaryArtist);
      const response = await fetch(`https://itunes.apple.com/search?term=${term}&media=music&limit=3`);
      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        drawer.innerHTML = '<div class="audio-empty">No previews found for this artist.</div>';
        return;
      }

      let html = '<div class="audio-tracks-list">';
      data.results.forEach(track => {
        const trackName = escapeHtml(track.trackName || 'Unknown Track');
        const collectionName = escapeHtml(track.collectionName || 'Single');
        const artwork = track.artworkUrl60 || 'https://via.placeholder.com/60';
        const previewUrl = track.previewUrl || '';

        if (previewUrl) {
          html += `
            <div class="audio-track-item">
              <img src="${artwork}" alt="Artwork" class="audio-artwork">
              <div class="audio-track-info">
                <div class="audio-track-name">${trackName}</div>
                <div class="audio-collection-name">${collectionName}</div>
              </div>
              <button type="button" class="btn-play-preview" data-url="${previewUrl}">${ICONS.play}</button>
            </div>
          `;
        }
      });
      html += '</div><audio class="card-audio-player" style="display: none;"></audio>';

      drawer.innerHTML = html;
      drawer.setAttribute('data-loaded', 'true');

      const audioPlayer = drawer.querySelector('.card-audio-player');
      audioPlayer.addEventListener('ended', () => {
        drawer.querySelectorAll('.btn-play-preview').forEach(playBtn => {
          playBtn.textContent = ICONS.play;
        });
      });
    } catch (error) {
      console.error('iTunes fetch failed', error);
      drawer.innerHTML = '<div class="audio-error">Failed to fetch track list.</div>';
    }
  });

  document.addEventListener('click', event => {
    const trackBtn = event.target.closest('.btn-play-preview');
    if (!trackBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const drawer = trackBtn.closest('.audio-drawer');
    const audioPlayer = drawer ? drawer.querySelector('.card-audio-player') : null;
    if (!audioPlayer) return;

    const url = trackBtn.getAttribute('data-url');
    document.querySelectorAll('audio').forEach(otherAudio => {
      if (otherAudio !== audioPlayer) otherAudio.pause();
    });
    document.querySelectorAll('.btn-play-preview').forEach(otherBtn => {
      if (otherBtn !== trackBtn) otherBtn.textContent = ICONS.play;
    });

    if (audioPlayer.src === url) {
      if (audioPlayer.paused) {
        audioPlayer.play();
        trackBtn.textContent = ICONS.pause;
      } else {
        audioPlayer.pause();
        trackBtn.textContent = ICONS.play;
      }
    } else {
      audioPlayer.src = url;
      audioPlayer.play();
      trackBtn.textContent = ICONS.pause;
    }
  });

  document.addEventListener('ended', event => {
    if (event.target.classList.contains('card-audio-player')) {
      const drawer = event.target.closest('.audio-drawer');
      if (drawer) {
        drawer.querySelectorAll('.btn-play-preview').forEach(playBtn => {
          playBtn.textContent = ICONS.play;
        });
      }
    }
  }, true);
}
