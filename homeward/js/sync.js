/**
 * Homeward Cross-Device Sync Module
 *
 * Bridges the gap between "took notes on my phone in the field" and "need
 * them on the PC to build the route/report" (and back). Homeward's tour
 * lives only in localStorage (js/storage.js) with no accounts and no
 * database, so this talks to sync.php: a tiny endpoint that stores a tour
 * under a short random code for a couple weeks. No login — the code itself
 * is the credential, same trust model as a shared link. See sync.php for
 * the server-side half of this.
 */
class SyncManager {
  constructor() {
    this.endpoint = 'sync.php';
    // Keep server and client in agreement on what's too big to sync — see
    // the payload-size note in sync.php. Checking here first means the user
    // gets a clear, specific message instead of a network round-trip that
    // just fails.
    this.maxPayloadBytes = 4 * 1024 * 1024;
  }

  // Returns { tooLarge: boolean, sizeBytes, offendingAddresses: string[] }.
  // offendingAddresses lists stops carrying an embedded base64 photo
  // (photoUrl starting with "data:"), since those are almost always what
  // pushes a tour over the limit and are the thing the user can act on.
  checkPayloadSize(tourData) {
    const json = JSON.stringify(tourData || {});
    const sizeBytes = new Blob([json]).size;
    const offendingAddresses = (tourData && Array.isArray(tourData.stops) ? tourData.stops : [])
      .filter(s => s && typeof s.photoUrl === 'string' && s.photoUrl.startsWith('data:'))
      .map(s => s.address);
    return {
      tooLarge: sizeBytes > this.maxPayloadBytes,
      sizeBytes,
      offendingAddresses
    };
  }

  async pushTour(tourData) {
    const sizeCheck = this.checkPayloadSize(tourData);
    if (sizeCheck.tooLarge) {
      const err = new Error('payload_too_large_client');
      err.offendingAddresses = sizeCheck.offendingAddresses;
      throw err;
    }

    let resp;
    try {
      resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push', tour: tourData })
      });
    } catch (networkErr) {
      throw new Error('network_error');
    }

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || !json.ok) {
      throw new Error((json && json.error) || 'push_failed');
    }
    return json; // { ok, code, savedAt, expiresAt }
  }

  async pullTour(code) {
    const cleanCode = (code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!cleanCode) {
      throw new Error('missing_code');
    }

    let resp;
    try {
      resp = await fetch(`${this.endpoint}?code=${encodeURIComponent(cleanCode)}`);
    } catch (networkErr) {
      throw new Error('network_error');
    }

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || !json.ok) {
      throw new Error((json && json.error) || 'pull_failed');
    }
    return json; // { ok, tour, savedAt, expiresAt }
  }

  // Human-readable explanation for the error strings thrown above.
  describeError(err) {
    const code = err && err.message;
    switch (code) {
      case 'payload_too_large_client':
      case 'payload_too_large':
        return "This tour is too large to sync (likely a photo attached via file upload, embedded as image data). Use \"JSON Backup\" for a full copy with photos, or paste an image URL in the notebook instead of uploading a file.";
      case 'invalid_code':
      case 'missing_code':
        return `Enter the ${SyncManager.CODE_LENGTH}-character code exactly as shown on the other device.`;
      case 'not_found':
      case 'expired':
        return 'That code was not found or has expired (codes last 14 days). Push again from the other device to get a fresh code.';
      case 'network_error':
        return "Couldn't reach the sync server. Check your connection and try again.";
      default:
        return 'Something went wrong with sync. Please try again.';
    }
  }
}

SyncManager.CODE_LENGTH = 6;

window.syncManager = new SyncManager();
