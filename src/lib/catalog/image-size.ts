/**
 * How big an uploaded picture is allowed to be by the time it is sent.
 *
 * Two hard limits sit between a photo of an invoice and the model that reads it, and neither one
 * announces itself:
 *
 *  - A serverless request body tops out at about 4.5MB. A Server Action sends the file base64
 *    encoded, which is a third bigger again, so anything over roughly 3MB is refused at the edge
 *    BEFORE any code here runs. There is no error to catch and nothing in the logs — the request
 *    simply never arrives, which on screen is a spinner that never stops.
 *  - The API resizes any image whose long edge is over 1568px before it looks at it.
 *
 * So a 12MB phone screenshot of an invoice fails to send, and the 12MB bought nothing even if it
 * had: it would have been scaled to 1568px at the other end regardless. Shrinking it in the
 * browser first is not a compromise, it is sending what was going to be read anyway.
 */

/** The long edge the API works to. Anything bigger is scaled down there, so it is scaled here. */
export const MAX_EDGE = 1568;

/**
 * The biggest body a Server Action upload may be, in bytes of ORIGINAL file.
 *
 * Deliberately under the platform's 4.5MB: base64 adds a third, and the action carries its
 * arguments and framing on top of that.
 */
export const MAX_UPLOAD = 3 * 1024 * 1024;

/** Scale to fit inside a square of `max`, never scaling up, always whole pixels. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True when a file is small enough to send as it is. */
export function fitsUpload(bytes: number): boolean {
  return bytes <= MAX_UPLOAD;
}

/** A size a person can read, for a message about one that is too big. */
export function readableSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
