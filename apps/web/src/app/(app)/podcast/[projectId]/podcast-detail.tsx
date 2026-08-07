"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Loader2,
  Pencil,
} from "lucide-react";
import {
  isJobActive,
  sceneGenerationState,
  secondsToMinutesLabel,
  videoInputHash,
  voiceoverInputHash,
  type RenderVersion,
  type Scene,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { aspectRatioLabel, formatDuration, formatUpdatedAt } from "@/lib/format";
import { PodcastHeader } from "@/components/podcast/podcast-header";
import { PreviewPlayer } from "@/components/preview/preview-player";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PodcastDetail({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => dataClient.projects.get(projectId),
  });
  const document = useQuery({
    queryKey: queryKeys.document(projectId),
    queryFn: () => dataClient.documents.get(projectId),
  });
  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const versions = useQuery({
    queryKey: queryKeys.renderVersions(projectId),
    queryFn: () => dataClient.renderVersions.list(projectId),
  });
  const jobs = useQuery({
    queryKey: queryKeys.jobs(projectId),
    queryFn: () => dataClient.jobs.list({ projectId }),
    refetchInterval: 3000,
  });

  const generateAll = useMutation({
    mutationFn: async () => {
      const doc = document.data;
      if (!doc) return;

      // Реплики запускаются по очереди, а не пачкой: одновременный старт
      // десятка задач упёрся бы в лимит и часть из них просто отвалилась бы.
      for (const sceneId of doc.sceneOrder) {
        const scene = doc.scenes[sceneId];
        if (!scene || scene.scriptText.trim().length === 0) continue;
        if (scene.voiceoverAssetId === null) {
          await dataClient.generation.startVoiceover({ projectId, sceneId });
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  if (project.isPending || document.isPending) {
    return <Skeleton className="h-[70vh] rounded-3xl" />;
  }

  if (!project.data || !document.data) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground text-sm">Выпуск не найден или был удалён.</p>
          <Button
            variant="ghost"
            nativeButton={false}
            role="link"
            render={<Link href="/podcast" />}
            className="mt-3"
          >
            К списку подкастов
          </Button>
        </CardContent>
      </Card>
    );
  }

  const participants = project.data.participantAvatarIds.map(
    (id) => avatars.data?.find((avatar) => avatar.id === id) ?? null,
  );

  const scenes = document.data.sceneOrder
    .map((id) => document.data!.scenes[id])
    .filter((scene): scene is Scene => scene !== undefined);

  const readyScenes = scenes.filter(
    (scene) =>
      sceneGenerationState(
        scene,
        voiceoverInputHash({
          voiceId: scene.voiceId,
          scriptText: scene.scriptText,
          speech: scene.speech,
        }),
        videoInputHash({
          avatarId: scene.avatarId,
          referenceAssetId: scene.avatarId,
          prompt: scene.prompt,
          voiceoverAssetId: scene.voiceoverAssetId ?? "",
        }),
      ) === "ready",
  ).length;

  const activeJobs = (jobs.data ?? []).filter(isJobActive);
  const renderVersions = versions.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          role="link"
          render={<Link href="/podcast" />}
          aria-label="К списку подкастов"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{project.data.title}</h1>
          <p className="text-muted-foreground text-sm">
            {participants.map((avatar) => avatar?.name ?? "удалённый аватар").join(" и ")}
          </p>
        </div>

        <Button
          variant="secondary"
          nativeButton={false}
          role="link"
          render={<Link href={`/projects/${projectId}`} />}
        >
          <Pencil className="size-4" />
          Открыть в редакторе
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="overflow-hidden pt-0">
          <PodcastHeader
            title={project.data.title}
            subtitle={participants
              .map((avatar) => avatar?.name ?? "удалённый аватар")
              .join(" и ")}
            chips={[
              project.data.aspectRatio,
              `${scenes.length} реплик`,
              formatDuration(project.data.durationSec),
            ]}
            participants={participants}
          />

          <CardContent className="space-y-4 pt-5">
            {renderVersions.length > 0 ? (
              <ReadyVideos versions={renderVersions} />
            ) : (
              <div className="space-y-3">
                <p className="font-medium">Готового видео пока нет</p>
                <PreviewPlayer document={document.data} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="font-medium">Состояние выпуска</p>

              <dl className="space-y-1.5 text-sm">
                <Row label="Реплик" value={String(scenes.length)} />
                <Row label="Сгенерировано" value={`${readyScenes} из ${scenes.length}`} />
                <Row label="Формат" value={aspectRatioLabel(project.data.aspectRatio)} />
                <Row label="Длительность" value={formatDuration(project.data.durationSec)} />
                <Row label="Изменён" value={formatUpdatedAt(project.data.updatedAt)} />
              </dl>

              {scenes.length > 0 ? (
                <Progress
                  value={Math.round((readyScenes / scenes.length) * 100)}
                  className="h-1.5"
                />
              ) : null}

              {activeJobs.length > 0 ? (
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <Loader2 className="size-3.5 animate-spin" />
                  Выполняется задач: {activeJobs.length}
                </p>
              ) : null}

              <Button
                onClick={() => generateAll.mutate()}
                disabled={generateAll.isPending || activeJobs.length > 0 || scenes.length === 0}
                className="bg-gradient-accent w-full text-white hover:opacity-90"
              >
                {generateAll.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Clapperboard className="size-4" />
                )}
                Озвучить все реплики
              </Button>

              <p className="text-muted-foreground text-xs">
                Сначала синтезируется речь — она бесплатна и служит входом для видео. Генерацию
                видео и сборку запускают из редактора.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-5">
              <p className="font-medium">Реплики</p>
              <ol className="space-y-1.5">
                {scenes.map((scene, index) => (
                  <li key={scene.id} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground w-5 shrink-0 tabular-nums">
                      {index + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        scene.speakerRole === "guest" && "text-muted-foreground",
                      )}
                    >
                      {scene.scriptText || "— пусто —"}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {scene.speakerRole === "guest" ? "Гость" : "Ведущий"}
                    </Badge>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function ReadyVideos({ versions }: { versions: RenderVersion[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = versions.find((item) => item.id === selectedId) ?? versions[0]!;
  const url = useAssetUrl(active.assetId);

  return (
    <div className="space-y-3">
      <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden rounded-xl">
        {url ? (
          <video controls src={url} className="size-full" />
        ) : (
          <div className="p-6 text-center">
            <Film className="text-muted-foreground mx-auto mb-2 size-8" />
            <p className="text-muted-foreground text-sm">
              Версия собрана, но файла нет: сборку ролика выполняет сервер, а серверная часть ещё
              не подключена.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {versions.map((version) => (
          <button
            key={version.id}
            type="button"
            onClick={() => setSelectedId(version.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              version.id === active.id
                ? "border-ring bg-accent/40 font-medium"
                : "border-border hover:bg-muted/60",
            )}
          >
            Версия {version.versionNumber} · {version.settings.resolution}
          </button>
        ))}

        <Button
          variant="secondary"
          size="sm"
          nativeButton={false}
          role="link"
          render={<Link href="/dashboard" />}
          className="ml-auto"
        >
          <Download className="size-3.5" />
          Все версии
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Версия {active.versionNumber} собрана из ревизии {active.documentRevision} ·{" "}
          {formatDuration(active.durationSec)} · {secondsToMinutesLabel(active.durationSec)} мин
          материала
        </AlertDescription>
      </Alert>
    </div>
  );
}
