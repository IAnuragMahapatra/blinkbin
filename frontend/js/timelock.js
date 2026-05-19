// time-lock via drand IBE — wraps tlock-js + drand-client from vendor bundle
// assumes vendor/timelock.bundle.js is loaded and exposes window.tlock

import { DRAND_GENESIS, DRAND_PERIOD } from "./constants.js";

const DRAND_CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const DRAND_API   = `https://api.drand.sh/${DRAND_CHAIN}`;

//  Round
export function computeRound(unlockUnixSec) {
  return Math.floor((unlockUnixSec - DRAND_GENESIS) / DRAND_PERIOD);
}

export function roundToUnix(roundId) {
  return DRAND_GENESIS + roundId * DRAND_PERIOD;
}

//  IBE encrypt
// plaintext: Uint8Array — the AES key bytes (or wrapped key bytes)
// returns: Uint8Array of IBE ciphertext
export async function ibeEncrypt(plaintext, roundId) {
  const { timelockEncrypt, quicknetClient, Buffer } = window.tlock;
  const client = quicknetClient();
  // timelockEncrypt(roundNumber, payload: Buffer/Uint8Array, chainClient)
  // returns base64 string or encrypted payload format. Wait, tlock-js returns string!
  // Let's await it and encode if needed.
  const lockedStr = await timelockEncrypt(roundId, Buffer.from(plaintext), client);
  // Actually, tlock-js timelockEncrypt returns string (which is the age-encrypted payload).
  // We need to store it as bytes or base64. Let's just return the bytes of the string.
  return new TextEncoder().encode(lockedStr);
}

//IBE decrypt
// fetches drand round output, then IBE-decrypts
// returns: Uint8Array
export async function ibeDecrypt(lockedBytes, roundId) {
  const { timelockDecrypt, quicknetClient } = window.tlock;
  const client = quicknetClient();
  const lockedStr = new TextDecoder().decode(lockedBytes);
  const decryptedBuf = await timelockDecrypt(lockedStr, client);
  return new Uint8Array(decryptedBuf);
}

//  Fetch drand round output
export async function fetchDrandRound(roundId) {
  const { quicknetClient } = window.tlock;
  const client = quicknetClient();
  return client.get(roundId);
}

//  Availability check
export async function checkDrandAvailable() {
  try {
    const res = await fetch(`${DRAND_API}/info`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
