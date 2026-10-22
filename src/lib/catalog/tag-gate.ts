/**
 * Tags are matched, never invented.
 *
 * A tag on a listing is where the product appears on the website, so a tag nobody has seen does
 * not file the product anywhere; it just sits there, and nobody notices until a shelf is empty.
 * The build may only write tags the shop already uses: the tags on its own listings, the ones its
 * rules and templates add, the ones its kinds carry, the ones the rules work out per product (a
 * year, mens/womens/kids, a shelf), and the ones the shop has approved here. A tag from anywhere
 * else — a reader's suggestion, the batch check's rewording — is taken off the product and put
 * forward once as a proposal, with the product it was meant for; approved, it is a tag of the
 * shop's from then on; rejected, it is never proposed again.
 *
 * A shop with nothing taught yet (no listings, no rules, no kinds) has no vocabulary to match
 * against, so the gate stands open until it has one. A tag a person types on the grid is theirs
 * by definition and is approved as it is written.
 */

import { prisma } from "./db";
import { houseConventions } from "./taxonomy";
import { isRuleGenerated, slugTag } from "./tagging";

export interface TagGate {
  /** Whether the shop has anything to match against; false means every tag passes. */
  closed: boolean;
  known: (tag: string) => boolean;
}

export interface GatedTags {
  kept: string[];
  /** Tags taken off, each with the product it was meant for. */
  proposed: string[];
}

const key = (tag: string) => slugTag(tag) || tag.trim().toLowerCase();

/** A gate over a known set, for the build and for tests. */
export function gateFrom(knownTags: Iterable<string>, closed = true): TagGate {
  const set = new Set<string>();
  for (const t of knownTags) if (t.trim()) set.add(key(t));
  return { closed, known: (tag) => !closed || set.has(key(tag)) || isRuleGenerated(tag) };
}

/** Split a product's tags into the ones the shop uses and the ones nobody has seen. */
export function partitionTags(tags: string[], gate: TagGate, alwaysKeep: string[] = []): GatedTags {
  const keep = new Set(alwaysKeep.map(key));
  const kept: string[] = [];
  const proposed: string[] = [];
  for (const tag of tags) {
    if (!tag.trim()) continue;
    if (gate.known(tag) || keep.has(key(tag))) kept.push(tag);
    else proposed.push(tag);
  }
  return { kept, proposed };
}

/** The shop's vocabulary of tags, gathered from everything it has taught and approved. */
export async function loadTagGate(): Promise<TagGate> {
  const [listings, rules, templates, approved] = await Promise.all([
    prisma.shopListing.findMany({ select: { tags: true } }),
    prisma.tagRule.findMany({ select: { addTags: true } }),
    prisma.productTemplate.findMany({ select: { addTags: true } }),
    // A database the table could not be added to must not take the build down: the gate then
    // simply knows no approved tags, and says so once.
    prisma.tagProposal.findMany({ where: { status: "APPROVED" }, select: { tag: true } }).catch((err: unknown) => {
      console.warn("[tags] could not read the approved tags:", err instanceof Error ? err.message : err);
      return [] as { tag: string }[];
    }),
  ]);
  const known: string[] = [];
  for (const l of listings) for (const t of l.tags.split(",")) known.push(t);
  for (const r of rules) for (const t of r.addTags.split(",")) known.push(t);
  for (const t of templates) for (const x of t.addTags.split(",")) known.push(x);
  for (const k of houseConventions().kinds) known.push(...k.tags);
  for (const p of approved) known.push(p.tag);
  const closed = listings.length > 0 || rules.length > 0 || templates.length > 0 || houseConventions().kinds.length > 0;
  return gateFrom(known, closed);
}

/** Put the tags the gate took off forward as proposals, once each, with the product they were meant for. */
export async function recordTagProposals(proposed: Map<string, string>): Promise<void> {
  for (const [tag, example] of proposed) {
    const clean = tag.trim().slice(0, 120);
    if (!clean) continue;
    try {
      const have = await prisma.tagProposal.findUnique({ where: { tag: clean } });
      if (have) await prisma.tagProposal.update({ where: { tag: clean }, data: { count: { increment: 1 }, ...(have.example ? {} : { example: example.slice(0, 200) }) } });
      else await prisma.tagProposal.create({ data: { tag: clean, example: example.slice(0, 200) } });
    } catch (err) {
      console.warn("[tags] could not record a proposal:", err instanceof Error ? err.message : err);
    }
  }
}

/** A tag a person typed on the grid is the shop's own: approved as written, so the gate keeps it from now on. */
export async function approveTypedTags(tags: string[], gate: TagGate, example: string): Promise<void> {
  for (const tag of tags) {
    const clean = tag.trim().slice(0, 120);
    if (!clean || gate.known(clean)) continue;
    try {
      await prisma.tagProposal.upsert({ where: { tag: clean }, create: { tag: clean, status: "APPROVED", example: example.slice(0, 200), decidedAt: new Date() }, update: { status: "APPROVED", decidedAt: new Date() } });
    } catch (err) {
      console.warn("[tags] could not approve a typed tag:", err instanceof Error ? err.message : err);
    }
  }
}
