"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Link2, Link2Off, Trash2 } from "lucide-react";
import type { Project, RenderVersion } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { aspectRatioLabel, formatDuration, formatUpdatedAt } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Срок жизни публичной ссылки по умолчанию. */
const SHARE_DAYS = 7;

export function VideosClient() {
  const versions = useQuery({
    queryKey: queryKeys.renderVersions(),
    queryFn: () => dataClient.renderVersions.list(),
  });
  const projects = useQuery({
    queryKey: [...queryKeys.projects, "all"],
    queryFn: () => dataClient.projects.list({ includeArchived: true }),
  });

  if (versions.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-52 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!versions.data || versions.data.length === 0) {
    return (
      <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
        <span className="bg-gradient-accent mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
          <Clapperboard className="size-5 text-white" />
        </span>
        <h2 className="font-semibold">Готовых видео пока нет</h2>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
          Версии появляются здесь после экспорта проекта. Каждая помнит, из какой ревизии
          проекта собрана, — поэтому к предыдущей всегда можно вернуться.
        </p>
        <Button
          nativeButton={false} render={<Link href="/projects" />}
          className="bg-gradient-accent mt-5 text-white hover:opacity-90"
        >
          К проектам
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {versions.data.map((version) => (
        <VersionCard
          key={version.id}
          version={version}
          project={projects.data?.find((item) => item.id === version.projectId) ?? null}
        />
      ))}
    </div>
  );
}

function VersionCard({
  version,
  project,
}: {
  version: RenderVersion;
  project: Project | null;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.renderVersions() });

  const share = useMutation({
    mutationFn: () => dataClient.renderVersions.share(version.id, SHARE_DAYS),
    onSuccess: invalidate,
  });
  const revoke = useMutation({
    mutationFn: () => dataClient.renderVersions.revokeShare(version.id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => dataClient.renderVersions.remove(version.id),
    onSuccess: invalidate,
  });

  const shared = version.shareToken !== null;

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {project?.title ?? "Проект удалён"}
            </p>
            <p className="text-muted-foreground text-xs">
              Версия {version.versionNumber} · из ревизии {version.documentRevision}
            </p>
          </div>
          <Badge variant="secondary">{version.settings.resolution}</Badge>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{aspectRatioLabel(version.settings.aspectRatio)}</span>
          <span>·</span>
          <span className="uppercase">{version.settings.format}</span>
          <span>·</span>
          <span>{version.settings.fps} к/с</span>
          <span>·</span>
          <span className="tabular-nums">{formatDuration(version.durationSec)}</span>
        </div>

        {version.settings.watermark ? (
          <p className="text-muted-foreground text-xs">С водяным знаком</p>
        ) : null}

        <p className="text-muted-foreground text-xs">
          Собрана {formatUpdatedAt(version.createdAt)}
        </p>

        {shared ? (
          <p className="text-success text-xs">
            Ссылка активна до {new Date(version.shareExpiresAt!).toLocaleDateString("ru")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {shared ? (
            <Button variant="secondary" size="sm" onClick={() => revoke.mutate()}>
              <Link2Off className="size-3.5" />
              Отозвать ссылку
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => share.mutate()}>
              <Link2 className="size-3.5" />
              Поделиться
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => remove.mutate()}>
            <Trash2 className="size-3.5" />
            Удалить
          </Button>
        </div>

        <p className="text-muted-foreground border-border border-t pt-2 text-xs">
          Файл появится, когда сборку начнёт выполнять сервер: собрать настоящий ролик в
          браузере на этом этапе нечем.
        </p>
      </CardContent>
    </Card>
  );
}
