/**
 * Feedback from the people using Flöda — a bug, a wrong listing, a wish — kept on the vendor's
 * deployment under one key in `AppSetting`, the way leads are, and shown on the Clients page.
 * (`feedback.ts` is something else: corrections to one batch, turned into house rules.)
 */

export const FEEDBACK_KEY = "floda.feedback";

export interface FeedbackRow {
  at: string;
  message: string;
  email: string;
  page: string;
  shop: string;
  user: string;
  version: string;
  install: string;
  key: string;
}
