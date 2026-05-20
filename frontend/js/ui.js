let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function toast(message, type = "default", duration = 3000) {
  const el = document.createElement("div");
  el.className = `toast${type !== "default" ? ` ${type}` : ""}`;
  el.textContent = message;

  ensureContainer().appendChild(el);

  setTimeout(() => {
    el.classList.add("exiting");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, duration);
}

export const toastSuccess = (msg) => toast(msg, "success");
export const toastError   = (msg) => toast(msg, "error");

export async function copyToClipboard(text, btnEl = null) {
  try {
    await navigator.clipboard.writeText(text);
    toastSuccess("Copied!");
    if (btnEl) morphCopyBtn(btnEl, true);
    return true;
  } catch {
    toastError("Failed to copy");
    return false;
  }
}

// Briefly show a checkmark on the copy button
function morphCopyBtn(btn, success) {
  const orig = btn.innerHTML;
  btn.classList.add(success ? "copied" : "error");
  btn.innerHTML = success
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied`
    : "Failed";
  setTimeout(() => {
    btn.classList.remove("copied", "error");
    btn.innerHTML = orig;
  }, 2000);
}

export function startCountdown(unlockUnix, displayEl, labelEl = null, onZero = null) {
  function render() {
    const diff = unlockUnix - Math.floor(Date.now() / 1000);
    if (diff <= 0) {
      displayEl.textContent = "00:00:00";
      if (labelEl) labelEl.textContent = "Unlocking...";
      clearInterval(id);
      onZero?.();
      return;
    }
    const d = Math.floor(diff / 86400);
    const h = Math.floor((diff % 86400) / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;

    if (d > 0) {
      displayEl.textContent = `${d}d ${pad(h)}h ${pad(m)}m`;
      if (labelEl) labelEl.textContent = "until unlock";
    } else {
      displayEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
      if (labelEl) labelEl.textContent = "until unlock";
    }
  }

  const id = setInterval(render, 1000);
  render();
  return () => clearInterval(id);
}

function pad(n) { return String(n).padStart(2, "0"); }

export function showLoading(container, message = "Loading...") {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <span>${message}</span>
    </div>`;
}

export function formatDate(unixTs) {
  return new Date(unixTs * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function formatDatetime(unixTs) {
  return new Date(unixTs * 1000).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
