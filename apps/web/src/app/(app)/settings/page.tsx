import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Настройки"
        description="Профиль, пароль и устройства, с которых выполнен вход."
      />
      <SettingsClient />
    </>
  );
}
