// Generates a random 6-character invite code (uppercase, no confusable chars).
// Excludes 0/O/1/I to avoid client typos when reading from a screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// 7-day expiry timestamp as ISO string for Postgres timestamptz.
export function inviteExpiryISO(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// Build the full invite link the coach copies and sends to the client.
// Uses HashRouter style so it works on GitHub Pages.
export function buildInviteUrl(code) {
  return `${window.location.origin}${window.location.pathname}#/join?code=${code}`;
}

// Build the permanent personal sign-in URL for an active client. Bookmarkable
// — every visit re-binds them to their data, even on a new device.
export function buildSignInUrl(accessCode) {
  return `${window.location.origin}${window.location.pathname}#/signin?code=${accessCode}`;
}
