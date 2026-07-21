import { ICONS, escapeHtml, findVenueDetails } from './utils.js';

export function initEmailModal(getInterestedIds) {
  const btnEmailPassport = document.getElementById('btn-email-passport');
  const emailModal = document.getElementById('email-modal');
  if (!btnEmailPassport || !emailModal) return;

  const btnCloseEmail = document.getElementById('btn-close-email');
  const btnCancelEmail = document.getElementById('btn-cancel-email');
  const emailForm = document.getElementById('email-form');
  const emailError = document.getElementById('email-error');
  const emailSuccess = document.getElementById('email-success');
  const btnSubmitEmail = document.getElementById('btn-submit-email');

  const resetSubmitButton = text => {
    btnSubmitEmail.disabled = false;
    btnSubmitEmail.textContent = text;
  };

  const openEmailModal = () => {
    const interestedIds = getInterestedIds();
    if (interestedIds.length === 0) {
      alert('Your Interested Shows list is empty. Please star some concerts first before emailing your passport!');
      return;
    }

    emailError.style.display = 'none';
    emailSuccess.style.display = 'none';
    emailForm.reset();
    resetSubmitButton(`${ICONS.email} Dispatch Passport`);
    emailModal.style.display = 'flex';
  };

  const closeEmailModal = () => {
    emailModal.style.display = 'none';
  };

  btnEmailPassport.addEventListener('click', openEmailModal);
  if (btnCloseEmail) btnCloseEmail.addEventListener('click', closeEmailModal);
  if (btnCancelEmail) btnCancelEmail.addEventListener('click', closeEmailModal);

  emailModal.addEventListener('click', event => {
    if (event.target === emailModal) {
      closeEmailModal();
    }
  });

  emailForm.addEventListener('submit', async event => {
    event.preventDefault();
    emailError.style.display = 'none';
    emailSuccess.style.display = 'none';

    const emailVal = document.getElementById('email-input-field').value.trim();
    const interestedIds = getInterestedIds();

    if (!emailVal) {
      emailError.textContent = 'Please enter a valid email address.';
      emailError.style.display = 'block';
      return;
    }

    btnSubmitEmail.disabled = true;
    btnSubmitEmail.textContent = `${ICONS.sending} Sending...`;

    try {
      const response = await fetch('email-passport.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailVal,
          event_ids: interestedIds
        })
      });

      if (!response.ok) {
        emailError.textContent = 'Server responded with an error. Please try again.';
        emailError.style.display = 'block';
        resetSubmitButton(`${ICONS.email} Dispatch Passport`);
        return;
      }

      const data = await response.json();
      if (data.status === 'success') {
        emailSuccess.textContent = data.message;
        emailSuccess.style.display = 'block';
        emailForm.reset();
        btnSubmitEmail.textContent = `${ICONS.sent} Sent!`;
        setTimeout(closeEmailModal, 2000);
      } else {
        emailError.textContent = data.message;
        emailError.style.display = 'block';
        resetSubmitButton(`${ICONS.email} Dispatch Passport`);
      }
    } catch (error) {
      console.error('Email dispatch request error', error);
      emailError.textContent = 'Failed to connect to the mail dispatcher. Try again.';
      emailError.style.display = 'block';
      resetSubmitButton(`${ICONS.email} Dispatch Passport`);
    }
  });
}

export function initVenueModal(venueData) {
  const venueModal = document.getElementById('venue-modal');
  if (!venueModal) return;

  const venueCloseBtn = document.getElementById('btn-close-venue');
  const venueModalName = document.getElementById('venue-modal-name');
  const venueModalAddress = document.getElementById('venue-modal-address');
  const venueModalMaps = document.getElementById('venue-modal-maps');

  document.addEventListener('click', event => {
    const target = event.target.closest('.clickable-venue');
    if (!target) return;

    event.preventDefault();
    const venueName = target.getAttribute('data-venue-name');
    const details = findVenueDetails(venueData, venueName);

    if (details) {
      venueModalName.textContent = details.venue_name;
      venueModalAddress.textContent = details.address;
      venueModalMaps.href = details.maps_url;
    } else {
      venueModalName.textContent = venueName;
      venueModalAddress.textContent = 'Colorado Front Range Venue';
      venueModalMaps.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(venueName + ' Colorado');
    }

    venueModal.style.display = 'flex';
  });

  if (venueCloseBtn) {
    venueCloseBtn.addEventListener('click', () => {
      venueModal.style.display = 'none';
    });
  }

  venueModal.addEventListener('click', event => {
    if (event.target === venueModal) {
      venueModal.style.display = 'none';
    }
  });
}

export function initSetlistModal() {
  const setlistModal = document.getElementById('setlist-modal');
  if (!setlistModal) return;

  const setlistCloseBtn = document.getElementById('btn-close-setlist');
  const setlistTitle = document.getElementById('setlist-modal-title');
  const setlistMeta = document.getElementById('setlist-modal-meta');
  const setlistSongsContainer = document.getElementById('setlist-songs-container');

  if (setlistCloseBtn) {
    setlistCloseBtn.addEventListener('click', () => {
      setlistModal.style.display = 'none';
    });
  }

  setlistModal.addEventListener('click', event => {
    if (event.target === setlistModal) {
      setlistModal.style.display = 'none';
    }
  });

  document.addEventListener('click', async event => {
    const btn = event.target.closest('.btn-view-setlist');
    if (!btn) return;

    event.preventDefault();
    const eventId = btn.getAttribute('data-id');
    const artist = btn.getAttribute('data-artist');
    const dateStr = btn.getAttribute('data-date');
    const venue = btn.getAttribute('data-venue');
    const city = btn.getAttribute('data-city');

    setlistTitle.textContent = `${artist} Setlist`;
    const dateObj = new Date(dateStr);
    const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    setlistMeta.textContent = `${venue} // ${city}, CO // ${formattedDate}`;
    setlistSongsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 2rem 0;">${ICONS.music} Loading setlist from Setlist.fm...</div>`;
    setlistModal.style.display = 'flex';

    try {
      const response = await fetch(`aggregator.php?action=get_setlist&event_id=${encodeURIComponent(eventId)}&t=${Date.now()}`);
      if (!response.ok) {
        setlistSongsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 2rem 0;">Failed to fetch setlist.</div>';
        return;
      }

      const data = await response.json();
      if (data.status === 'success' && data.songs && data.songs.length > 0) {
        let songsHtml = '';
        let listOpen = false;

        data.songs.forEach(song => {
          if (song.includes('Expected Tour Setlist')) {
            if (listOpen) {
              songsHtml += '</ol>';
              listOpen = false;
            }
            songsHtml += `<div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); color: #fcd34d; padding: 0.65rem 0.85rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1.25rem; font-weight: 600; text-align: center; line-height: 1.4;">${escapeHtml(song)}</div>`;
          } else {
            if (!listOpen) {
              songsHtml += '<ol style="margin: 0; padding-left: 1.5rem; color: var(--text-bright); font-size: 0.95rem; line-height: 1.8;">';
              listOpen = true;
            }
            songsHtml += `<li style="margin-bottom: 0.4rem; font-family: monospace;">${escapeHtml(song)}</li>`;
          }
        });

        if (listOpen) {
          songsHtml += '</ol>';
        }
        setlistSongsContainer.innerHTML = songsHtml;
      } else {
        setlistSongsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 2rem 0; font-style: italic;">${ICONS.warning} No setlist has been uploaded for this show yet.</div>`;
      }
    } catch (error) {
      console.error('Failed to fetch setlist', error);
      setlistSongsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 2rem 0;">Error loading setlist.</div>';
    }
  });
}
