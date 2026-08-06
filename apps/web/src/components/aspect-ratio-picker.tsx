"use client";

import { Check } from "lucide-react";
import type { AspectRatio } from "@avatar/contracts";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{
  value: AspectRatio;
  label: string;
  hint: string;
  /** Пропорции миниатюры — те же, что у будущего кадра. */
  box: string;
}> = [
  { value: "16:9", label: "Горизонтальное", hint: "YouTube, презентации", box: "w-14 h-8" },
  { value: "9:16", label: "Вертикальное", hint: "Shorts, Reels, TikTok", box: "w-8 h-14" },
  { value: "1:1", label: "Квадратное", hint: "Лента соцсетей", box: "w-11 h-11" },
];

/**
 * Выбор кадра при создании проекта. Дальше он не меняется: композиция сцен
 * привязана к соотношению сторон, и смена задним числом ломает раскладку всех
 * уже собранных клипов.
 */
export function AspectRatioPicker({
  value,
  onChange,
}: {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors",
              active
                ? "border-ring bg-accent/40"
                : "border-border hover:bg-muted/60",
            )}
          >
            {active ? (
              <span className="bg-gradient-accent absolute top-2 right-2 flex size-4 items-center justify-center rounded-full">
                <Check className="size-2.5 text-white" />
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-md border-2",
                option.box,
                active ? "border-ring bg-background" : "border-muted-foreground/30",
              )}
            />
            <span className="text-center">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground block text-xs">{option.value}</span>
              <span className="text-muted-foreground block text-xs">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
