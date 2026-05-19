import { API_BASE, DRAND_GENESIS, DRAND_PERIOD } from "./constants.js";
import {
  decrypt, importKey, derivePasswordKey, unwrapKey,
  parseFragment, fromBase64,
} from "./crypto.js";
import { ibeDecrypt, roundToUnix } from "./timelock.js";
import {
  toast, toastError, startCountdown, showLoading,
  copyToClipboard, formatDate, formatDatetime,
} from "./ui.js";

const $ = (id) => document.getElementById(id);

//  State machine
// States: LOADING | LOCKED | PASSWORD | READABLE | NOT_FOUND

const states = {
  loading:   $("state-loading"),
  locked:    $("state-locked"),
  password:  $("state-password"),
  readable:  $("state-readable"),
  notFound:  $("state-not-found"),
};

function showState(name) {
  Object.entries(states).forEach(([k, el]) => {
    if (el) el.hidden = k !== name;
  });
}

//  Init
async function init() {
  showState("loading");

  // extract paste ID from path /p/{id}
  const pathMatch = location.pathname.match(/\/p\/([^/]+)/);
  if (!pathMatch) { showState("notFound"); return; }
  const pasteId = pathMatch[1];

  // fragment never sent to server — browser guarantee
  const fragment = location.hash.slice(1);
  if (!fragment) { showState("notFound"); return; }

  try {
    const res = await fetch(`${API_BASE}/paste/${pasteId}`);

    if (res.status === 404) { showState("notFound"); return; }

    if (res.status === 423) {
      const data = await res.json();
      showLocked(data, fragment, pasteId);
      return;
    }

    if (!res.ok) { throw new Error(`HTTP ${res.status}`); }

    const data = await res.json();
    await handleReadable(data, fragment);

  } catch (err) {
    toastError("Failed to load paste");
    showState("notFound");
  }
}

//  LOCKED state
function showLocked(lockedData, fragment, pasteId) {
  showState("locked");

  const { round_id, unlock_at } = lockedData;
  const unlockUnix = unlock_at || (DRAND_GENESIS + round_id * DRAND_PERIOD);

  const countdownEl = $("countdown");
  const labelEl     = $("countdown-label");
  $("locked-unlock-date").textContent = formatDatetime(unlockUnix);

  startCountdown(unlockUnix, countdownEl, labelEl, async () => {
    // countdown reached zero — re-fetch
    showState("loading");
    await new Promise((r) => setTimeout(r, 2000)); // brief wait for round to propagate
    try {
      const res = await fetch(`${API_BASE}/paste/${pasteId}`);
      if (res.status === 404) { showState("notFound"); return; }
      if (res.status === 423) {
        // still locked — show again
        const d = await res.json();
        showLocked(d, fragment, pasteId);
        return;
      }
      const data = await res.json();
      await handleReadable(data, fragment);
    } catch {
      toastError("Failed to reload after unlock");
      showState("notFound");
    }
  });
}

