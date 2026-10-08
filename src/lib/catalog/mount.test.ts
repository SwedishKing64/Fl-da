import { describe, expect, it } from "vitest";
import { isSystemBinding, isSystemMount } from "./mount";

describe("telling a system binding from a drill mount by its name", () => {
  it.each([
    // As the shop writes them in the Binding Option, with the package title after.
    "C 5 GW Atomic Redster J2 130-150 + C 5 GW 2026",
    "L 6 GW Atomic Redster J4 2026",
    "MI 12 GW Atomic Redster Q7.8 Revoshock C + M 12 GW",
    "Mi 12 GW Atomic Redster Q7.8",
    "M 10 GW Atomic Maverick 86 C",
    "M11 GW Salomon S/Max 8 + M11 GW 2026",
    "M11 Salomon QST Spark + M11",
    "JRS 7.5 GW Head Supershape Team",
    "JRS 4.5 GW CA Head Joy Easy",
    "PRD 12 GW Head Supershape e-Rally",
    "PR 11 GW Head Kore",
    "PRW 11 GW Head Total Joy",
    "Joy 11 SLR Head Real Joy",
    "Evo 9 GW Head Supershape Team Easy",
    "EL 9.0 Elan Wildcat 76",
    "EL 10.0 Elan Element",
    "FX EMX 12.0 Elan Ripstick",
    "FusionX EMX 12 Elan Amphibio",
    "PS ELX 11.0 Elan Primero",
    "ELX 9 GW Elan Element",
    "Marker M7.0 FDT Volkl Deacon",
    "Marker M4.5 FDT Volkl Racetiger Junior",
    "Marker FDT 4.5 Volkl",
    "K2 M3 10 Quikclik K2 Disruption",
    "K2 M3 11 Quikclik K2 Mindbender",
    "Lowride 13 FR Dynastar Speedzone",
    "NX 10 Rossignol Experience 76",
    "Look NX10 Rossignol Experience",
    "Xpress 11 GW Rossignol Experience 82",
    "Xpress 10 Rossignol Hero",
    "NX 12 Konect Rossignol Experience 86",
    "SPX 12 Konect Rossignol Hero Elite",
    "Z12 GW Salomon S/Race",
    "RS 11 GW Fischer RC One 82",
    "RC4 Z11 Fischer RC4 Worldcup",
    "TPX 12 Blizzard Firebird",
    "TPC 10 Nordica Spitfire",
    "TP2 Light 11 Nordica Dobermann",
    "vMotion 12 GW Volkl Deacon",
    "Colt 5 GW Atomic Redster J2",
    "Look Xp Jr7 Hero Jr 130-150",
    "SPX 12 Konect Rossignol Hero Elite",
    "ShiftX EL 10 Wingman 83 C",
  ])("%s is a system binding", (name) => {
    expect(isSystemBinding(name)).toBe(true);
  });

  it.each([
    "Griffon 13 ID Blizzard Rustler 9",
    "Griffon Demo Blizzard",
    "Squire 11 Blizzard Black Pearl 88",
    "Strive 12 GW Volkl Mantra",
    "Marker Jester 16 ID Volkl",
    "Marker 7.0 Blizzard Junior",
    "Tecton 13 Blizzard Zero G",
    "Attack 14 GW Head Kore 93",
    "Attack LYT 11 GW Head Kore",
    "SPX 12 Rockerace Rossignol Hero",
    "Spx 15 Rockerace Rossignol",
    "Pivot 15 GW Rossignol Blackops",
    "Pivot 12 Dynastar M-Free",
    "ATK Raider 12 Blizzard Zero G",
    "ATK Crest 10",
    "Shift 13 MNC Salomon QST",
    "Warden 13 MNC Salomon",
    "Kingpin 13 Volkl Blaze",
    "Duke PT 16 Marker",
    "Alpinist 12 Marker",
    "Rottefella Xplore Åsnes",
    "Rottefella NNNBC Magnum",
    "Rottefella 75mm",
    "Look Kid 4 Rossignol Experience Pro",
    "XP 120 Positrack inc Binding Package",
    "Fritschi Vipec Evo 12",
    "Marker Alpinist 10 inc Brake",
    "Rottefella Xplore Offtrack",
    "Pivot 2.0 11 GW",
    "Comp J 4 Rossignol",
    "Off-Track Rossignol BC 80",
    "85mm", "158cm", "",
  ])("%s is a drill mount", (name) => {
    expect(isSystemBinding(name)).toBe(false);
  });
});

describe("a package is placed by its binding before its title", () => {
  it.each([
    ["Pivot 2.0 11 GW", "MR-S 2026 155cm inc Look NX 10 Binding Package", false],
    ["Marker Alpinist 10 inc Brake", "XP 120 Positrack inc Binding Package", false],
    ["Fritschi Vipec Evo 12", "XP 120 Positrack inc Binding Package", false],
    ["Rottefella 75mm Cable Long", "XP 120 Positrack inc Binding Package", false],
    ["Atomic C5 GW", "Redster J2 70-90 inc C 5 GW Binding Package", true],
    ["Look NX 10", "MR-S 2026 155cm inc Look NX 10 Binding Package", true],
    ["", "Wingman 78 Ti inc EL 10.0 Shift Binding Package", true],
    ["", "Prodigy 1X 2025 inc Tyrolia Attack 11 Binding Package", false],
    ["", "Kore 93 inc Binding Package", false],
    ["Black", "Redster Q7.8 Revoshock C inc MI 12 GW Binding Package", true],
    ["Black", "Mantra 88 2025 inc Marker Griffon Binding Package", false],
  ])("%s on %s", (binding, title, system) => {
    expect(isSystemMount(binding, title)).toBe(system);
  });
});

describe("Look's SPX is a system binding on a Rossignol or Dynastar, which carry it on a rail or plate", () => {
  it.each([
    ["SPX 14", "Forza 70' Ti 2027 inc Spx 14 Binding Package", "Rossignol", true],
    ["", "Forza 70° V-TI K 2026 inc SPX14 Binding Package", "Rossignol", true],
    ["Look Spx 14 - Black", "Hero Elite ST Ti K inc Spx 14 Binding Package", "Rossignol", true],
    ["SPX 12", "Hero Athlete GS 170-182 inc SPX 12 Rockerace Binding Package", "Rossignol", true],
    ["", "Hero Athlete FIS SL Factory 157 inc Spx 15 Rockerace Binding Package", "Rossignol", true],
    ["Spx 11", "Hero GS Pro 126-171 inc Spx 11 Binding Package", "Rossignol", true],
    ["", "Speed Omeglass Master inc SPX 15 Rockerace Binding Package", "Dynastar", true],
    ["SPX 11", "MR-D 166cm inc Binding Package", "ID One", false],
    ["Look SPX10 - Black / Hot Red", "Mr S White inc Look SPX10 Binding Package", "ID One", false],
    ["Pivot 14", "MR-D 166cm inc Binding Package", "ID One", false],
    ["SPX 12 GW", "Mantra 88 inc SPX 12 Binding Package", "Volkl", false],
    ["SPX 12 GW", "Enforcer 94 inc Binding Package", "", false],
  ])("%s on %s by %s", (binding, title, vendor, system) => {
    expect(isSystemMount(binding, title, vendor)).toBe(system);
  });
});
