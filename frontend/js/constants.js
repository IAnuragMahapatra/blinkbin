// shared constants — single source of truth for both frontend and spec
export const HARD_EXPIRY_DAYS = 30;
export const DRAND_GENESIS = 1692803367;
export const DRAND_PERIOD = 3; // seconds per round
export const PBKDF2_ITERATIONS = 100_000;
export const API_BASE = "/api";

// paste content limits (plaintext bytes)
export const SIZE_WARN_BYTES = 700_000;  // ~700KB → show amber warning
export const SIZE_HARD_BYTES = 750_000;  // ~750KB → block input (base64 headroom)
