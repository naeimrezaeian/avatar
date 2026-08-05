import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Аватары" };

export default function AvatarsPage() {
  return (
    <PagePlaceholder
      title="Аватары"
      description="Цифровые аватары: фотографии, привязанный голос и статус подготовки."
      planned={[
        "Загрузка фотографий и выбор основной",
        "Отдельное согласие на использование изображения лица",
        "Статусы: материалы загружены, обработка, готов, ошибка",
        "Тестовый ролик перед первым проектом",
      ]}
    />
  );
}
