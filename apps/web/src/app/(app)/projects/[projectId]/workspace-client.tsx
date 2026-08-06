"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Scene,
  isJobActive,
  sceneGenerationState,
  videoInputHash,
  voiceoverInputHash,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { newId } from "@/lib/data/db";
import { useProjectDocument } from "@/lib/data/use-project-document";
import { aspectRatioLabel, formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SceneEditor } from "./scene-editor";

export function WorkspaceClient({ projectId }: { projectId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const project = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => dataClient.projects.get(projectId),
  });
  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const jobs = useQuery({
    queryKey: queryKeys.jobs(projectId),
    queryFn: () => dataClient.jobs.list({ projectId }),
  });

  const { document, isPending, update, isSaving, conflict } = useProjectDocument(projectId);

  // Выбор выводится, а не синхронизируется эффектом: до загрузки документа
  // список сцен неизвестен, а после удаления выбранной сцены хранимый id
  // указывал бы в пустоту.
  const activeSceneId =
    selectedId !== null && document?.scenes[selectedId] ? selectedId : (document?.sceneOrder[0] ?? null);

  if (isPending || project.isPending) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  if (!document || !project.data) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground text-sm">Проект не найден или был удалён.</p>
          <Button variant="ghost" render={<Link href="/projects" />} className="mt-3">
            К списку проектов
          </Button>
        </CardContent>
      </Card>
    );
  }

  const scene = activeSceneId ? (document.scenes[activeSceneId] ?? null) : null;
  const avatar = avatars.data?.find((item) => item.id === scene?.avatarId) ?? null;
  const activeJobs = (jobs.data ?? []).filter(
    (job) => isJobActive(job) && job.sceneId === activeSceneId,
  );

  const addScene = () => {
    const defaultAvatar = avatars.data?.find((item) => item.status === "ready") ?? null;
    if (!defaultAvatar?.voiceId) return;

    const created = Scene.parse({
      id: newId("scn"),
      title: `Сцена ${document.sceneOrder.length + 1}`,
      avatarId: defaultAvatar.id,
      voiceId: defaultAvatar.voiceId,
    });

    update((current) => ({
      ...current,
      scenes: { ...current.scenes, [created.id]: created },
      sceneOrder: [...current.sceneOrder, created.id],
    }));
    setSelectedId(created.id);
  };

  const removeScene = (sceneId: string) => {
    update((current) => {
      const scenes = { ...current.scenes };
      delete scenes[sceneId];
      return {
        ...current,
        scenes,
        sceneOrder: current.sceneOrder.filter((id) => id !== sceneId),
        // Клипы удалённой сцены висели бы на таймлайне без источника.
        clips: Object.fromEntries(
          Object.entries(current.clips).filter(
            ([, clip]) => !("sceneId" in clip && clip.sceneId === sceneId),
          ),
        ),
      };
    });
  };

  const patchScene = (patch: Partial<Scene>) => {
    if (!scene) return;
    update((current) => ({
      ...current,
      scenes: {
        ...current.scenes,
        [scene.id]: Scene.parse({ ...current.scenes[scene.id], ...patch }),
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/projects" />} aria-label="Назад">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{project.data.title}</h1>
          <p className="text-muted-foreground text-xs">
            {aspectRatioLabel(project.data.aspectRatio)} · {project.data.aspectRatio}
            {project.data.durationSec > 0
              ? ` · ${formatDuration(project.data.durationSec)}`
              : ""}
          </p>
        </div>
        <SaveIndicator isSaving={isSaving} conflict={conflict} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-1 pt-5">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Сцены
            </p>

            {document.sceneOrder.map((sceneId, index) => {
              const item = document.scenes[sceneId];
              if (!item) return null;
              return (
                <SceneListItem
                  key={sceneId}
                  scene={item}
                  index={index}
                  active={sceneId === activeSceneId}
                  onSelect={() => setSelectedId(sceneId)}
                  onRemove={() => removeScene(sceneId)}
                />
              );
            })}

            <Button variant="ghost" className="mt-2 w-full justify-start" onClick={addScene}>
              <Plus className="size-4" />
              Добавить сцену
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            {scene ? (
              <SceneEditor
                projectId={projectId}
                scene={scene}
                avatar={avatar}
                onChange={patchScene}
                activeJobs={activeJobs}
              />
            ) : (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Выберите сцену слева или добавьте новую.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="text-muted-foreground text-sm">
            Временная шкала появится следующим шагом: сцены будут раскладываться по дорожкам,
            а озвучка, музыка и надписи — двигаться и обрезаться независимо.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SceneListItem({
  scene,
  index,
  active,
  onSelect,
  onRemove,
}: {
  scene: Scene;
  index: number;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const state = sceneGenerationState(
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
  );

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
        active ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
      >
        <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{scene.title || "Без названия"}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {scene.durationSec !== null ? `${scene.durationSec.toFixed(1)} с` : "не озвучена"}
          </span>
        </span>
        {state === "ready" ? <CheckCircle2 className="text-success size-3.5 shrink-0" /> : null}
        {state === "outdated" ? (
          <span className="bg-warning size-2 shrink-0 rounded-full" title="Результат устарел" />
        ) : null}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 opacity-0 group-hover:opacity-100"
        aria-label="Удалить сцену"
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function SaveIndicator({ isSaving, conflict }: { isSaving: boolean; conflict: Error | null }) {
  if (conflict) {
    return (
      <span className="text-destructive text-xs">
        Проект изменён в другой вкладке — обновите страницу
      </span>
    );
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {isSaving ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          Сохранение
        </>
      ) : (
        "Все изменения сохранены"
      )}
    </span>
  );
}
