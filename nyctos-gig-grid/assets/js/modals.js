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
      alert('Your Interested Shows list is empty. Please star some concerts first before emailing your show list!');
      return;
    }

    emailError.style.display = 'none';
    emailSuccess.style.display = 'none';
    emailForm.reset();
    resetSubmitButton(`${ICONS.email} Send Show List`);
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
        resetSubmitButton(`${ICONS.email} Send Show List`);
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
        resetSubmitButton(`${ICONS.email} Send Show List`);
      }
    } catch (error) {
      console.error('Email dispatch request error', error);
      emailError.textContent = 'Failed to connect to the mail dispatcher. Try again.';
      emailError.style.display = 'block';
      resetSubmitButton(`${ICONS.email} Send Show List`);
    }
  });
}

export function initFeatureModal() {
  const btnOpenFeatures = document.getElementById('btn-open-features');
  const featuresModal = document.getElementById('features-modal');
  if (!btnOpenFeatures || !featuresModal) return;

  const btnCloseFeatures = document.getElementById('btn-close-features');

  const openFeaturesModal = () => {
    featuresModal.style.display = 'flex';
  };

  const closeFeaturesModal = () => {
    featuresModal.style.display = 'none';
  };

  btnOpenFeatures.addEventListener('click', openFeaturesModal);
  if (btnCloseFeatures) btnCloseFeatures.addEventListener('click', closeFeaturesModal);

  featuresModal.addEventListener('click', event => {
    if (event.target === featuresModal) {
      closeFeaturesModal();
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
    const isSharedLineup = /,|\s&\s|\swith\s|\sw\/\s/i.test(artist || '');

    setlistTitle.textContent = isSharedLineup ? 'Shared Lineup Setlist' : `${artist} Setlist`;
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
      if (data.status === 'success') {
        if (Array.isArray(data.acts) && data.acts.length > 1) {
          setlistTitle.textContent = 'Shared Lineup Setlist';
        }
        if (data.acts && data.acts.length > 0) {
          const gridClass = data.acts.length > 1 ? 'setlist-acts-grid setlist-acts-grid--two-column' : 'setlist-acts-grid';
          let html = `<div class="${gridClass}">`;
          data.acts.forEach(act => {
            html += `<div class="setlist-act-card">
              <h3 class="setlist-act-title">
                🎤 ${escapeHtml(act.artist)}
              </h3>`;
            
            if (act.songs && act.songs.length > 0) {
              let listOpen = false;
              act.songs.forEach(song => {
                if (song.includes('Expected Tour Setlist')) {
                  if (listOpen) {
                    html += '</ol>';
                    listOpen = false;
                  }
                  html += `<div class="setlist-tour-note">${escapeHtml(song)}</div>`;
                } else {
                  if (!listOpen) {
                    html += '<ol class="setlist-song-list">';
                    listOpen = true;
                  }
                  html += `<li>${escapeHtml(song)}</li>`;
                }
              });
              if (listOpen) {
                html += '</ol>';
              }
            } else {
              html += '<p class="setlist-empty-state">No setlist data available for this artist yet.</p>';
            }
            html += '</div>';
          });
          html += '</div>';
          setlistSongsContainer.innerHTML = html;
        } else if (data.songs && data.songs.length > 0) {
          let songsHtml = `<div class="setlist-act-card"><h3 class="setlist-act-title">🎤 ${escapeHtml(artist)}</h3>`;
          let listOpen = false;

          data.songs.forEach(song => {
            if (song.includes('Expected Tour Setlist')) {
              if (listOpen) {
                songsHtml += '</ol>';
                listOpen = false;
              }
              songsHtml += `<div class="setlist-tour-note">${escapeHtml(song)}</div>`;
            } else {
              if (!listOpen) {
                songsHtml += '<ol class="setlist-song-list">';
                listOpen = true;
              }
              songsHtml += `<li>${escapeHtml(song)}</li>`;
            }
          });

          if (listOpen) {
            songsHtml += '</ol>';
          }
          songsHtml += '</div>';
          setlistSongsContainer.innerHTML = songsHtml;
        } else {
          setlistSongsContainer.innerHTML = `<div class="setlist-empty-state">${ICONS.warning} No setlist has been uploaded for this show yet.</div>`;
        }
      } else {
        setlistSongsContainer.innerHTML = `<div class="setlist-empty-state">${ICONS.warning} No setlist has been uploaded for this show yet.</div>`;
      }
    } catch (error) {
      console.error('Failed to fetch setlist', error);
      setlistSongsContainer.innerHTML = '<div class="setlist-empty-state">Error loading setlist.</div>';
    }
  });
}

export function initContactModal() {
  const contactModal = document.getElementById('contact-modal');
  if (!contactModal) return;

  const openBtn = document.getElementById('btn-open-contact');
  const closeBtn = document.getElementById('btn-close-contact');
  const submitBtn = document.getElementById('btn-submit-contact');
  const messageInput = document.getElementById('contact-message');
  const emailInput = document.getElementById('contact-email');
  const subjectSelect = document.getElementById('contact-subject');
  const charCounter = document.getElementById('contact-char-count');
  const statusMsg = document.getElementById('contact-status-msg');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      contactModal.style.display = 'flex';
      if (statusMsg) statusMsg.style.display = 'none';
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      contactModal.style.display = 'none';
    });
  }

  contactModal.addEventListener('click', event => {
    if (event.target === contactModal) {
      contactModal.style.display = 'none';
    }
  });

  if (messageInput && charCounter) {
    messageInput.addEventListener('input', () => {
      const len = messageInput.value.length;
      charCounter.textContent = `${len} / 500`;
      if (len >= 500) {
        charCounter.style.color = 'var(--accent-crimson)';
      } else {
        charCounter.style.color = 'var(--text-muted)';
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const message = (messageInput?.value || '').trim();
      const subject = subjectSelect?.value || 'General Feedback';
      const email = (emailInput?.value || '').trim();

      if (!message) {
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          statusMsg.style.color = '#fecdd3';
          statusMsg.textContent = 'Please type a message before sending.';
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const formData = new FormData();
        formData.append('subject_category', subject);
        formData.append('user_email', email);
        formData.append('message', message);

        const response = await fetch('actions/contact.php', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (statusMsg) {
          statusMsg.style.display = 'block';
          if (data.status === 'success') {
            statusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
            statusMsg.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusMsg.style.color = '#a7f3d0';
            statusMsg.textContent = data.message || 'Thank you! Your message has been sent to Nycto.';
            if (messageInput) messageInput.value = '';
            if (emailInput) emailInput.value = '';
            if (charCounter) charCounter.textContent = '0 / 500';
            window.setTimeout(() => {
              contactModal.style.display = 'none';
            }, 2000);
          } else {
            statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
            statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusMsg.style.color = '#fecdd3';
            statusMsg.textContent = data.message || 'Failed to send message.';
          }
        }
      } catch (err) {
        console.error('Contact submit error:', err);
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
          statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          statusMsg.style.color = '#fecdd3';
          statusMsg.textContent = 'Unable to send message right now.';
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message 🚀';
      }
    });
  }
}
