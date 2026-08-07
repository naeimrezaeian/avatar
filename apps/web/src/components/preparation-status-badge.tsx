import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import type { PreparationStatus } from "@avatar/contracts";
import { cn } from "@/lib/utils";

/** Статусы подготовки из п.6 ТЗ, одинаково выглядящие для аватаров и голосов. */
const STATUS_META: Record<
  PreparationStatus,
  { label: string; icon: typeof Upload; className: string; spin?: boolean }
> = {
  materials_uploaded: {
    label: "Материалы загружены",
    icon: Upload,
    className: "bg-muted text-muted-foreground",
  },
  processing: {
    label: "Обработка",
    icon: Loader2,
    className: "bg-accent text-accent-foreground",
    spin: true,
  },
  ready: {
    label: "Готов",
    icon: CheckCircle2,
    className: "bg-success/12 text-success",
  },
  error: {
    label: "Ошибка",
    icon: AlertCircle,
    className: "bg-destructive/12 text-destructive",
  },
};

export function PreparationStatusBadge({
  status,
  message,
  className,
}: {
  status: PreparationStatus;
  message?: string | null;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      // Подпись в одну строку: в компактной карточке длинное сообщение о ходе
      // подготовки переносилось и раздувало плашку вдвое.
      title={message ?? meta.label}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", meta.spin && "animate-spin")} />
      <span className="truncate">{message ?? meta.label}</span>
    </span>
  );
}
