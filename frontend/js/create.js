import { API_BASE, SIZE_WARN_BYTES, SIZE_HARD_BYTES, HARD_EXPIRY_DAYS } from "./constants.js";
import {
  generateAESKey, exportKey, encrypt,
  derivePasswordKey, wrapKey, buildFragment, toBase64,
} from "./crypto.js";
import { computeRound, ibeEncrypt, roundToUnix } from "./timelock.js";
import { toast, toastError, toastSuccess, copyToClipboard, formatDate, formatDatetime } from "./ui.js";

const $ = (id) => document.getElementById(id);

// ─── Form elements ────────────────────────────────────────
const editorEl      = $("editor");
const sizeCounterEl = $("size-counter");
const langEl        = $("language");
const passwordEl    = $("password");
const passwordTogEl = $("password-toggle");
const deadDropCheck = $("dead-drop-enable");
const deadDropInput = $("dead-drop-datetime");
const burnGroup     = document.querySelectorAll('input[name="burn"]');
const ttlSection    = $("ttl-section");
const ttlPresets    = document.querySelectorAll(".ttl-preset");
const ttlCustomWrap = $("ttl-custom");
const ttlCustomEl   = $("ttl-custom-input");
const labelEl       = $("label");
const submitBtn     = $("submit-btn");
const formEl        = $("create-form");
const successEl     = $("success-section");
const formSection   = $("form-section");
const mdToggleGroup = $("md-toggle-group");
const btnModeEdit   = $("btn-mode-edit");
const btnModePreview= $("btn-mode-preview");
const editorContainer = $("editor-container");
const mdPreview     = $("md-preview");
const deadDropNote  = $("dead-drop-ttl-note");

// ─── State ────────────────────────────────────────────────
let selectedTTL = null; // null | seconds

// ─── Size counter ─────────────────────────────────────────
editorEl.addEventListener("input", () => {
  const bytes = new TextEncoder().encode(editorEl.value).length;
  const kb = (bytes / 1024).toFixed(0);
  sizeCounterEl.textContent = `${kb} KB / 750 KB`;

  if (bytes >= SIZE_HARD_BYTES) {
    sizeCounterEl.className = "size-counter full";
    editorEl.className = "paste-editor full";
    // trim to keep under limit
    while (new TextEncoder().encode(editorEl.value).length > SIZE_HARD_BYTES) {
      editorEl.value = editorEl.value.slice(0, -1);
    }
  } else if (bytes >= SIZE_WARN_BYTES) {
    sizeCounterEl.className = "size-counter warn";
    editorEl.className = "paste-editor warn";
  } else {
    sizeCounterEl.className = "size-counter";
    editorEl.className = "paste-editor";
  }
});

// ─── Password visibility toggle ───────────────────────────
passwordTogEl.addEventListener("click", () => {
  const isText = passwordEl.type === "text";
  passwordEl.type = isText ? "password" : "text";
  passwordTogEl.innerHTML = isText ? EYE_ICON : EYE_OFF_ICON;
});

// ─── Language → markdown preview ──────────────────────────
langEl.addEventListener("change", () => {
  if (langEl.value === "markdown") {
    mdToggleGroup.hidden = false;
    renderMarkdownPreview();
  } else {
    mdToggleGroup.hidden = true;
    editorContainer.classList.remove("show-preview");
    btnModePreview.classList.remove("active");
    btnModeEdit.classList.add("active");
  }
});

btnModeEdit.addEventListener("click", () => {
  editorContainer.classList.remove("show-preview");
  btnModePreview.classList.remove("active");
  btnModeEdit.classList.add("active");
});

btnModePreview.addEventListener("click", () => {
  editorContainer.classList.add("show-preview");
  btnModeEdit.classList.remove("active");
  btnModePreview.classList.add("active");
  renderMarkdownPreview();
});

editorEl.addEventListener("input", () => {
  if (langEl.value === "markdown") renderMarkdownPreview();
});

function renderMarkdownPreview() {
  if (window.marked) {
    mdPreview.innerHTML = window.marked.parse(editorEl.value || "");
  }
}

// ─── Dead Drop toggle ─────────────────────────────────────
deadDropCheck.addEventListener("change", () => {
  const enabled = deadDropCheck.checked;
  deadDropInput.disabled = !enabled;
  if (enabled) {
    // min = now + 1 minute
    const minDt = new Date(Date.now() + 60_000);
    deadDropInput.min = minDt.toISOString().slice(0, 16);
  }
  if (deadDropNote) deadDropNote.hidden = !enabled;
});

// ─── Burn radio ───────────────────────────────────────────
burnGroup.forEach((radio) => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".burn-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
    radio.closest(".burn-option")?.classList.add("selected");
    ttlSection.hidden = radio.value !== "ttl";
    selectedTTL = null;
    ttlPresets.forEach((p) => p.classList.remove("active"));
  });
});

// ─── TTL presets ──────────────────────────────────────────
const TTL_MAP = { "10m": 600, "1h": 3600, "1d": 86400, "1w": 604800 };

