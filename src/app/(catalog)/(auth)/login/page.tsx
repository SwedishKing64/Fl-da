import { redirect } from "next/navigation";
import { getCurrentUser, usersExist } from "@/lib/catalog/auth";
import { openMode } from "@/lib/catalog/open";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  if (openMode()) redirect("/open");
  if (!(await usersExist())) redirect("/setup");
  return <LoginForm />;
}
