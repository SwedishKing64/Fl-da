/**
 * The mark on reading done to teach Snaben. `asTraining(work)` runs `work` with the mark set,
 * and every call to the relay made inside it carries the x-floda-purpose header, so the relay
 * meters nothing for it. The mark lives in an AsyncLocalStorage, which only Node has: this file
 * is server-only, and anthropic.ts (which the browser also loads) reads the mark through the
 * hook registered below.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { provideTrainingMark } from "./anthropic";

const purpose = new AsyncLocalStorage<"training">();
provideTrainingMark(() => purpose.getStore() === "training");

export function asTraining<T>(work: () => Promise<T>): Promise<T> {
  return purpose.run("training", work);
}