ttlPresets.forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.ttl;
    if (val === "custom") {
      selectedTTL = null;
      ttlCustomWrap.hidden = false;
    } else {
      selectedTTL = TTL_MAP[val];
      ttlCustomWrap.hidden = true;
    }
    ttlPresets.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
  });
});

ttlCustomEl?.addEventListener("change", () => {
  const v = parseInt(ttlCustomEl.value, 10);
  const max = HARD_EXPIRY_DAYS * 86400;
  selectedTTL = Math.min(Math.max(v, 60), max);
});

// ─── Form submit ──────────────────────────────────────────
formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const content = editorEl.value.trim();
  if (!content) { toastError("Paste content cannot be empty"); return; }

  const password    = passwordEl.value;
  const language    = langEl.value;
  const label       = labelEl?.value.trim() || null;
  const burnVal     = document.querySelector('input[name="burn"]:checked')?.value || "never";
  const isDeadDrop  = deadDropCheck.checked && deadDropInput.value;

  // validate dead drop datetime
  let unlockUnix = null;
  let roundId    = null;
  if (isDeadDrop) {
    unlockUnix = Math.floor(new Date(deadDropInput.value).getTime() / 1000);
    if (unlockUnix <= Math.floor(Date.now() / 1000)) {
      toastError("Unlock time must be in the future"); return;
    }
    roundId = computeRound(unlockUnix);
  }

  // validate TTL
  let burnAfterTTL = null;
  if (burnVal === "ttl") {
    if (!selectedTTL) { toastError("Select a TTL duration"); return; }
    burnAfterTTL = selectedTTL;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Encrypting...";

  try {
    // 1. generate AES key
    const aesKey     = await generateAESKey();
    const aesKeyBytes = await exportKey(aesKey);

    // 2. encrypt content
    const ciphertext = await encrypt(content, aesKey);

    // 3. build fragment
    let fragment;
    let payloadBytes = aesKeyBytes;

    if (password) {
      const salt       = crypto.getRandomValues(new Uint8Array(16));
      const pswdKey    = await derivePasswordKey(password, salt);
      const wrapped    = await wrapKey(aesKeyBytes, pswdKey);
      payloadBytes     = wrapped;
      if (isDeadDrop) {
        // password + dead drop: IBE-encrypt the wrapped key
        const locked = await ibeEncrypt(wrapped, roundId);
        fragment = buildFragment(null, salt, locked);
      } else {
        fragment = buildFragment(null, salt, wrapped);
      }
    } else if (isDeadDrop) {
      // dead drop, no password: IBE-encrypt raw AES key
      const locked = await ibeEncrypt(aesKeyBytes, roundId);
      fragment = toBase64(locked); // no dot, no salt
    } else {
      // plain: just the key
      fragment = buildFragment(aesKeyBytes);
    }

    submitBtn.textContent = "Creating paste...";

    // 4. POST to API
    const res = await fetch(`${API_BASE}/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ciphertext,
        burn_on_read: burnVal === "read",
        burn_after_ttl_seconds: burnAfterTTL,
        round_id: roundId,
        unlock_at_unix: unlockUnix,
        language,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const { paste_id, hard_delete_at, unlock_at } = await res.json();
    const url = `${location.origin}/p/${paste_id}#${fragment}`;

    // 5. save to history
    saveHistory({ paste_id, url, label, language, hard_delete_at, unlock_at });

    // 6. show success
    showSuccess(url, hard_delete_at, unlock_at, burnVal);

  } catch (err) {
    toastError(err.message || "Something went wrong");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Paste";
  }
});

// ─── Success view ─────────────────────────────────────────
function showSuccess(url, hardDeleteAt, unlockAt, burnVal) {
  formSection.hidden = true;
  successEl.hidden = false;

  $("success-url").textContent = url;

  const expiryText = unlockAt
    ? `Unlocks ${formatDatetime(unlockAt)} · Expires ${formatDate(hardDeleteAt)}`
    : `Expires ${formatDate(hardDeleteAt)}`;
  $("success-expiry").textContent = expiryText;

  $("success-copy-btn").addEventListener("click", () => {
    copyToClipboard(url, $("success-copy-btn"));
  });

  $("create-another").addEventListener("click", () => {
    formSection.hidden = false;
    successEl.hidden = true;
    formEl.reset();
    editorEl.value = "";
    sizeCounterEl.textContent = "0 KB / 750 KB";
    selectedTTL = null;
  });
}

// ─── History helpers ──────────────────────────────────────
function saveHistory(entry) {
  try {
    const stored = localStorage.getItem("blinkbin_pending_history");
    const pending = stored ? JSON.parse(stored) : [];
    pending.unshift({ ...entry, created_at: Math.floor(Date.now() / 1000) });
    localStorage.setItem("blinkbin_pending_history", JSON.stringify(pending.slice(0, 50)));
  } catch { /* storage unavailable */ }
}

// ─── SVG icons (inline) ───────────────────────────────────
const EYE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
