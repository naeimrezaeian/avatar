import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AdminSettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Настройки системы" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader
        title="Настройки системы"
        description="Лимиты загрузки, доступные модели, хранение черновиков и объявление для пользователей."
      />
      <AdminSettingsClient />
    </>
  );
}
