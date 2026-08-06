"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clapperboard, Loader2, Mic, Plus } from "lucide-react";
import type { Avatar, Project } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { aspectRatioLabel, formatDuration, formatUpdatedAt } from "@/lib/format";
import { ParticipantFaces } from "@/components/podcast/participant-faces";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PodcastList() {
  const projects = useQuery({
    queryKey: [...queryKeys.projects, "podcasts"],
    queryFn: () => dataClient.projects.list({ includeArchived: true }),
  });
  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const versions = useQuery({
    queryKey: queryKeys.renderVersions(),
    queryFn: () => dataClient.renderVersions.list(),
  });

  const podcasts = (projects.data ?? []).filter((project) => project.format === "podcast");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-sm">
          {podcasts.length > 0 ? `Выпусков: ${podcasts.length}` : "Пока ни одного выпуска"}
        </p>
        <Button
          nativeButton={false}
          role="link"
          render={<Link href="/podcast/new" />}
          className="bg-gradient-accent ml-auto text-white hover:opacity-90"
        >
          <Plus className="size-4" />
          Новый подкаст
        </Button>
      </div>

      {projects.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : podcasts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {podcasts.map((project) => (
            <PodcastCard
              key={project.id}
              project={project}
              avatars={avatars.data ?? []}
              readyCount={
                (versions.data ?? []).filter((version) => version.projectId === project.id).length
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

function PodcastCard({
  project,
  avatars,
  readyCount,
}: {
  project: Project;
  avatars: Avatar[];
  readyCount: number;
}) {
  const participants = project.participantAvatarIds.map(
    (id) => avatars.find((avatar) => avatar.id === id) ?? null,
  );

  return (
    <Link href={`/podcast/${project.id}`} className="block">
      <Card className="overflow-hidden pt-0 shadow-soft transition-shadow hover:shadow-soft-lg">
        {/* Лица участников: подкаст узнают по собеседникам, а не по названию.
            Градиент оставлен тонкой линией — сплошная заливка спорила бы со
            светлым интерфейсом и перетягивала внимание на декорацию. */}
        <div className="bg-gradient-accent h-1 w-full" />
        <div className="bg-muted/30 border-border flex items-center justify-center border-b py-4">
          <ParticipantFaces avatars={participants} size="md" />
        </div>

        <CardContent className="space-y-2 pt-4">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate font-medium">{project.title}</p>
            {readyCount > 0 ? (
              <Badge variant="secondary" className="shrink-0">
                <CheckCircle2 className="size-3" />
                {readyCount}
              </Badge>
            ) : null}
          </div>

          <p className="text-muted-foreground truncate text-sm">
            {participants
              .map((avatar) => avatar?.name ?? "удалённый аватар")
              .join(" и ")}
          </p>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>{aspectRatioLabel(project.aspectRatio)}</span>
            <span>·</span>
            <span>{project.sceneCount} реплик</span>
            {project.durationSec > 0 ? (
              <>
                <span>·</span>
                <span className="tabular-nums">{formatDuration(project.durationSec)}</span>
              </>
            ) : null}
          </div>

          <p className="text-muted-foreground text-xs">
            {readyCount > 0 ? (
              <span className="text-success">Готовое видео: {readyCount}</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3" />
                Видео ещё не собрано
              </span>
            )}
            {" · изменён "}
            {formatUpdatedAt(project.updatedAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
      <span className="bg-gradient-accent mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
        <Mic className="size-5 text-white" />
      </span>
      <h2 className="font-semibold">Подкастов пока нет</h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
        Подкаст — разговор двух аватаров. Реплики становятся сценами обычного проекта, поэтому
        править и монтировать их можно как всё остальное.
      </p>
      <Button
        nativeButton={false}
        role="link"
        render={<Link href="/podcast/new" />}
        className="bg-gradient-accent mt-5 text-white hover:opacity-90"
      >
        <Clapperboard className="size-4" />
        Создать первый выпуск
      </Button>
    </div>
  );
}
