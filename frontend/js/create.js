import { API_BASE, SIZE_WARN_BYTES, SIZE_HARD_BYTES, HARD_EXPIRY_DAYS } from "./constants.js";
import {
  generateAESKey, exportKey, encrypt,
  derivePasswordKey, wrapKey, buildFragment, toBase64, fromBase64,
  generateEphemeralECDH, ecdhDeriveAESKey
} from "./crypto.js";
import { computeRound, ibeEncrypt, roundToUnix } from "./timelock.js";
import { toast, toastError, toastSuccess, copyToClipboard, formatDate, formatDatetime } from "./ui.js";
import { setupCustomSelect } from "./custom-select.js";

const $ = (id) => document.getElementById(id);

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
const layoutCreate  = document.querySelector(".layout-create");
const mdToggleGroup = $("md-toggle-group");
const btnModeEdit   = $("btn-mode-edit");
const btnModePreview= $("btn-mode-preview");
const editorContainer = $("editor-container");
const mdPreview     = $("md-preview");
const deadDropNote  = $("dead-drop-ttl-note");

let selectedTTL = null; // Either null or a number of seconds

setupCustomSelect(langEl);
let fpInstance = null;
if (window.flatpickr) {
  fpInstance = window.flatpickr(deadDropInput, {
    enableTime: true,
    minDate: new Date(Date.now() + 60_000),
    disableMobile: true, // Keep the Flatpickr UI on mobile devices
    monthSelectorType: "static", // Remove the native dropdown styling
    onChange: function(selectedDates, dateStr, instance) {
      // Stop the hour input from highlighting when you click a date
      if (instance.timeContainer && instance.timeContainer.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
  });
}

editorEl.addEventListener("input", () => {
  const bytes = new TextEncoder().encode(editorEl.value).length;
  const kb = (bytes / 1024).toFixed(0);
  sizeCounterEl.textContent = `${kb} KB / 750 KB`;

  if (bytes >= SIZE_HARD_BYTES) {
    sizeCounterEl.className = "size-counter full";
    editorEl.className = "paste-editor full";
    // Stop typing when the limit is reached
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

passwordTogEl.addEventListener("click", () => {
  const isText = passwordEl.type === "text";
  passwordEl.type = isText ? "password" : "text";
  passwordTogEl.innerHTML = isText ? EYE_ICON : EYE_OFF_ICON;
});

langEl.addEventListener("change", () => {
  renderPreview();
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
  renderPreview();
});

editorEl.addEventListener("input", () => {
  if (editorContainer.classList.contains("show-preview")) renderPreview();
});

function renderPreview() {
  const lang = langEl.value;
  const content = editorEl.value || "";
  
  if (lang === "markdown") {
    if (window.marked) {
      mdPreview.innerHTML = window.marked.parse(content);
      window.Prism?.highlightAllUnder(mdPreview);
    }
  } else if (lang === "plaintext") {
    mdPreview.innerHTML = `<pre>${escHtml(content)}</pre>`;
  } else {
    const code = document.createElement("code");
    code.className = `language-${lang}`;
    code.textContent = content;
    const pre = document.createElement("pre");
    pre.appendChild(code);
    mdPreview.innerHTML = "";
    mdPreview.appendChild(pre);
    window.Prism?.highlightElement(code);
  }
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

deadDropCheck.addEventListener("change", () => {
  const enabled = deadDropCheck.checked;
  deadDropInput.disabled = !enabled;
  if (enabled) {
    // Require at least 1 minute in the future
    const minDt = new Date(Date.now() + 60_000);
    deadDropInput.min = minDt.toISOString().slice(0, 16);
    if (fpInstance) {
      fpInstance.set("minDate", minDt);
    }
  }
  if (deadDropNote) deadDropNote.hidden = !enabled;
});

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

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const content = editorEl.value.trim();
  if (!content) { toastError("Paste content cannot be empty"); return; }

  const password    = passwordEl.value;
  const language    = langEl.value;
  const label       = labelEl?.value.trim() || null;
  const burnVal     = document.querySelector('input[name="burn"]:checked')?.value || "never";
  const isDeadDrop  = deadDropCheck.checked && deadDropInput.value;

  // Check the unlock time
  let unlockUnix = null;
  let roundId    = null;
  if (isDeadDrop) {
    unlockUnix = Math.floor(new Date(deadDropInput.value).getTime() / 1000);
    if (unlockUnix <= Math.floor(Date.now() / 1000)) {
      toastError("Unlock time must be in the future"); return;
    }
    roundId = computeRound(unlockUnix);
  }

  // Check the TTL
  let burnAfterTTL = null;
  if (burnVal === "ttl") {
    if (!selectedTTL) { toastError("Select a TTL duration"); return; }
    burnAfterTTL = selectedTTL;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Encrypting...";

  try {
    const aesKey     = await generateAESKey();
    const aesKeyBytes = await exportKey(aesKey);

    const ciphertext = await encrypt(content, aesKey);

    let fragment;
    let payloadBytes = aesKeyBytes;

    if (password) {
      const salt       = crypto.getRandomValues(new Uint8Array(16));
      const pswdKey    = await derivePasswordKey(password, salt);
      const wrapped    = await wrapKey(aesKeyBytes, pswdKey);
      payloadBytes     = wrapped;
      if (isDeadDrop) {
        // Encrypt the wrapped key if both password and time-lock are used
        const locked = await ibeEncrypt(wrapped, roundId);
        fragment = buildFragment(null, salt, locked);
      } else {
        fragment = buildFragment(null, salt, wrapped);
      }
    } else if (isDeadDrop) {
      // Time-lock the raw key if there is no password
      const locked = await ibeEncrypt(aesKeyBytes, roundId);
      fragment = toBase64(locked); // no dot, no salt
    } else {
      fragment = buildFragment(aesKeyBytes);
    }

    submitBtn.textContent = "Creating paste...";

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

    await saveHistory({ paste_id, url, label, language, hard_delete_at, unlock_at, paste_password: password || null });

    showSuccess(url, hard_delete_at, unlock_at, burnVal);

  } catch (err) {
    toastError(err.message || "Something went wrong");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Paste";
  }
});

function showSuccess(url, hardDeleteAt, unlockAt, burnVal) {
  layoutCreate.hidden = true;
  successEl.hidden = false;

  $("success-url").textContent = url;

  const expiryText = unlockAt
    ? `Unlocks ${formatDatetime(unlockAt)} · Expires ${formatDate(hardDeleteAt)}`
    : `Expires ${formatDate(hardDeleteAt)}`;
  $("success-expiry").textContent = expiryText;

  const warningTextEl = $("success-warning-text");
  if (!localStorage.getItem("blinkbin_history_pub")) {
    if (warningTextEl) {
      warningTextEl.innerHTML = `<strong>Warning:</strong> You have not set up paste history. Save this link now, or it will be lost forever when you leave this page. <a href="/history.html" style="color: inherit; text-decoration: underline;">Set up history</a>`;
    }
  } else {
    if (warningTextEl) {
      warningTextEl.textContent = "Save this link now. It has been securely added to your local paste history.";
    }
  }

  $("success-copy-btn").addEventListener("click", () => {
    copyToClipboard(url, $("success-copy-btn"));
  });

  $("create-another").addEventListener("click", () => {
    layoutCreate.hidden = false;
    successEl.hidden = true;
    formEl.reset();
    editorEl.value = "";
    sizeCounterEl.textContent = "0 KB / 750 KB";
    selectedTTL = null;
  });
}

async function saveHistory(entry) {
  try {
    const pubB64 = localStorage.getItem("blinkbin_history_pub");
    if (!pubB64) return; // Stop if history is not set up

    const pubKeyBytes = fromBase64(pubB64);
    const { privateKey: ephPriv, publicKey: ephPub } = generateEphemeralECDH();
    const aesKey = await ecdhDeriveAESKey(ephPriv, pubKeyBytes);

    const fullEntry = { ...entry, created_at: Math.floor(Date.now() / 1000) };
    const ciphertext = await encrypt(JSON.stringify(fullEntry), aesKey);

    const payload = {
      ephemeral_public_key: toBase64(ephPub),
      ciphertext
    };

    const stored = localStorage.getItem("blinkbin_pending_history");
    const pending = stored ? JSON.parse(stored) : [];
    pending.unshift(payload);
    localStorage.setItem("blinkbin_pending_history", JSON.stringify(pending.slice(0, 50)));
  } catch (err) { console.error("History save error:", err); /* Catch storage or crypto errors */ }
}

const EYE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
