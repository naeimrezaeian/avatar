import type { Metadata } from "next";
import { VerifyEmailClient } from "./verify-email-client";

export const metadata: Metadata = { title: "Подтверждение почты" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  return <VerifyEmailClient token={token} />;
}
