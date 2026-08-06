"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { secondsToMinutesLabel, type Plan } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PlansClient() {
  const queryClient = useQueryClient();

  const plans = useQuery({
    queryKey: [...queryKeys.plans, "all"],
    queryFn: () => dataClient.plans.list(true),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      dataClient.plans.setActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.plans }),
  });

  if (plans.isPending) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-3">
      {(plans.data ?? []).map((plan) => (
        <PlanRow
          key={plan.id}
          plan={plan}
          onToggle={() => toggle.mutate({ id: plan.id, isActive: !plan.isActive })}
        />
      ))}

      <p className="text-muted-foreground text-xs">
        Выключенный тариф исчезает из выбора у пользователей, но остаётся у тех, кто уже на нём:
        отключение тарифа не должно молча лишать людей оплаченных возможностей.
      </p>
    </div>
  );
}

function PlanRow({ plan, onToggle }: { plan: Plan; onToggle: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{plan.name}</p>
            {plan.isActive ? (
              <Badge variant="secondary">Доступен</Badge>
            ) : (
              <Badge variant="outline">Отключён</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{plan.description}</p>
        </div>

        <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <dt>Минут в месяц</dt>
            <dd className="text-foreground tabular-nums">
              {secondsToMinutesLabel(plan.monthlySeconds)}
            </dd>
          </div>
          <div>
            <dt>Разрешение</dt>
            <dd className="text-foreground">{plan.maxResolution}</dd>
          </div>
          <div>
            <dt>Проектов</dt>
            <dd className="text-foreground">{plan.maxProjects ?? "без ограничений"}</dd>
          </div>
          <div>
            <dt>Цена</dt>
            <dd className="text-foreground tabular-nums">
              {plan.priceMinor === 0 ? "0 ₽" : `${(plan.priceMinor / 100).toLocaleString("ru")} ₽`}
            </dd>
          </div>
        </dl>

        <Button variant={plan.isActive ? "ghost" : "secondary"} size="sm" onClick={onToggle}>
          {plan.isActive ? "Отключить" : "Включить"}
        </Button>
      </CardContent>
    </Card>
  );
}
