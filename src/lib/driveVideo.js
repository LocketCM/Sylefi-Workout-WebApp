// Helpers for handling Google Drive video links.
//
// Meg pastes Drive URLs the same way she always has — usually in the form:
//   https://drive.google.com/file/d/<FILE_ID>/view?usp=share_link
//
// For embedding we need the /preview variant:
//   https://drive.google.com/file/d/<FILE_ID>/preview
//
// These helpers let us store whatever the coach pastes and convert on the fly.

/**
 * Extract the Drive file ID from any Drive URL, or null if it doesn't match.
 */
export function getDriveFileId(url) {
  if (!url) return null;
  // /file/d/<id>/
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // ?id=<id>
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

/**
 * Convert any Drive URL into an embeddable /preview URL, or return null
 * if it's not a recognizable Drive link (so callers can fall back gracefully).
 */
export function toDriveEmbedUrl(url) {
  const id = getDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/**
 * True if this is any recognizable Drive URL.
 */
export function isDriveUrl(url) {
  return Boolean(getDriveFileId(url));
}
