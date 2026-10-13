import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { pickColour, thumbnail } from "./colour-match";

const block = (colour: string) => sharp({ create: { width: 200, height: 200, channels: 3, background: colour } }).png().toBuffer();

describe("keeping the pictures in the colour ordered, by looking", () => {
  it("leaves out what the model is sure is another colour, keeps a doubt, and names the colours", async () => {
    const pics = [await block("#000000"), await block("#cc0000"), await block("#000000"), await block("#888888")];
    let saw = 0;
    const look = await pickColour(pics, ["True Black"], "Freestyle Bindings", {
      ask: async (_system, content) => {
        saw = (content as Array<{ type: string }>).filter((b) => b.type === "image").length;
        return JSON.stringify({ pictures: [
          { number: 1, colour: "black", ordered: "yes" },
          { number: 2, colour: "red", ordered: "no" },
          { number: 3, colour: "black", ordered: "yes" },
          { number: 4, colour: "", ordered: "unsure" },
        ], note: "black and red" });
      },
    });
    expect(saw).toBe(4);
    expect(look).toEqual({ keep: [0, 2, 3], otherColours: ["red"], shown: "black", looked: true });
  });

  it("keeps everything when there is no colour to go by, and when the look fails", async () => {
    const pics = [await block("#000000"), await block("#cc0000")];
    expect(await pickColour(pics, [], "x", { ask: async () => { throw new Error("no"); } })).toEqual({ keep: [0, 1], otherColours: [], shown: "", looked: false });
    expect(await pickColour(pics, ["Black"], "x", { ask: async () => { throw new Error("overloaded"); } })).toEqual({ keep: [0, 1], otherColours: [], shown: "", looked: false });
    expect(await pickColour(pics, ["Black"], "x", { ask: async () => "not json{" .slice(0, 0) || undefined })).toEqual({ keep: [0, 1], otherColours: [], shown: "", looked: false });
  });

  it("keeps a picture the model did not answer for", async () => {
    const pics = [await block("#000000"), await block("#cc0000")];
    const look = await pickColour(pics, ["Black"], "x", { ask: async () => JSON.stringify({ pictures: [{ number: 2, colour: "red", ordered: "no" }], note: "" }) });
    expect(look.keep).toEqual([0]);
  });

  it("makes a small thumbnail and gives up on what is not a picture", async () => {
    const t = await thumbnail(await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#123456" } }).png().toBuffer());
    const meta = await sharp(t!).metadata();
    expect(meta.width).toBe(384);
    expect(meta.format).toBe("jpeg");
    expect(await thumbnail(Buffer.from("nope"))).toBeNull();
  });
});
