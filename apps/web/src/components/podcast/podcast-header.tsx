"use client";

import { Mic } from "lucide-react";
import type { Avatar } from "@avatar/contracts";
import { ParticipantFaces } from "./participant-faces";
import { cn } from "@/lib/utils";

/**
 * Шапка подкаста.
 *
 * Градиент здесь — только акцент: иконка и тонкая линия сверху. Сплошная
 * градиентная заливка во всю ширину спорит со светлым интерфейсом и тёмно-синей
 * навигацией, перетягивает внимание на декорацию и повторяет цвет кнопок,
 * из-за чего те перестают читаться как главное действие.
 */
export function PodcastHeader({
  eyebrow = "Видеоподкаст",
  title,
  subtitle,
  chips,
  participants,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  chips?: string[];
  participants: Array<Avatar | null>;
  className?: string;
}) {
  return (
    <div className={cn("border-border relative border-b", className)}>
      {/* Тонкая акцентная линия — тот же приём, что на страницах входа. */}
      <div className="bg-gradient-accent h-1 w-full" />

      <div className="bg-muted/30 flex flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
        <span className="bg-gradient-accent flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-soft">
          <Mic className="size-5 text-white" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 truncate text-xl font-semibold sm:text-2xl">
            {title || "Новый подкаст"}
          </h2>

          {subtitle ? (
            <p className="text-muted-foreground mt-0.5 truncate text-sm">{subtitle}</p>
          ) : null}

          {chips && chips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="border-border bg-card text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <ParticipantFaces avatars={participants} size="md" className="shrink-0" />
      </div>
    </div>
  );
}
