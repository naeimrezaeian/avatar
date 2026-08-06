import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  /**
   * В свёрнутой боковой панели видна только иконка: название появляется вместе
   * с раскрытием. Управляется классами родителя, а не состоянием, — иначе
   * подпись мигала бы на каждом наведении.
   */
  collapsible = false,
}: {
  className?: string;
  collapsible?: boolean;
}) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-gradient-accent flex size-9 shrink-0 items-center justify-center rounded-xl shadow-soft">
        <Sparkles className="size-4.5 text-white" />
      </span>
      <span
        className={cn(
          "flex flex-col leading-tight whitespace-nowrap",
          collapsible &&
            "opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100",
        )}
      >
        <span className="text-sidebar-foreground text-sm font-semibold">Аватар</span>
        <span className="text-sidebar-foreground/50 text-xs">Студия видео</span>
      </span>
    </Link>
  );
}
