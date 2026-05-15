import {
  generateAESKey, encrypt, decrypt, exportKey, importKey,
  derivePasswordKey, wrapKey, unwrapKey,
  toBase64, fromBase64,
} from "./crypto.js";
import { toast, toastError, toastSuccess, copyToClipboard, formatDate, formatDatetime } from "./ui.js";

const STORAGE_KEY_ENC  = "blinkbin_history_encrypted";
const STORAGE_KEY_SALT = "blinkbin_history_salt";
const STORAGE_KEY_DATA = "blinkbin_history_data";
const PENDING_KEY      = "blinkbin_pending_history";

// history is always encrypted — no opt-out
let historyKey = null; // AES CryptoKey for session

const $ = (id) => document.getElementById(id);

// ─── Init ─────────────────────────────────────────────────
async function init() {
  const hasHistory = localStorage.getItem(STORAGE_KEY_DATA);
  const hasSalt    = localStorage.getItem(STORAGE_KEY_SALT);

  if (!hasHistory && !hasSalt) {
    showSetupGate();
  } else {
    showUnlockGate();
  }
}

// ─── First-time setup ─────────────────────────────────────
function showSetupGate() {
  const gate = $("history-gate");
  gate.hidden = false;
  $("gate-title").textContent   = "Set up paste history";
  $("gate-subtitle").textContent = "Choose a password to encrypt your paste history locally. This password is never sent to any server.";
  $("gate-warning").hidden      = false;

  const form     = $("gate-form");
  const inputEl  = $("gate-password");
  const confirmEl = $("gate-confirm");
  const errEl    = $("gate-error");

  if (confirmEl) confirmEl.hidden = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;

    const pwd     = inputEl.value;
    const confirm = confirmEl?.value;

    if (pwd.length < 8) { errEl.textContent = "Password must be at least 8 characters"; errEl.hidden = false; return; }
    if (pwd !== confirm) { errEl.textContent = "Passwords do not match"; errEl.hidden = false; return; }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    historyKey = await derivePasswordKey(pwd, salt);
    localStorage.setItem(STORAGE_KEY_ENC, "true");
    localStorage.setItem(STORAGE_KEY_SALT, toBase64(salt));

    // initialize with empty history
    await saveEntries([]);

    // import any pending history from create page
    await importPending();

    gate.hidden = true;
    await showHistory();
  });
}

// ─── Unlock gate ──────────────────────────────────────────
function showUnlockGate() {
  const gate = $("history-gate");
  gate.hidden = false;
  $("gate-title").textContent    = "Your paste history";
  $("gate-subtitle").textContent = "Enter your history password to decrypt.";

  const form    = $("gate-form");
  const inputEl = $("gate-password");
  const errEl   = $("gate-error");
  const confirm = $("gate-confirm");
  if (confirm) confirm.hidden = true;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;

    const pwd  = inputEl.value;
    const salt = fromBase64(localStorage.getItem(STORAGE_KEY_SALT));

    try {
      historyKey = await derivePasswordKey(pwd, salt);
      // verify by decrypting
      await loadEntries();
      gate.hidden = true;
      await importPending();
      await showHistory();
    } catch {
      errEl.textContent = "Incorrect password.";
      errEl.hidden = false;
      inputEl.value = "";
    }
  });
}

// ─── Show table ───────────────────────────────────────────
async function showHistory() {
  const entries = await loadEntries();
  const tableSection = $("history-section");
  tableSection.hidden = false;

  if (entries.length === 0) {
    $("empty-history").hidden = false;
    $("history-table-wrap").hidden = true;
    return;
  }

  $("empty-history").hidden = true;
  $("history-table-wrap").hidden = false;

  renderTable(entries);
}

// ─── Render table ─────────────────────────────────────────
let sortCol = "created_at";
let sortAsc = false;

function renderTable(entries) {
  const tbody = $("history-tbody");
  const sorted = [...entries].sort((a, b) => {
    const av = a[sortCol] ?? 0;
    const bv = b[sortCol] ?? 0;
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  tbody.innerHTML = sorted.map((e, i) => `
    <tr>
      <td>${escHtml(e.label || "Untitled")}</td>
      <td><span class="badge badge-amber">${escHtml(e.language || "plaintext")}</span></td>
      <td>${formatDate(e.created_at)}</td>
      <td>${e.unlock_at
          ? `Unlocks ${formatDate(e.unlock_at)} · Expires ${formatDate(e.expires_at)}`
          : formatDate(e.expires_at)}</td>
      <td class="flex gap-2">
        <button class="btn btn-ghost" style="padding:var(--sp-1) var(--sp-3);min-height:36px;font-size:var(--text-xs)"
          onclick="copyEntry(${i})">Copy</button>
        <button class="btn btn-ghost" style="padding:var(--sp-1) var(--sp-3);min-height:36px;font-size:var(--text-xs)"
          onclick="openEntry(${i})">Open</button>
        <button class="btn btn-ghost" style="padding:var(--sp-1) var(--sp-3);min-height:36px;font-size:var(--text-xs);color:var(--color-danger)"
          onclick="deleteEntry(${i})">Remove</button>
      </td>
    </tr>`).join("");

  // expose entry access globally for inline handlers
  window._historyEntries = sorted;
}

window.copyEntry   = (i) => copyToClipboard(window._historyEntries[i].url);
window.openEntry   = (i) => window.open(window._historyEntries[i].url, "_blank");
window.deleteEntry = async (i) => {
  const entries = await loadEntries();
  entries.splice(i, 1);
  await saveEntries(entries);
  await showHistory();
};

// sortable column headers
document.querySelectorAll(".history-table th[data-col]").forEach((th) => {
  th.addEventListener("click", async () => {
    if (sortCol === th.dataset.col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = th.dataset.col;
      sortAsc = false;
    }
    const entries = await loadEntries();
    renderTable(entries);
  });
});

// ─── Encrypted storage ────────────────────────────────────
async function saveEntries(entries) {
  const json       = JSON.stringify(entries);
  const encrypted  = await encrypt(json, historyKey);
  localStorage.setItem(STORAGE_KEY_DATA, encrypted);
}

async function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY_DATA);
  if (!raw) return [];
  const json = await decrypt(raw, historyKey);
  return JSON.parse(json);
}

// ─── Import pending from create page ─────────────────────
async function importPending() {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  try {
    const pending = JSON.parse(raw);
    const existing = await loadEntries();
    const merged = [...pending.map((p) => ({
      paste_id:   p.paste_id,
      url:        p.url,
      label:      p.label,
      language:   p.language,
      created_at: p.created_at,
      expires_at: p.hard_delete_at,
      unlock_at:  p.unlock_at || null,
    })), ...existing];
    await saveEntries(merged);
    localStorage.removeItem(PENDING_KEY);
  } catch { /* malformed pending — discard */ }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Start ────────────────────────────────────────────────
init();
