import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Тариф и кредиты" };

export default function BillingPage() {
  return (
    <PagePlaceholder
      title="Тариф и кредиты"
      description="Кредиты измеряются в минутах генерации. Резерв под запущенные задачи показан отдельно от баланса."
      planned={[
        "Баланс, резерв и срок действия кредитов",
        "История начислений, списаний и возвратов",
        "Стоимость генерации по разрешениям",
        "Тарифные планы и их ограничения",
      ]}
    />
  );
}
