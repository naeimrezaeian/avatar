import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PodcastForm } from "../podcast-form";

export const metadata: Metadata = { title: "Новый подкаст" };

export default function NewPodcastPage() {
  return (
    <>
      {/* Название выпуска живёт на обложке и меняется по мере ввода, поэтому
          сверху — только путь: повторять заголовок дважды на одном экране
          незачем. */}
      <nav
        aria-label="Хлебные крошки"
        className="text-muted-foreground mx-auto mb-3 flex max-w-5xl items-center gap-1 text-sm"
      >
        <Link href="/podcast" className="hover:text-foreground transition-colors">
          Подкасты
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">Новый выпуск</span>
      </nav>

      <PodcastForm />
    </>
  );
}
