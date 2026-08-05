import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Новый проект" };

export default function NewProjectPage() {
  return (
    <PagePlaceholder
      title="Новый проект"
      description="Соотношение сторон выбирается здесь и дальше не меняется: от него зависит композиция всех сцен."
      planned={[
        "Название и описание проекта",
        "Выбор соотношения сторон: 16:9, 9:16, 1:1",
        "Выбор аватара и голоса по умолчанию",
        "Старт с пустого проекта или из шаблона",
      ]}
    />
  );
}
