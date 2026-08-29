/**
 * DoorScout Cross-Device Sync Client
 * Pushes and pulls route sessions & door inspiration notes to sync.php via 6-digit pairing code.
 */

class SyncClient {
  constructor() {
    this.endpoint = 'sync.php';
  }

  async pushSession(sessionData) {
    let resp;
    try {
      resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push', tour: sessionData })
      });
    } catch (networkErr) {
      throw new Error('network_error');
    }

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || !json.ok) {
      throw new Error((json && json.error) || 'push_failed');
    }

    // Generate QR Code URL using QuickChart QR API for easy scanning
    const shareableUrl = `${window.location.origin}${window.location.pathname}?code=${json.code}`;
    const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(shareableUrl)}&size=220&margin=1`;

    return {
      code: json.code,
      savedAt: json.savedAt,
      expiresAt: json.expiresAt,
      shareUrl: shareableUrl,
      qrUrl: qrImageUrl
    };
  }

  async pullSession(code) {
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
}

window.SyncClient = SyncClient;
