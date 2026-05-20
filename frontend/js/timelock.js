// Time-lock encryption using the drand network

import { DRAND_GENESIS, DRAND_PERIOD } from "./constants.js";

const DRAND_CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const DRAND_API   = `https://api.drand.sh/${DRAND_CHAIN}`;

export function computeRound(unlockUnixSec) {
  return Math.floor((unlockUnixSec - DRAND_GENESIS) / DRAND_PERIOD);
}

export function roundToUnix(roundId) {
  return DRAND_GENESIS + roundId * DRAND_PERIOD;
}

// The AES key bytes to encrypt
export async function ibeEncrypt(plaintext, roundId) {
  const { timelockEncrypt, quicknetClient, Buffer } = window.tlock;
  const client = quicknetClient();
  const lockedStr = await timelockEncrypt(roundId, Buffer.from(plaintext), client);
  return new TextEncoder().encode(lockedStr);
}

// Fetch the drand round output and decrypt the key
export async function ibeDecrypt(lockedBytes, roundId) {
  const { timelockDecrypt, quicknetClient } = window.tlock;
  const client = quicknetClient();
  const lockedStr = new TextDecoder().decode(lockedBytes);
  const decryptedBuf = await timelockDecrypt(lockedStr, client);
  return new Uint8Array(decryptedBuf);
}

export async function fetchDrandRound(roundId) {
  const { quicknetClient } = window.tlock;
  const client = quicknetClient();
  return client.get(roundId);
}

export async function checkDrandAvailable() {
  try {
    const res = await fetch(`${DRAND_API}/info`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