//  READABLE state
async function handleReadable(data, fragment) {
  const { ciphertext, language, burn_on_read, hard_delete_at, round_id } = data;

  const parsed = parseFragment(fragment);
  let aesKey;

  // dead drop — IBE decrypt first
  if (round_id) {
    const lockedBytes = parsed.type === "password"
      ? parsed.payload   // salt.lockedKey
      : fromBase64(fragment); // just lockedKey

    let innerBytes;
    try {
      innerBytes = await ibeDecrypt(lockedBytes, round_id);
    } catch {
      toastError("Failed to decrypt time-lock (drand unavailable or round not yet available)");
      showState("notFound");
      return;
    }

    if (parsed.type === "password") {
      // password on top of dead drop
      showPasswordPrompt(async (pwd) => {
        try {
          const pswdKey    = await derivePasswordKey(pwd, parsed.salt);
          const keyBytes   = await unwrapKey(innerBytes, pswdKey);
          aesKey           = await importKey(keyBytes);
          await renderContent(ciphertext, aesKey, language, burn_on_read, hard_delete_at);
        } catch {
          return false; // wrong password
        }
        return true;
      });
    } else {
      aesKey = await importKey(innerBytes);
      await renderContent(ciphertext, aesKey, language, burn_on_read, hard_delete_at);
    }
    return;
  }

  // no dead drop
  if (parsed.type === "password") {
    showPasswordPrompt(async (pwd) => {
      try {
        const pswdKey  = await derivePasswordKey(pwd, parsed.salt);
        const keyBytes = await unwrapKey(parsed.payload, pswdKey);
        aesKey         = await importKey(keyBytes);
        await renderContent(ciphertext, aesKey, language, burn_on_read, hard_delete_at);
      } catch {
        return false;
      }
      return true;
    });
  } else {
    aesKey = await importKey(parsed.keyBytes);
    await renderContent(ciphertext, aesKey, language, burn_on_read, hard_delete_at);
  }
}

//  PASSWORD state
function showPasswordPrompt(onSubmit) {
  showState("password");

  const form   = $("password-form");
  const input  = $("password-input");
  const errEl  = $("password-error");
  const btn    = $("password-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "Decrypting...";

    const ok = await onSubmit(input.value);
    if (!ok) {
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = "Decrypt";
      input.value = "";
      input.focus();
    }
  });
}

//  Render content
async function renderContent(ciphertext, aesKey, language, burnOnRead, hardDeleteAt) {
  let plaintext;
  try {
    plaintext = await decrypt(ciphertext, aesKey);
  } catch {
    toastError("Decryption failed — key may be incorrect");
    showState("notFound");
    return;
  }

  showState("readable");

  // burn warning
  const burnBanner = $("burn-banner");
  if (burnBanner) burnBanner.hidden = !burnOnRead;

  // expiry
  const expiryEl = $("expiry-info");
  if (expiryEl) expiryEl.textContent = `Expires ${formatDate(hardDeleteAt)}`;

  const contentEl = $("readable-content");

  if (language === "markdown") {
    // markdown toggle
    const toggleWrap = $("markdown-toggle");
    if (toggleWrap) toggleWrap.hidden = false;

    const btnRendered = $("toggle-rendered");
    const btnRaw      = $("toggle-raw");

    btnRendered?.addEventListener("click", () => {
      btnRendered.classList.add("active");
      btnRaw?.classList.remove("active");
      contentEl.className = "readable-content markdown";
      contentEl.innerHTML = window.marked ? window.marked.parse(plaintext) : plaintext;
      window.Prism?.highlightAllUnder(contentEl);
    });

    btnRaw?.addEventListener("click", () => {
      btnRaw.classList.add("active");
      btnRendered?.classList.remove("active");
      contentEl.className = "readable-content";
      contentEl.innerHTML = `<pre>${escHtml(plaintext)}</pre>`;
    });

    // default: rendered
    contentEl.className = "readable-content markdown";
    contentEl.innerHTML = window.marked ? window.marked.parse(plaintext) : plaintext;
    btnRendered?.classList.add("active");
    window.Prism?.highlightAllUnder(contentEl);

  } else if (language === "plaintext") {
    contentEl.className = "readable-content";
    contentEl.innerHTML = `<pre>${escHtml(plaintext)}</pre>`;
  } else {
    // Prism syntax highlighting
    contentEl.className = "readable-content";
    const code = document.createElement("code");
    code.className = `language-${language}`;
    code.textContent = plaintext;
    const pre = document.createElement("pre");
    pre.appendChild(code);
    contentEl.innerHTML = "";
    contentEl.appendChild(pre);
    window.Prism?.highlightElement(code);
  }

  // copy button
  $("copy-content-btn")?.addEventListener("click", () => {
    copyToClipboard(plaintext, $("copy-content-btn"));
  });
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Start ────────────────────────────────────────────────
init();
