/**
 * What the batch check may change on its own.
 *
 * After a build, the batch check (batch-agent.ts) looks the batch over the way a floor manager
 * would and fixes what is plainly wrong: a name, a Type, a brand, tags, collections, or drops a
 * product that should not have been built. That set used to be fixed. A shop that wants every
 * name to pass a person narrows it here; one that trusts the check widens it back. Anything
 * outside the set is still said, as a question in the chat, never done. Pure.
 */

export const AGENT_FIELDS = ["title", "productType", "vendor", "tags", "collections", "drop"] as const;
export type AgentField = (typeof AGENT_FIELDS)[number];
export type AgentMay = Record<AgentField, boolean>;

export const AGENT_FIELD_LABELS: Record<AgentField, string> = { title: "a product's name", productType: "its Type", vendor: "its brand", tags: "its tags", collections: "its collections", drop: "drop a product" };

export const DEFAULT_AGENT_MAY: AgentMay = { title: true, productType: true, vendor: true, tags: true, collections: true, drop: true };

export function cleanAgentMay(input: unknown): AgentMay {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_AGENT_MAY };
  for (const f of AGENT_FIELDS) if (typeof v[f] === "boolean") out[f] = v[f] as boolean;
  return out;
}

export const mayFix = (may: AgentMay, field: string): boolean => (AGENT_FIELDS as readonly string[]).includes(field) && may[field as AgentField];

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The scope as a sentence for Teach Snaben. */
export function describeAgentMay(may: AgentMay): string {
  const allowed = AGENT_FIELDS.filter((f) => may[f] && f !== "drop").map((f) => AGENT_FIELD_LABELS[f]);
  const parts: string[] = [];
  if (allowed.length) parts.push(`change ${list(allowed)}`);
  if (may.drop) parts.push("drop a product that should not have been built");
  if (!parts.length) return "After a build, the batch check only asks: it changes nothing on its own.";
  const kept = AGENT_FIELDS.filter((f) => !may[f]);
  return `After a build, the batch check may ${parts.join(", and ")} on its own${kept.length ? `; ${list(kept.map((f) => (f === "drop" ? "dropping a product" : AGENT_FIELD_LABELS[f])))} ${kept.length === 1 ? "waits" : "wait"} for a person` : ""}.`;
}

/** The line the check is told, so it asks rather than tries what it may not do. */
export function agentScopePrompt(may: AgentMay): string {
  const kept = AGENT_FIELDS.filter((f) => !may[f]);
  if (!kept.length) return "";
  return `The shop keeps these for a person: ${list(kept.map((f) => (f === "drop" ? "dropping a product" : AGENT_FIELD_LABELS[f])))}. Do not propose a fix to them; put what you would have changed as a question instead.`;
}
