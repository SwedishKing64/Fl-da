import { redirect } from "next/navigation";
import { usersExist } from "@/lib/catalog/auth";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await usersExist()) redirect("/login");
  return <SetupForm />;
}
