// Encrypted WiGLE credential vault (AES-GCM, PBKDF2-derived from a PIN).
// Same pattern as certforge/js/vault.js: the encrypted blob lives in localStorage,
// the unlocked credential only in sessionStorage (gone when the tab closes).
// The credential is sent ONLY to api.wigle.net, straight from this browser.

const VAULT_STORAGE = 'ghosttown_wigle_vault_v1';
const SESSION_STORAGE = 'ghosttown_wigle_session_v1';
const PBKDF2_ITERATIONS = 200000;

function safeGet(store, k) { try { return store.getItem(k); } catch { return null; } }
function safeSet(store, k, v) { try { store.setItem(k, v); return true; } catch { return false; } }
function safeDel(store, k) { try { store.removeItem(k); } catch { /* ignore */ } }

let unlocked = safeGet(sessionStorage, SESSION_STORAGE);   // "apiName:apiToken" or null

export const getCredential = () => unlocked;
export const hasVault = () => Boolean(safeGet(localStorage, VAULT_STORAGE));
export function lock() { unlocked = null; safeDel(sessionStorage, SESSION_STORAGE); }
export function forget() { lock(); safeDel(localStorage, VAULT_STORAGE); }

function setUnlocked(cred) {
  unlocked = cred;
  safeSet(sessionStorage, SESSION_STORAGE, cred);
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function deriveKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function createVault(pin, apiName, apiToken) {
  const cred = `${apiName.trim()}:${apiToken.trim()}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(cred));
  if (!safeSet(localStorage, VAULT_STORAGE, JSON.stringify({ salt: b64(salt), iv: b64(iv), cipherText: b64(cipher) }))) {
    throw new Error('This browser is blocking local storage, so the key can\'t be saved.');
  }
  setUnlocked(cred);
}

export async function unlockVault(pin) {
  const raw = safeGet(localStorage, VAULT_STORAGE);
  if (!raw) throw new Error('No saved WiGLE key on this device.');
  let stored;
  try { stored = JSON.parse(raw); } catch { throw new Error('Saved key data is corrupted — forget it and re-enter.'); }
  const key = await deriveKey(pin, unb64(stored.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(stored.iv) }, key, unb64(stored.cipherText));
    setUnlocked(new TextDecoder().decode(plain));
  } catch {
    throw new Error('Incorrect PIN.');
  }
}
