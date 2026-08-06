import Link from "next/link";
import { availableSeconds, secondsToMinutesLabel, type CreditAccount } from "@avatar/contracts";
import { cn } from "@/lib/utils";

/**
 * Остаток кредитов в боковой панели.
 *
 * Резерв показывается отдельной полосой, а не вычитается молча: пользователь
 * должен видеть, что минуты не пропали, а удерживаются под запущенной задачей
 * и вернутся, если она упадёт.
 */
export function CreditMeter({
  account,
  className,
  /** В свёрнутой панели остаётся только число: подписи там не помещаются. */
  collapsible = false,
}: {
  account: CreditAccount;
  className?: string;
  collapsible?: boolean;
}) {
  const available = availableSeconds(account);
  const total = account.balanceSeconds;
  const availableRatio = total === 0 ? 0 : available / total;
  const reservedRatio = total === 0 ? 0 : account.reservedSeconds / total;
  const low = availableRatio < 0.15;

  return (
    <Link
      href="/billing"
      title={`Доступно ${secondsToMinutesLabel(available)} мин`}
      className={cn(
        "border-sidebar-border/60 bg-sidebar-accent/40 hover:bg-sidebar-accent/70 block rounded-xl border transition-colors",
        collapsible ? "p-2 group-hover/sidebar:p-3 group-focus-within/sidebar:p-3" : "p-3",
        className,
      )}
    >
      {collapsible ? (
        // Свёрнутый вид: число минут и тонкая полоса. Прятать остаток целиком
        // нельзя — за ним в эту панель и смотрят.
        <div className="flex flex-col items-center gap-1.5 group-hover/sidebar:hidden group-focus-within/sidebar:hidden">
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              low ? "text-warning" : "text-sidebar-foreground",
            )}
          >
            {secondsToMinutesLabel(available)}
          </span>
          <span className="bg-sidebar-border/70 flex h-1 w-full overflow-hidden rounded-full">
            <span
              className="bg-gradient-accent h-full"
              style={{ width: `${availableRatio * 100}%` }}
            />
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          collapsible &&
            "hidden group-hover/sidebar:block group-focus-within/sidebar:block",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sidebar-foreground/60 text-xs font-medium whitespace-nowrap">
            Доступно минут
          </span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              low ? "text-warning" : "text-sidebar-foreground",
            )}
          >
            {secondsToMinutesLabel(available)}
          </span>
        </div>

        <div className="bg-sidebar-border/70 mt-2 flex h-1.5 overflow-hidden rounded-full">
          <span
            className="bg-gradient-accent h-full"
            style={{ width: `${availableRatio * 100}%` }}
          />
          <span
            className="bg-sidebar-foreground/30 h-full"
            style={{ width: `${reservedRatio * 100}%` }}
          />
        </div>

        <p className="text-sidebar-foreground/50 mt-2 text-xs whitespace-nowrap">
          {account.reservedSeconds > 0
            ? `${secondsToMinutesLabel(account.reservedSeconds)} мин зарезервировано`
            : `Всего ${secondsToMinutesLabel(total)} мин`}
        </p>
      </div>
    </Link>
  );
}
