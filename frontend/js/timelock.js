// time-lock via drand IBE — wraps tlock-js + drand-client from vendor bundle
// assumes vendor/timelock.bundle.js is loaded and exposes window.tlock

import { DRAND_GENESIS, DRAND_PERIOD } from "./constants.js";

const DRAND_CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const DRAND_API   = `https://api.drand.sh/${DRAND_CHAIN}`;

// ─── Round ───────────────────────────────────────────────
export function computeRound(unlockUnixSec) {
  return Math.floor((unlockUnixSec - DRAND_GENESIS) / DRAND_PERIOD);
}

export function roundToUnix(roundId) {
  return DRAND_GENESIS + roundId * DRAND_PERIOD;
}

// ─── IBE encrypt ─────────────────────────────────────────
// plaintext: Uint8Array — the AES key bytes (or wrapped key bytes)
// returns: Uint8Array of IBE ciphertext
export async function ibeEncrypt(plaintext, roundId) {
  const { timelockEncrypt } = window.tlock;
  const locked = await timelockEncrypt(
    plaintext,
    roundId,
    { chainHash: DRAND_CHAIN },
  );
  return locked;
}

// ─── IBE decrypt ─────────────────────────────────────────
// fetches drand round output, then IBE-decrypts
// returns: Uint8Array
export async function ibeDecrypt(lockedBytes, roundId) {
  const { timelockDecrypt } = window.tlock;
  const roundOutput = await fetchDrandRound(roundId);
  return timelockDecrypt(lockedBytes, roundOutput);
}

// ─── Fetch drand round output ─────────────────────────────
export async function fetchDrandRound(roundId) {
  const res = await fetch(`${DRAND_API}/public/${roundId}`);
  if (!res.ok) throw new Error(`drand fetch failed: ${res.status}`);
  const json = await res.json();
  return json; // tlock-js expects the full response object
}

// ─── Availability check ───────────────────────────────────
export async function checkDrandAvailable() {
  try {
    const res = await fetch(`${DRAND_API}/info`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
