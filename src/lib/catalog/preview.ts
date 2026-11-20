/**
 * What a rule would do, shown on real products before it is kept.
 *
 * A proposal from the chat, or a lesson asked about, is run over the latest batch's products
 * without writing anything: how many it touches, and three of them before and after. A rule
 * that touches nothing is said to touch nothing, which is its own answer. Pure: the products
 * are handed in.
 */

import type { Change } from "./teach-chat";
import { ruleMatches, type TagRuleLike } from "./rules";
import { applySpellings, cleanVoice, withoutNeverTags, type Voice } from "./voice";
import { leadsWithVendor, withoutVendor } from "./titles";

export interface PreviewProduct {
  title: string;
  vendor: string;
  productType: string;
  category: string;
  tags: string[];
  skus: string[];
}

export interface Preview {
  /** How many of the products the change touches. */
  touched: number;
  of: number;
  /** Up to three of them: what the change does, before and after. */
  samples: Array<{ title: string; before: string; after: string }>;
  /** What the preview can and cannot show, in a sentence. */
  note: string;
}

const MAX_SAMPLES = 3;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const list = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
const tagsOf = (p: PreviewProduct) => p.tags.join(", ") || "(no tags)";

function done(hits: Array<{ title: string; before: string; after: string }>, of: number, note: string): Preview {
  return { touched: hits.length, of, samples: hits.slice(0, MAX_SAMPLES), note: hits.length ? note : `Touches none of the ${of} products in the latest batch.` };
}

/** The change run over the products, nothing written. */
export function previewChange(change: Change, products: PreviewProduct[]): Preview {
  const of = products.length;
  switch (change.kind) {
    case "tag-rule": {
      const rule: TagRuleLike = { id: "preview", name: "preview", matchField: change.matchField, pattern: change.pattern, addTags: change.addTags, addCollections: "", setProductType: change.setProductType, setMetafields: {}, priority: 0, active: true };
      const hits: Preview["samples"] = [];
      for (const p of products) {
        if (!ruleMatches(rule, { title: p.title, vendor: p.vendor, category: p.category, productType: p.productType, tags: p.tags, skus: p.skus, collections: [], metafields: {} })) continue;
        const added = list(change.addTags).filter((t) => !p.tags.some((x) => same(x, t)));
        const type = change.setProductType.trim() && !same(change.setProductType, p.productType) ? change.setProductType.trim() : "";
        if (!added.length && !type) continue;
        hits.push({ title: p.title, before: [`tags ${tagsOf(p)}`, type ? `type ${p.productType || "(none)"}` : ""].filter(Boolean).join("; "), after: [`tags ${[...p.tags, ...added].join(", ")}`, type ? `type ${type}` : ""].filter(Boolean).join("; ") });
      }
      return done(hits, of, `Touches ${hits.length} of ${of} products in the latest batch.`);
    }
    case "pricing": {
      const hits = products.filter((p) => change.scope === "DEFAULT" || (change.scope === "BRAND" && same(p.vendor, change.matchValue)) || (change.scope === "CATEGORY" && (same(p.category, change.matchValue) || same(p.productType, change.matchValue))) || (change.scope === "PRODUCT" && (p.title.toLowerCase().includes(change.matchValue.toLowerCase()) || p.skus.some((s) => same(s, change.matchValue)))))
        .map((p) => ({ title: p.title, before: "priced as now", after: `${change.percent}% ${change.mode.toLowerCase()}${change.roundTo === "NONE" ? "" : `, ending ${change.roundTo}`}` }));
      return done(hits, of, `Would price ${hits.length} of ${of} products in the latest batch; the amounts depend on each cost.`);
    }
    case "house": {
      if (change.path === "naming.brandInTitle") {
        const hits: Preview["samples"] = [];
        for (const p of products) {
          if (!p.vendor.trim()) continue;
          const leads = leadsWithVendor(p.vendor, p.title);
          if (change.value === "never" && leads) hits.push({ title: p.title, before: p.title, after: withoutVendor(p.vendor, p.title) });
          if (change.value === "always" && !leads) hits.push({ title: p.title, before: p.title, after: `${p.vendor.trim()} ${p.title.trim()}` });
        }
        return done(hits, of, `Changes ${hits.length} of ${of} titles in the latest batch.`);
      }
      return { touched: of, of, samples: [], note: "Changes how every product is written from the next build; there is no before and after to show." };
    }
    case "kind": {
      const mine = products.filter((p) => same(p.productType, change.type));
      if (change.field === "tags") {
        const hits = mine.map((p) => ({ p, added: list(change.value).filter((t) => !p.tags.some((x) => same(x, t))) })).filter((x) => x.added.length).map(({ p, added }) => ({ title: p.title, before: `tags ${tagsOf(p)}`, after: `tags ${[...p.tags, ...added].join(", ")}` }));
        return done(hits, of, `Touches ${hits.length} of ${of} products in the latest batch.`);
      }
      if (change.field === "calledAs") {
        const hits = mine.filter((p) => !same(p.productType, change.value)).map((p) => ({ title: p.title, before: `type ${p.productType}`, after: `type ${change.value}` }));
        return done(hits, of, `Refiles ${hits.length} of ${of} products in the latest batch.`);
      }
      return { touched: mine.length, of, samples: mine.slice(0, MAX_SAMPLES).map((p) => ({ title: p.title, before: p.title, after: "written to the new shape at the next build" })), note: `Applies to ${mine.length} of ${of} products in the latest batch, from the next build.` };
    }
    case "template-notes": {
      const hits = products.filter((p) => (change.scope === "BRAND" ? same(p.vendor, change.matchValue) : same(p.productType, change.matchValue))).map((p) => ({ title: p.title, before: "the writer's usual copy", after: "copy written with this note" }));
      return done(hits, of, `Shapes the copy on ${hits.length} of ${of} products in the latest batch.`);
    }
    case "voice": {
      const voice: Voice = cleanVoice({ spellings: change.spellings ?? [], neverTags: change.neverTags ?? [] });
      const hits: Preview["samples"] = [];
      for (const p of products) {
        const title = applySpellings(p.title, voice, p.vendor);
        const tags = withoutNeverTags(p.tags, voice, p.vendor);
        if (title !== p.title) hits.push({ title: p.title, before: p.title, after: title });
        else if (tags.length !== p.tags.length) hits.push({ title: p.title, before: `tags ${tagsOf(p)}`, after: `tags ${tags.join(", ") || "(no tags)"}` });
      }
      if (!voice.spellings.length && !voice.neverTags.length) return { touched: of, of, samples: [], note: "Changes how every product's copy is written from the next build; there is no before and after to show." };
      return done(hits, of, `Touches ${hits.length} of ${of} products in the latest batch.`);
    }
    case "section": {
      const hits = products.filter((p) => (change.types.length === 0 || change.types.some((t) => same(t, p.productType))) && (change.brands.length === 0 || change.brands.some((b) => same(b, p.vendor)))).map((p) => ({ title: p.title, before: "copy as now", after: `copy, then "${change.heading}"` }));
      return done(hits, of, `Adds the section to ${hits.length} of ${of} products in the latest batch.`);
    }
    case "brand-note": {
      const hits = products.filter((p) => same(p.vendor, change.brand)).map((p) => ({ title: p.title, before: "copy as now", after: `copy, then the ${change.brand} notes` }));
      return done(hits, of, `Adds the notes to ${hits.length} of ${of} products in the latest batch.`);
    }
    case "setting":
      return { touched: 0, of, samples: [], note: "A setting for the writer or the prices; nothing to show on the batch before it is next built." };
  }
}
