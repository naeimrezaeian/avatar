import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Новый пароль" };

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  // В Next 16 searchParams асинхронные.
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  return <ResetPasswordForm token={token} />;
}
