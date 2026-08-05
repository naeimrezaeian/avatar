import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="Настройки"
      description="Профиль, безопасность, язык интерфейса и параметры генерации по умолчанию."
      planned={[
        "Профиль и смена пароля",
        "Активные сессии и выход со всех устройств",
        "Язык интерфейса и тема оформления",
        "Согласия на обработку биометрии и их отзыв",
      ]}
    />
  );
}
