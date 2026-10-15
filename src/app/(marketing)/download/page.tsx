import type { Metadata } from "next";
import Link from "next/link";
import { Site } from "../Shell";
import { Reveal } from "../welcome/Motion";
import "../welcome/welcome.css";
import { SUPPORT_MAILTO } from "@/lib/catalog/support";

export const metadata: Metadata = { title: "Download Flöda", description: "Flöda for Windows and Mac. Everything on your machine; the app keeps itself current." };

const RELEASES = "https://github.com/SwedishKing64/Fl-da/releases";
const LATEST = "https://api.github.com/repos/SwedishKing64/Fl-da/releases/latest";

interface Asset { name: string; browser_download_url: string; size: number }
interface Latest { version: string; date: string; windows?: Asset; macArm?: Asset; macIntel?: Asset }

/** The newest release, asked of GitHub and remembered for ten minutes. Null when it cannot be reached. */
async function latest(): Promise<Latest | null> {
  try {
    const res = await fetch(LATEST, { headers: { accept: "application/vnd.github+json" }, next: { revalidate: 600 } });
    if (!res.ok) return null;
    const r = (await res.json()) as { tag_name: string; published_at: string; assets: Asset[] };
    const find = (test: (n: string) => boolean) => r.assets.find((a) => test(a.name));
    return {
      version: r.tag_name.replace(/^v/, ""),
      date: r.published_at,
      windows: find((n) => n.endsWith(".exe")),
      macArm: find((n) => n.endsWith(".dmg") && /arm64/i.test(n)),
      macIntel: find((n) => n.endsWith(".dmg") && /x64/i.test(n)),
    };
  } catch {
    return null;
  }
}

const mb = (a?: Asset) => (a ? `${Math.round(a.size / 1024 / 1024)} MB` : "");

export default async function DownloadPage() {
  const l = await latest();
  const when = l ? new Date(l.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Download</span><h1>Flöda for Windows and Mac.</h1><p className="lede">An app you install, with your database and your files on your own machine. {l ? <>The current version is <strong>{l.version}</strong>, released {when}.</> : <>The current version is on the <a href={RELEASES}>releases page</a>.</>}</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap">
          <div className="dl">
            <Reveal className="dl-card" delay={0}>
              <div className="os" aria-hidden>▣</div>
              <h3>Windows</h3>
              <p>Windows 10 or 11, 64-bit. One click to install; the app keeps itself current from here on.</p>
              {l?.windows ? <a className="btn btn-meta" href={l.windows.browser_download_url}>Download for Windows<span aria-hidden>↓</span></a> : <a className="btn btn-meta" href={RELEASES}>Get it from the releases page</a>}
              <span className="soft">{l?.windows ? `${l.windows.name} · ${mb(l.windows)}` : ""}</span>
              <p className="note">Windows shows a SmartScreen notice the first time, because the installer is not yet signed with a certificate. Choose <em>More info</em>, then <em>Run anyway</em>.</p>
            </Reveal>
            <Reveal className="dl-card" delay={1}>
              <div className="os" aria-hidden>⌘</div>
              <h3>Mac</h3>
              <p>macOS 13 or later. Apple silicon (M1 and later) or Intel; pick the one for your Mac. The app tells you when a newer version is out.</p>
              <div className="two">
                {l?.macArm ? <a className="btn btn-meta" href={l.macArm.browser_download_url}>Apple silicon<span aria-hidden>↓</span></a> : <a className="btn btn-meta" href={RELEASES}>Releases page</a>}
                {l?.macIntel ? <a className="btn btn-grey" href={l.macIntel.browser_download_url}>Intel<span aria-hidden>↓</span></a> : null}
              </div>
              <span className="soft">{l?.macArm ? `${mb(l.macArm)} · ${mb(l.macIntel)}` : ""}</span>
              <p className="note">The first time, macOS says the app is from an unidentified developer. Open <em>System Settings → Privacy &amp; Security</em> and choose <em>Open Anyway</em>, once. (Not sure which Mac you have? Apple menu → About This Mac.)</p>
            </Reveal>
          </div>
          <Reveal className="dl-after" delay={2}>
            <h3>After you install</h3>
            <ol>
              <li>Create your admin account. Everything stays on this machine.</li>
              <li>Pick a plan and start the 14-day free trial from inside the app. No card.</li>
              <li>Tell us when you would like your set-up call. A Flöda engineer loads your catalogue and reads your first invoices with you.</li>
            </ol>
            <p className="soft">Would rather not install anything? A hosted copy is available on every plan; <a href={SUPPORT_MAILTO}>write to us</a>. Every version and its notes are on the <a href={RELEASES}>releases page</a>. <Link href="/privacy">What leaves your machine.</Link></p>
          </Reveal>
        </div>
      </section>
    </Site>
  );
}
