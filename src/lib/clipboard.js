// Cross-context clipboard helper.
//
// navigator.clipboard.writeText() requires a *secure context* (HTTPS or
// localhost). Dev servers on LAN IPs (192.168.x.x) are plain HTTP, so the
// modern API is blocked there — silently. This helper falls back to the
// legacy execCommand('copy') trick via a hidden textarea so copying works
// in every context: HTTPS, HTTP-on-LAN, localhost, mobile, all of it.
//
// Returns a promise that resolves true on success, false on failure.
export async function copyText(text) {
  // Modern path (secure contexts only).
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy path.
    }
  }

  // Legacy path: create an off-screen textarea, select it, execCommand('copy').
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Avoid scrolling to bottom on iOS.
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
