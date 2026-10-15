"use client";

import { useActionState } from "react";
import { registerInterestAction, type RegisterResult } from "./actions";

export function RegisterForm() {
  const [result, act, pending] = useActionState<RegisterResult | null, FormData>(registerInterestAction, null);
  if (result?.ok) {
    return (
      <div className="thanks" role="status">
        <h3>Thanks. Your trial is on its way.</h3>
        <p className="soft">Within one working day you&rsquo;ll hear from a person with your key, the download and a time to walk through one of your own supplier invoices. Nothing to install in the meantime.</p>
      </div>
    );
  }
  return (
    <form action={act}>
      <label>
        Work email
        <input id="lead-email" name="email" type="email" required autoComplete="email" placeholder="you@yourshop.com.au" />
      </label>
      <label>
        Shop
        <input id="lead-shop" name="shop" type="text" required placeholder="Alpine Sports, Jindabyne" />
      </label>
      <label>
        What you sell
        <select id="lead-sells" name="sells" defaultValue="snow">
          <option value="snow">Snow and outdoor</option>
          <option value="bike">Bikes</option>
          <option value="fishing">Fishing and boating</option>
          <option value="camping">Camping and hiking</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label>
        Your store runs on
        <select id="lead-platform" name="platform" defaultValue="shopify">
          <option value="shopify">Shopify</option>
          <option value="other">Another platform</option>
        </select>
      </label>
      <label>
        Anything we should know
        <textarea id="lead-note" name="note" rows={3} placeholder="Which suppliers give you the most grief?" />
      </label>
      {result && !result.ok && <p className="err">{result.error}</p>}
      <button className="btn btn-meta" type="submit" disabled={pending}>{pending ? "Sending…" : "Start the trial"}</button>
      <p className="soft" style={{ fontSize: 13 }}>No card, no spam, no list sold. One email from a person.</p>
    </form>
  );
}
