"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Download, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Scene,
  isJobActive,
  sceneGenerationState,
  videoInputHash,
  voiceoverInputHash,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { newId } from "@/lib/data/db";
import { useEditorStore } from "@/lib/editor/store";
import { syncSceneClips } from "@/lib/editor/operations";
import { useEditorSession, useUndoShortcuts } from "@/lib/editor/use-editor-session";
import { aspectRatioLabel, formatDuration } from "@/lib/format";
import { PreviewPlayer } from "@/components/preview/preview-player";
import { Timeline } from "@/components/timeline/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ExportDialog, projectDurationSec } from "./export-dialog";
import { SceneEditor } from "./scene-editor";

export function WorkspaceClient({ projectId }: { projectId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const session = useEditorSession(projectId);
  useUndoShortcuts();

  const document = useEditorStore((state) => state.document);
  const apply = useEditorStore((state) => state.apply);
  const dirty = useEditorStore((state) => state.dirty);

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

  /**
   * Движок генерации пишет результат сцены прямо в хранилище, а редактор держит
   * документ в памяти. Полная перезагрузка после каждой задачи стирала бы
   * несохранённые правки, поэтому при успехе переносятся только порождённые
   * поля сцены — и по ним раскладываются клипы.
   */
  useEffect(() => {
    return dataClient.generation.subscribe((event) => {
      if (event.status !== "succeeded") return;

      void dataClient.jobs.get(event.jobId).then(async (job) => {
        if (!job || job.projectId !== projectId || job.sceneId === null) return;

        const stored = await dataClient.documents.get(projectId);
        const generated = stored?.scenes[job.sceneId];
        if (!generated) return;

        apply(
          (draft) => {
            const scene = draft.scenes[generated.id];
            if (!scene) return;
            scene.voiceoverAssetId = generated.voiceoverAssetId;
            scene.videoAssetId = generated.videoAssetId;
            scene.voiceoverInputHash = generated.voiceoverInputHash;
            scene.videoInputHash = generated.videoInputHash;
            scene.durationSec = generated.durationSec;
            syncSceneClips(draft, scene);
          },
          { label: "Результат генерации", skipHistory: true },
        );
      });
    });
  }, [projectId, apply]);

  if (session.isPending || project.isPending) {
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

  // Выбор выводится из документа: хранимый id указывал бы в пустоту после
  // удаления сцены.
  const activeSceneId =
    selectedId !== null && document.scenes[selectedId]
      ? selectedId
      : (document.sceneOrder[0] ?? null);

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

    apply(
      (draft) => {
        draft.scenes[created.id] = created;
        draft.sceneOrder.push(created.id);
      },
      { label: "Добавление сцены" },
    );
    setSelectedId(created.id);
  };

  const removeScene = (sceneId: string) => {
    apply(
      (draft) => {
        delete draft.scenes[sceneId];
        draft.sceneOrder = draft.sceneOrder.filter((id) => id !== sceneId);
        // Клипы удалённой сцены остались бы на дорожках без источника.
        for (const [clipId, clip] of Object.entries(draft.clips)) {
          if ("sceneId" in clip && clip.sceneId === sceneId) delete draft.clips[clipId];
        }
      },
      { label: "Удаление сцены" },
    );
  };

  const patchScene = (patch: Partial<Scene>) => {
    if (!scene) return;
    apply(
      (draft) => {
        const target = draft.scenes[scene.id];
        if (!target) return;
        Object.assign(target, patch);
      },
      { label: "Правка сцены", coalesceKey: `scene:${scene.id}` },
    );
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
            {project.data.durationSec > 0 ? ` · ${formatDuration(project.data.durationSec)}` : ""}
          </p>
        </div>
        <SaveIndicator dirty={dirty} saveError={session.saveError} />
        <Button
          onClick={() => setExportOpen(true)}
          disabled={projectDurationSec(document) === 0}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          <Download className="size-4" />
          Экспорт
        </Button>
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        aspectRatio={document.aspectRatio}
        durationSec={projectDurationSec(document)}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_minmax(0,380px)]">
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

        <Card className="h-fit">
          <CardContent className="pt-5">
            <PreviewPlayer document={document} />
          </CardContent>
        </Card>
      </div>

      <Timeline document={document} />
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
        <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">{index + 1}</span>
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

function SaveIndicator({ dirty, saveError }: { dirty: boolean; saveError: Error | null }) {
  if (saveError) {
    return (
      <span className="text-destructive text-xs">
        Проект изменён в другой вкладке — обновите страницу
      </span>
    );
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {dirty ? (
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
