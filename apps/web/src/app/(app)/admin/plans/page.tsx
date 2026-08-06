import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PlansClient } from "./plans-client";

export const metadata: Metadata = { title: "Тарифы" };

export default function AdminPlansPage() {
  return (
    <>
      <PageHeader
        title="Тарифы"
        description="Пакеты минут, ограничения и доступность тарифов для выбора."
      />
      <PlansClient />
    </>
  );
}
