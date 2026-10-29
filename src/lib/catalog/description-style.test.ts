import { afterEach, describe, expect, it } from "vitest";
import { activateConventions, SNOW_TEST_CONVENTIONS } from "./taxonomy";
import { DEFAULT_HOUSE } from "./house";
import { hasDescriptionStyle, shopBody } from "./description-style";
import { sanitiseBody } from "./body";

const styled = (format: string, example = "", specsHeading = "Specs") =>
  activateConventions({ ...SNOW_TEST_CONVENTIONS, house: { ...DEFAULT_HOUSE, descriptions: { format, specsHeading, example } } });

afterEach(() => activateConventions(SNOW_TEST_CONVENTIONS));

const description = "The Mantra M7 is the all-mountain ski that started it all, with a titanal frame and a tapered tip and tail for easy turn initiation in every snow condition you will find on the mountain.";
const features = ["Waist width: 88 mm", "Radius: 16 m @ 177"];

describe("a body in the shop's format", () => {
  it("is the plain layout when the shop has said nothing", async () => {
    expect(hasDescriptionStyle()).toBe(false);
    const body = await shopBody(description, features, { ask: async () => { throw new Error("should not be asked"); } });
    expect(body).toContain("<h2>Tech Specs</h2>");
    expect(body).toContain("<li>Waist width: 88 mm</li>");
  });
  it("uses the shop's heading over the list even without the model", async () => {
    styled("", "", "Specifications");
    const body = await shopBody(description, features, { ask: async () => undefined });
    expect(body).toContain("<h2>Specifications</h2>");
  });
  it("hands the words and the instructions to the model and keeps what it lays out, cleaned", async () => {
    styled("Two sentences, then the list.", "<p>Example.</p>");
    let seen = "";
    const body = await shopBody(description, features, {
      ask: async (system, content) => { seen = system + content; return JSON.stringify({ bodyHtml: '<p onclick="x()">Short.</p><script>bad()</script><h2>Specs</h2><ul><li>Waist width: 88 mm</li></ul><div>kept text</div>' }); },
    });
    expect(seen).toContain("Two sentences, then the list.");
    expect(seen).toContain("Example.");
    expect(seen).toContain("Waist width: 88 mm");
    expect(body).toBe("<p>Short.</p><h2>Specs</h2><ul><li>Waist width: 88 mm</li></ul>kept text");
  });
  it("falls back to the plain layout when the model fails, answers nothing, or answers rubbish", async () => {
    styled("Anything.");
    const plain = await shopBody(description, features, { ask: async () => undefined });
    expect(plain).toContain("<h2>Specs</h2>");
    expect(await shopBody(description, features, { ask: async () => { throw new Error("down"); } })).toBe(plain);
    expect(await shopBody(description, features, { ask: async () => JSON.stringify({ bodyHtml: "<script>only</script>" }) })).toBe(plain);
  });
  it("does not shape the invoice's one-liner", async () => {
    styled("Anything.");
    const body = await shopBody("Spyder mens technical jacket.", [], { ask: async () => { throw new Error("should not be asked"); } });
    expect(body).toBe("<p>Spyder mens technical jacket.</p>");
  });
});

describe("sanitising a laid-out body", () => {
  it("keeps the plain tags, drops attributes, drops the rest", () => {
    expect(sanitiseBody('<p class="a">Hi <b>there</b><br/></p><img src="x"><ol><li>1</li></ol>')).toBe("<p>Hi there<br></p><ol><li>1</li></ol>");
  });
});
