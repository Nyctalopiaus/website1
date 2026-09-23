// Encrypted API key vault (AES-GCM, PBKDF2 derived from PIN)

import {
  AI_GEMINI_SESSION_KEY_STORAGE,
  AI_GEMINI_KEY_STORAGE,
  AI_GEMINI_VAULT_STORAGE,
  AI_GEMINI_MODEL_STORAGE,
  AI_GEMINI_DEFAULT_MODEL,
  AI_VAULT_PBKDF2_ITERATIONS
} from './config.js';

export let unlockedGeminiKey = sessionStorage.getItem(AI_GEMINI_SESSION_KEY_STORAGE) || null;
export let pendingUnlockCallback = null;
export function setPendingUnlockCallback(cb) { pendingUnlockCallback = cb; }

export function getUnlockedGeminiKey() {
  return unlockedGeminiKey;
}

export function setUnlockedGeminiKey(key) {
  unlockedGeminiKey = key || null;
  if (unlockedGeminiKey) {
    sessionStorage.setItem(AI_GEMINI_SESSION_KEY_STORAGE, unlockedGeminiKey);
  } else {
    sessionStorage.removeItem(AI_GEMINI_SESSION_KEY_STORAGE);
  }
}

export function aiBufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function aiBase64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function aiDeriveVaultKey(pin, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: AI_VAULT_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function hasGeminiVault() {
  return Boolean(localStorage.getItem(AI_GEMINI_VAULT_STORAGE));
}

export function clearGeminiVault() {
  localStorage.removeItem(AI_GEMINI_VAULT_STORAGE);
}

export async function createGeminiVault(pin, apiKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aiDeriveVaultKey(pin, salt);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
  localStorage.setItem(AI_GEMINI_VAULT_STORAGE, JSON.stringify({
    salt: aiBufToBase64(salt.buffer),
    iv: aiBufToBase64(iv.buffer),
    cipherText: aiBufToBase64(cipherBuf)
  }));
}

export async function unlockGeminiVault(pin) {
  const raw = localStorage.getItem(AI_GEMINI_VAULT_STORAGE);
  if (!raw) throw new Error('No saved API key found on this device.');

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    throw new Error('Saved key data is corrupted.');
  }

  const salt = new Uint8Array(aiBase64ToBuf(stored.salt));
  const iv = new Uint8Array(aiBase64ToBuf(stored.iv));
  const key = await aiDeriveVaultKey(pin, salt);

  try {
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, aiBase64ToBuf(stored.cipherText));
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error('Incorrect PIN.');
  }
}

export function getGeminiApiKey() {
  if (unlockedGeminiKey) return unlockedGeminiKey;
  return localStorage.getItem(AI_GEMINI_KEY_STORAGE) || '';
}

export function getGeminiModel() {
  return localStorage.getItem(AI_GEMINI_MODEL_STORAGE) || AI_GEMINI_DEFAULT_MODEL;
}
