import { redirect } from "next/navigation";
import { getCurrentUser, usersExist } from "@/lib/catalog/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  if (!(await usersExist())) redirect("/setup");
  return <LoginForm />;
}
