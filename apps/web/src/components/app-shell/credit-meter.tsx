import Link from "next/link";
import { availableSeconds, secondsToMinutesLabel, type CreditAccount } from "@avatar/contracts";
import { cn } from "@/lib/utils";

/**
 * Резерв показывается отдельной полосой, а не вычитается молча: пользователь
 * должен видеть, что минуты не пропали, а удерживаются под запущенной задачей
 * и вернутся, если она упадёт.
 */
export function CreditMeter({
  account,
  className,
}: {
  account: CreditAccount;
  className?: string;
}) {
  const available = availableSeconds(account);
  const total = account.balanceSeconds;
  const availableRatio = total === 0 ? 0 : available / total;
  const reservedRatio = total === 0 ? 0 : account.reservedSeconds / total;
  const low = availableRatio < 0.15;

  return (
    <Link
      href="/billing"
      className={cn(
        "border-sidebar-border/60 bg-sidebar-accent/40 hover:bg-sidebar-accent/70 block rounded-xl border p-3 transition-colors",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sidebar-foreground/60 text-xs font-medium">
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

      <p className="text-sidebar-foreground/50 mt-2 text-xs">
        {account.reservedSeconds > 0
          ? `${secondsToMinutesLabel(account.reservedSeconds)} мин зарезервировано`
          : `Всего ${secondsToMinutesLabel(total)} мин`}
      </p>
    </Link>
  );
}
