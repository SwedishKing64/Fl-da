/**
 * Where a shop writes to a person. One address, read at build time (NEXT_PUBLIC_FLODA_SUPPORT_EMAIL)
 * so the pages, the app's notices, the relay's refusals and the desktop build all name the same
 * mailbox, and changing it is one variable rather than a search through the code.
 */
export const SUPPORT_EMAIL = (process.env.NEXT_PUBLIC_FLODA_SUPPORT_EMAIL ?? "").trim() || "hello@floda.ai";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
