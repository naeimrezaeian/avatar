import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { BillingClient } from "./billing-client";

export const metadata: Metadata = { title: "Тариф и кредиты" };

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Тариф и кредиты"
        description="Баланс, резерв под запущенными задачами, стоимость генерации и история операций."
      />
      <BillingClient />
    </>
  );
}
