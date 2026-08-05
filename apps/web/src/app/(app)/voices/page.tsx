import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Голоса" };

export default function VoicesPage() {
  return (
    <PagePlaceholder
      title="Голоса"
      description="Клонированные голоса: образцы, язык и стиль речи."
      planned={[
        "Загрузка образца или запись прямо в браузере",
        "Отдельное согласие на клонирование голоса",
        "Прослушивание пробной фразы после клонирования",
        "Отзыв согласия с удалением образца",
      ]}
    />
  );
}
