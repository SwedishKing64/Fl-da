import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Site } from "../../Shell";
import { Reveal } from "../../welcome/Motion";
import { currentAccount } from "@/lib/catalog/account";
import { SignInForm } from "../AccountForms";
import "../../welcome/welcome.css";
import "../account.css";

export const metadata: Metadata = { title: "Sign in to Flöda", description: "Your plan, your key, your billing." };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentAccount()) redirect("/account");
  return (
    <Site>
      <section className="band page-head">
        <div className="wrap">
          <Reveal className="head"><span className="eyebrow">Your account</span><h1>Sign in.</h1><p className="lede">The same email and password you use in Flöda itself.</p></Reveal>
        </div>
      </section>
      <section className="band grey">
        <div className="wrap acct-narrow">
          <Reveal><SignInForm /></Reveal>
        </div>
      </section>
    </Site>
  );
}
