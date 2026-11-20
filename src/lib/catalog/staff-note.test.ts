import { describe, expect, it } from "vitest";
import { firstName, staffNoteHtml, withStaffNote } from "./staff-note";

describe("a staff note in the copy", () => {
  it("is quoted after the copy, signed where a name was given, never twice, never on an empty copy", () => {
    expect(staffNoteHtml("Runs small, but worth it.", "Emma")).toBe('<blockquote class="staff-note"><p>&ldquo;Runs small, but worth it.&rdquo; <cite>&mdash; Emma</cite></p></blockquote>');
    expect(staffNoteHtml("  ", "Emma")).toBe("");
    const body = withStaffNote("<p>A pack.</p>", "Great for <long> days", "");
    expect(body).toBe('<p>A pack.</p>\n<blockquote class="staff-note"><p>&ldquo;Great for &lt;long&gt; days&rdquo;</p></blockquote>');
    expect(withStaffNote(body, "Great for long days")).toBe(body);
    expect(withStaffNote("", "A note")).toBe("");
  });
  it("signs with a first name", () => {
    expect(firstName("Emma Jones")).toBe("Emma");
    expect(firstName("  ")).toBe("");
  });
});
