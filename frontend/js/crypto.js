// AES-256-GCM + PBKDF2 — Web Crypto API only, no external libs
// IV is always 12 bytes prepended to ciphertext in base64 payload

// ─── Key generation ───────────────────────────────────────
export async function generateAESKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function importKey(raw) {
  return crypto.subtle.importKey(
    "raw", raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ─── Encrypt / Decrypt ────────────────────────────────────
export async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes — AES-GCM spec
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const cipherBytes = new Uint8Array(cipherBuf);

  // prepend IV: [12 bytes iv][ciphertext]
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, 12);
  return toBase64(combined);
}

export async function decrypt(base64Payload, key) {
  const combined = fromBase64(base64Payload);
  const iv         = combined.slice(0, 12);  // first 12 bytes
  const ciphertext = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

// ─── Password layer ───────────────────────────────────────
import { PBKDF2_ITERATIONS } from "./constants.js";

export async function derivePasswordKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// wraps the raw AES key bytes with the password-derived key
export async function wrapKey(aesKeyBytes, passwordKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    passwordKey,
    aesKeyBytes,
  );
  const wrapped = new Uint8Array(iv.length + new Uint8Array(wrapBuf).length);
  wrapped.set(iv, 0);
  wrapped.set(new Uint8Array(wrapBuf), 12);
  return wrapped;
}

// unwraps and returns raw key bytes
export async function unwrapKey(wrappedBytes, passwordKey) {
  const iv         = wrappedBytes.slice(0, 12);
  const ciphertext = wrappedBytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    passwordKey,
    ciphertext,
  );
  return new Uint8Array(plainBuf);
}

// ─── Fragment encoding ────────────────────────────────────
// always use standard base64 (not base64url) — dot separator is safe

export function buildFragment(aesKeyBytes, salt = null, wrappedOrLocked = null) {
  if (!salt && !wrappedOrLocked) {
    // no password, no dead drop — just the key
    return toBase64(aesKeyBytes);
  }
  // password or dead drop — salt.payload format
  const saltB64    = toBase64(salt);
  const payloadB64 = toBase64(wrappedOrLocked);
  return `${saltB64}.${payloadB64}`;
}

export function parseFragment(fragment) {
  const dotIdx = fragment.indexOf(".");
  if (dotIdx === -1) {
    // plain key — no password, no dead drop
    return { type: "plain", keyBytes: fromBase64(fragment) };
  }
  // salt.payload format
  const salt    = fromBase64(fragment.slice(0, dotIdx));
  const payload = fromBase64(fragment.slice(dotIdx + 1));
  return { type: "password", salt, payload };
}

// ─── Base64 helpers ───────────────────────────────────────
export function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
