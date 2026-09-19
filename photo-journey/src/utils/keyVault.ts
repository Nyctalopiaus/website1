/**
 * Lightweight client-side encryption for the AI provider API key.
 *
 * The key is encrypted at rest in localStorage using AES-GCM with a key
 * derived (via PBKDF2) from a PIN the student sets. This is a
 * proportionate protection for a personal, single-user, backend-free
 * tool: it stops the key from being read in plain text by anyone who
 * opens DevTools / the browser's local storage files on a shared or
 * borrowed machine.
 *
 * It is NOT a substitute for a real secrets backend. It does not protect
 * against a malicious script running inside this page (XSS) — the
 * decrypted key necessarily lives in memory while a submission is being
 * graded, exactly as it did before this module existed. Treat the PIN
 * like a lock-screen code, not like the API key's actual security
 * boundary.
 */

const VAULT_STORAGE_KEY = 'pj_key_vault';
const PBKDF2_ITERATIONS = 200_000;

interface StoredVault {
  salt: string; // base64
  iv: string; // base64
  cipherText: string; // base64
}

function bufToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Whether an encrypted key vault currently exists in this browser. */
export function hasVault(): boolean {
  return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
}

/** Permanently deletes the stored encrypted vault (e.g. on "forgot PIN"). */
export function clearVault(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
}

/**
 * Encrypts apiKey with a key derived from pin and stores it, replacing any
 * existing vault. Used both to create a vault the first time and to
 * change the saved key / PIN later — no knowledge of a previous PIN is
 * required to overwrite it, since Settings is already an authenticated
 * area of the app.
 */
export async function createVault(pin: string, apiKey: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(apiKey));
  const stored: StoredVault = {
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    cipherText: bufToBase64(cipherBuf)
  };
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Decrypts and returns the saved API key using pin. Throws with a
 * user-facing message if no vault exists or the PIN is wrong (AES-GCM's
 * authentication tag fails to verify on any incorrect key).
 */
export async function unlockVault(pin: string): Promise<string> {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) throw new Error('No saved API key found on this device.');

  let stored: StoredVault;
  try {
    stored = JSON.parse(raw);
  } catch {
    throw new Error('Saved key data is corrupted.');
  }

  const salt = new Uint8Array(base64ToBuf(stored.salt));
  const iv = new Uint8Array(base64ToBuf(stored.iv));
  const key = await deriveKey(pin, salt);

  try {
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, base64ToBuf(stored.cipherText));
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error('Incorrect PIN.');
  }
}
