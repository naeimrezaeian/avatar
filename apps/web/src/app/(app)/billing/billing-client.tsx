"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import {
  QUALITY_COST_MULTIPLIER,
  availableSeconds,
  secondsToMinutesLabel,
  type CreditTransaction,
  type Plan,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useSession } from "@/lib/auth/session-context";
import { formatUpdatedAt } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<CreditTransaction["kind"], string> = {
  grant: "Начисление",
  spend: "Списание",
  refund: "Возврат",
  expire: "Сгорание",
  admin_adjust: "Корректировка администратором",
};

export function BillingClient() {
  const { user } = useSession();

  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount(user!.id),
    enabled: user !== null,
  });
  const transactions = useQuery({
    queryKey: queryKeys.creditTransactions,
    queryFn: () => dataClient.credits.listTransactions(user!.id),
    enabled: user !== null,
  });
  const plans = useQuery({ queryKey: queryKeys.plans, queryFn: () => dataClient.plans.list() });

  if (account.isPending || !account.data) return <Skeleton className="h-64 rounded-2xl" />;

  const data = account.data;
  const available = availableSeconds(data);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-xs">Доступно</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {secondsToMinutesLabel(available)} мин
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-xs">В резерве под задачами</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {secondsToMinutesLabel(data.reservedSeconds)} мин
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Вернётся, если задача не выполнится
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-xs">Всего на счету</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {secondsToMinutesLabel(data.balanceSeconds)} мин
            </p>
            {data.expiresAt ? (
              <p className="text-muted-foreground mt-0.5 text-xs">
                Действуют до {new Date(data.expiresAt).toLocaleDateString("ru")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Сколько стоит генерация</h2>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground mb-3 text-sm">
              Кредиты считаются в минутах готового видео. Разрешение меняет стоимость: за одну
              минуту ролика списывается
            </p>
            <ul className="space-y-1 text-sm">
              {(Object.keys(QUALITY_COST_MULTIPLIER) as Array<keyof typeof QUALITY_COST_MULTIPLIER>).map(
                (resolution) => (
                  <li key={resolution} className="flex justify-between">
                    <span>{resolution}</span>
                    <span className="tabular-nums">
                      {QUALITY_COST_MULTIPLIER[resolution]} мин
                    </span>
                  </li>
                ),
              )}
            </ul>
            <p className="text-muted-foreground mt-3 text-xs">
              Синтез речи не тарифицируется — послушать текст можно бесплатно, до генерации видео.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Тарифные планы</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(plans.data ?? []).map((plan) => (
            <PlanCard key={plan.id} plan={plan} current={plan.id === data.planId} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">История операций</h2>
        <Card>
          <CardContent className="p-0">
            {(transactions.data ?? []).length === 0 ? (
              <p className="text-muted-foreground p-5 text-sm">Операций пока не было.</p>
            ) : (
              <ul className="divide-border divide-y">
                {(transactions.data ?? []).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg",
                        item.deltaSeconds >= 0
                          ? "bg-success/12 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.deltaSeconds >= 0 ? (
                        <Plus className="size-3.5" />
                      ) : (
                        <Minus className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{KIND_LABELS[item.kind]}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.note || formatUpdatedAt(item.createdAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {item.deltaSeconds >= 0 ? "+" : "−"}
                      {secondsToMinutesLabel(Math.abs(item.deltaSeconds))} мин
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
  const features = [
    `${secondsToMinutesLabel(plan.monthlySeconds)} минут в месяц`,
    `До ${plan.maxResolution}`,
    plan.maxProjects === null ? "Проектов без ограничений" : `До ${plan.maxProjects} проектов`,
    plan.maxAvatars === null ? "Аватаров без ограничений" : `До ${plan.maxAvatars} аватаров`,
    plan.watermark ? "С водяным знаком" : "Без водяного знака",
  ];

  return (
    <Card className={cn(current && "ring-ring ring-2")}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{plan.name}</p>
            <p className="text-muted-foreground text-xs">{plan.description}</p>
          </div>
          {current ? <Badge>Текущий</Badge> : null}
        </div>

        <p className="text-2xl font-semibold tabular-nums">
          {plan.priceMinor === 0
            ? "Бесплатно"
            : `${(plan.priceMinor / 100).toLocaleString("ru")} ₽`}
          {plan.priceMinor > 0 ? (
            <span className="text-muted-foreground text-sm font-normal"> / мес</span>
          ) : null}
        </p>

        <ul className="space-y-1">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-1.5 text-xs">
              <Check className="text-success mt-0.5 size-3 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        {/* Оплаты нет и быть не может без серверной части: приём платежей
            обязан проходить через платёжного провайдера, а не через браузер. */}
        <p className="text-muted-foreground border-border border-t pt-2 text-xs">
          Смена тарифа появится вместе с приёмом оплаты.
        </p>
      </CardContent>
    </Card>
  );
}
