import { redirect } from "next/navigation";
import { getCurrentUser, recoveryEnabled, usersExist } from "@/lib/catalog/auth";
import { openMode } from "@/lib/catalog/open";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  if (openMode()) redirect("/open");
  // With a recovery sign-in set up, the form stays: setup would make a stranger the first admin.
  if (!recoveryEnabled() && !(await usersExist())) redirect("/setup");
  return <LoginForm />;
}
