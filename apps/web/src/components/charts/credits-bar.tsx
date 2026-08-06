import { availableSeconds, secondsToMinutesLabel, type CreditAccount } from "@avatar/contracts";
import { cn } from "@/lib/utils";

/**
 * Распределение кредитов: доступно, в резерве под запущенными задачами и
 * израсходовано.
 *
 * Форма выбрана по задаче данных: это доли одного целого, а не изменение во
 * времени, поэтому одна горизонтальная полоса, а не график. Резерв показан
 * отдельным сегментом, а не вычтен молча: минуты не пропали, они удерживаются и
 * вернутся, если задача не выполнится.
 *
 * Цвета сегментов взяты из проверенных токенов, подписи набраны текстовыми
 * цветами: цвет метки рядом с цветной плашкой дублировал бы кодирование и
 * ломался бы при дальтонизме.
 */
export function CreditsBar({
  account,
  spentSeconds,
  className,
}: {
  account: CreditAccount;
  spentSeconds: number;
  className?: string;
}) {
  const available = availableSeconds(account);
  const reserved = account.reservedSeconds;
  const total = Math.max(1, available + reserved + spentSeconds);

  const segments = [
    { key: "available", label: "Доступно", value: available, color: "var(--chart-available)" },
    { key: "reserved", label: "В резерве", value: reserved, color: "var(--chart-reserved)" },
  ];

  return (
    <figure className={cn("space-y-3", className)}>
      {/* Дорожка целиком — израсходованное остаётся фоном: отдельным цветом оно
          соперничало бы за внимание с тем, что ещё можно потратить. */}
      <div className="bg-muted flex h-3 gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.key}
              className="h-full rounded-full"
              style={{
                width: `${(segment.value / total) * 100}%`,
                backgroundColor: segment.color,
              }}
            />
          ) : null,
        )}
      </div>

      <figcaption className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground text-sm">{segment.label}</span>
            <span className="text-foreground text-sm font-medium tabular-nums">
              {secondsToMinutesLabel(segment.value)} мин
            </span>
          </span>
        ))}

        <span className="flex items-center gap-2">
          <span className="bg-muted size-2.5 shrink-0 rounded-sm" aria-hidden="true" />
          <span className="text-muted-foreground text-sm">Израсходовано</span>
          <span className="text-foreground text-sm font-medium tabular-nums">
            {secondsToMinutesLabel(spentSeconds)} мин
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
