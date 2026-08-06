import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { VoicesClient } from "./voices-client";

export const metadata: Metadata = { title: "Голоса" };

export default function VoicesPage() {
  return (
    <>
      <PageHeader
        title="Голоса"
        description="Клонированные голоса для озвучивания сцен. Клонирование запускается только после отдельного согласия."
      />
      <VoicesClient />
    </>
  );
}
