"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/app/Logo";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";

/**
 * The site's frame: the bar with its menus, and the footer. Every public page sits inside it so
 * the way around the site is the same on each. The bar turns solid once the page is moving; a
 * thin line along its top shows how far down the page the reader is.
 */

const MENUS: Array<{ label: string; items: Array<{ href: string; label: string; hint: string }> }> = [
  {
    label: "Product",
    items: [
      { href: "/welcome#product", label: "What it does", hint: "New products, prices and stock, tidying a document" },
      { href: "/welcome#screens", label: "The screens", hint: "The product with a real order in it" },
      { href: "/welcome#how", label: "How it works", hint: "Three steps; the third one is you checking" },
      { href: "/welcome#who", label: "Who it's for", hint: "Retailers whose suppliers send paperwork" },
      { href: "/faq", label: "Questions", hint: "Data, security, suppliers, Shopify, the trial" },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/about", label: "About Flöda", hint: "Built inside a working shop, by people who set it up with you" },
      { href: "/privacy", label: "Privacy", hint: "Where your data lives and where it goes" },
      { href: "/terms", label: "Terms", hint: "Plans, billing, cancelling, and who is responsible for what" },
      { href: SUPPORT_MAILTO, label: "Contact", hint: `${SUPPORT_EMAIL}, answered by a person` },
    ],
  },
  {
    label: "Pricing",
    items: [
      { href: "/welcome#pricing", label: "Plans", hint: "Starter, Shop and Unlimited, billed by the fortnight" },
      { href: "/welcome#pricing", label: "What it saves", hint: "A 50-product order by hand against through Flöda" },
      { href: "/account/signup", label: "Start the free trial", hint: "Make your account: 14 days on any plan, no card" },
      { href: "/account", label: "Your account", hint: "Your plan, key, reading this fortnight and billing" },
    ],
  },
  {
    label: "Download",
    items: [
      { href: "/download", label: "Windows", hint: "Windows 10 or 11; keeps itself current" },
      { href: "/download", label: "Mac", hint: "Apple silicon and Intel" },
      { href: "/welcome#screens", label: "See the screens", hint: "The product with a real order in it" },
    ],
  },
];

function Menu({ label, items, open, onOpen, onClose }: { label: string; items: (typeof MENUS)[number]["items"]; open: boolean; onOpen: () => void; onClose: () => void }) {
  return (
    <div className={`menu ${open ? "open" : ""}`} onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={open ? onClose : onOpen} onFocus={onOpen}>
        {label}<span className="chev" aria-hidden>⌄</span>
      </button>
      <div className="panel" role="menu">
        {items.map((it) => (
          <Link key={it.label} href={it.href} role="menuitem" onClick={onClose}>
            <span className="t">{it.label}</span>
            <span className="h">{it.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteBar() {
  const [solid, setSolid] = useState(false);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onScroll = () => {
      setSolid(window.scrollY > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMobile(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const openMenu = (label: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(label); };
  const closeMenu = () => { closeTimer.current = setTimeout(() => setOpen(null), 120); };

  return (
    <header className={`bar ${solid ? "solid" : ""}`}>
      <span className="progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />
      <div className="wrap">
        <Link href="/welcome" className="mark" aria-label="Flöda home"><Logo size={24} /></Link>
        <nav aria-label="Site">
          {MENUS.map((m) => <Menu key={m.label} label={m.label} items={m.items} open={open === m.label} onOpen={() => openMenu(m.label)} onClose={closeMenu} />)}
        </nav>
        <div className="bar-ctas">
          <Link href="/account/login" className="btn btn-grey">Sign in</Link>
          <Link href="/account/signup" className="btn btn-meta">Start free trial</Link>
          <button type="button" className="burger" aria-label={mobile ? "Close the menu" : "Open the menu"} aria-expanded={mobile} onClick={() => setMobile((m) => !m)}><i /><i /><i /></button>
        </div>
      </div>
      {mobile && (
        <div className="mobile">
          {MENUS.map((m) => (
            <div key={m.label} className="group">
              <div className="gl">{m.label}</div>
              {m.items.map((it) => <Link key={it.label} href={it.href} onClick={() => setMobile(false)}>{it.label}</Link>)}
            </div>
          ))}
          <div className="group">
            <div className="gl">Account</div>
            <Link href="/account/login" onClick={() => setMobile(false)}>Sign in</Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div className="brand">
            <Logo size={22} />
            <p>Supplier paperwork in, shop-ready listings out. Built inside a working shop; set up with you by a Flöda engineer.</p>
            <p className="soft">{SUPPORT_EMAIL} · Sydney</p>
          </div>
          <div>
            <div className="fl">Product</div>
            <Link href="/welcome#product">What it does</Link>
            <Link href="/welcome#how">How it works</Link>
            <Link href="/welcome#who">Who it&rsquo;s for</Link>
            <Link href="/welcome#pricing">Pricing</Link>
            <Link href="/download">Download</Link>
          </div>
          <div>
            <div className="fl">Company</div>
            <Link href="/about">About</Link>
            <Link href="/faq">Questions</Link>
            <a href={SUPPORT_MAILTO}>Contact</a>
          </div>
          <div>
            <div className="fl">Legal</div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/privacy#data">Your data</Link>
            <Link href="/privacy#ai">Reading by AI</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
        <div className="fine">© {new Date().getFullYear()} Flöda · Flöda is not affiliated with Shopify Inc.</div>
      </div>
    </footer>
  );
}

/** A public page: the bar, the page, the footer, in the site's own styles. */
export function Site({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`floda ${className}`.trim()}>
      <SiteBar />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
