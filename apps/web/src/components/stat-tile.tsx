import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Плитка показателя: подпись, крупное число и иконка.
 *
 * Числа здесь — не график: у одного значения нет ни ряда, ни сравнения, и
 * рисовать по нему диаграмму значило бы усложнить чтение ради украшения.
 * Иконка помогает найти нужную плитку глазами, а не кодирует данные.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "accent" | "warning";
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* Мягкое свечение в углу даёт плитке объём, но не спорит с числом:
          оно приглушено и уходит за край. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-12 -right-10 size-32 rounded-full blur-3xl",
          tone === "accent" ? "bg-primary/20" : tone === "warning" ? "bg-warning/15" : "bg-muted/50",
        )}
      />

      <CardContent className="relative flex items-start justify-between gap-3 pt-5">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p
            className={cn(
              "mt-1 text-3xl font-semibold tabular-nums",
              tone === "warning" && "text-warning",
            )}
          >
            {value}
          </p>
          {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
        </div>

        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            tone === "accent"
              ? "bg-gradient-accent text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
