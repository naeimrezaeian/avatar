"use client";

import { useQuery } from "@tanstack/react-query";
import { availableSeconds, secondsToMinutesLabel } from "@avatar/contracts";
import { FolderKanban, UserRound, Wallet } from "lucide-react";
import { dataClient, queryKeys } from "@/lib/data";
import { ReadyVideos } from "./ready-videos";
import { CreditsBar } from "@/components/charts/credits-bar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardClient() {
  const projects = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => dataClient.projects.list(),
  });
  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount("usr_demo"),
  });
  const transactions = useQuery({
    queryKey: queryKeys.creditTransactions,
    queryFn: () => dataClient.credits.listTransactions("usr_demo"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
        <StatTile
          label="Проекты"
          value={String(projects.data?.length ?? "—")}
          icon={FolderKanban}
        />
        <StatTile
          label="Аватары"
          value={String(avatars.data?.length ?? "—")}
          icon={UserRound}
        />
        <StatTile
          label="Доступно минут"
          value={account.data ? secondsToMinutesLabel(availableSeconds(account.data)) : "—"}
          icon={Wallet}
          tone={
            account.data && availableSeconds(account.data) < 300 ? "warning" : "accent"
          }
          hint={
            account.data && account.data.reservedSeconds > 0
              ? `${secondsToMinutesLabel(account.data.reservedSeconds)} мин удерживается`
              : undefined
          }
        />
      </div>

      {account.data ? (
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Кредиты</CardTitle>
          </CardHeader>
          <CardContent>
            <CreditsBar
              account={account.data}
              spentSeconds={(transactions.data ?? [])
                .filter((item) => item.kind === "spend")
                .reduce((sum, item) => sum + Math.abs(item.deltaSeconds), 0)}
            />
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3 lg:col-span-3">
        <h2 className="font-semibold">Готовые видео</h2>
        <ReadyVideos />
      </section>
    </div>
  );
}
