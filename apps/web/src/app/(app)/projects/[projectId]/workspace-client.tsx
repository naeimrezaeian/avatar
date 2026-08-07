"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookmarkPlus, Captions, Download, Loader2 } from "lucide-react";
import { Scene, isJobActive, type AvatarClip } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { newId } from "@/lib/data/db";
import { useEditorStore } from "@/lib/editor/store";
import { syncSceneClips } from "@/lib/editor/operations";
import { syncSceneSubtitles } from "@/lib/editor/subtitles";
import { useEditorSession, useUndoShortcuts } from "@/lib/editor/use-editor-session";
import { aspectRatioLabel, formatDuration } from "@/lib/format";
import { PreviewPlayer } from "@/components/preview/preview-player";
import { Timeline } from "@/components/timeline/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarPanel } from "./avatar-panel";
import { ExportDialog, projectDurationSec } from "./export-dialog";
import { ScriptPanel } from "./script-panel";
import { SceneSettings } from "./scene-settings";

/**
 * Рабочее пространство проекта — единственный экран работы над роликом.
 *
 * Раньше их было два: редактор со шкалой и студия со сценарием. Они делили
 * один документ и повторяли друг друга — сцены, превью и запуск генерации были
 * в обоих, — поэтому правка в одном месте выглядела пропажей в другом. Теперь
 * всё вместе: сценарий слева, кадр и настройки сцены по центру, оформление
 * аватара справа, раскладка во времени внизу.
 */
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
    return <Skeleton className="h-[70vh] rounded-2xl" />;
  }

  if (!document || !project.data) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground text-sm">Проект не найден или был удалён.</p>
          <Button
            variant="ghost"
            nativeButton={false}
            role="link"
            render={<Link href="/projects" />}
            className="mt-3"
          >
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

  // Какие сцены сейчас озвучиваются — нужно кнопке в строке сценария.
  const busyVoiceSceneIds = new Set(
    (jobs.data ?? [])
      .filter((job) => isJobActive(job) && job.kind === "tts" && job.sceneId !== null)
      .map((job) => job.sceneId as string),
  );

  const avatarClip =
    scene !== null
      ? ((Object.values(document.clips).find(
          (clip) => clip.kind === "avatar" && clip.sceneId === scene.id,
        ) ?? null) as AvatarClip | null)
      : null;

  const addScene = () => {
    // Аватар и голос берутся из проекта: они выбраны при его создании и внутри
    // не меняются, поэтому подставлять сюда «первый готовый» нельзя — сцены
    // разъехались бы по говорящим.
    const previous = scene ?? Object.values(document.scenes)[0] ?? null;
    const avatarId = project.data?.defaultAvatarId ?? previous?.avatarId;
    const voiceId = project.data?.defaultVoiceId ?? previous?.voiceId;
    if (!avatarId || !voiceId) return;

    const created = Scene.parse({
      id: newId("scn"),
      title: `Сцена ${document.sceneOrder.length + 1}`,
      avatarId,
      voiceId,
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

  const patchScene = (sceneId: string, patch: Partial<Scene>) => {
    apply(
      (draft) => {
        const target = draft.scenes[sceneId];
        if (target) Object.assign(target, patch);
      },
      { label: "Правка сцены", coalesceKey: `scene:${sceneId}` },
    );
  };

  /** Вставленный текст с пустыми строками между абзацами разбивается на сцены. */
  const changeText = (sceneId: string, text: string) => {
    const parts = text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    const source = document.scenes[sceneId];
    if (parts.length < 2 || !source) {
      patchScene(sceneId, { scriptText: text });
      return;
    }

    apply(
      (draft) => {
        const target = draft.scenes[sceneId];
        if (target) target.scriptText = parts[0]!;

        const position = draft.sceneOrder.indexOf(sceneId);
        const created = parts.slice(1).map((part, index) =>
          Scene.parse({
            id: newId("scn"),
            title: `Сцена ${position + index + 2}`,
            avatarId: source.avatarId,
            voiceId: source.voiceId,
            scriptText: part,
          }),
        );

        for (const item of created) draft.scenes[item.id] = item;
        draft.sceneOrder.splice(position + 1, 0, ...created.map((item) => item.id));
      },
      { label: "Разбивка сценария на сцены" },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          role="link"
          render={<Link href="/projects" />}
          aria-label="К списку проектов"
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{project.data.title}</h1>
          <p className="text-muted-foreground text-xs">
            {aspectRatioLabel(project.data.aspectRatio)} · {document.sceneOrder.length} сцен
            {project.data.durationSec > 0 ? ` · ${formatDuration(project.data.durationSec)}` : ""}
          </p>
        </div>

        <SaveIndicator dirty={dirty} saveError={session.saveError} />

        <Button
          variant="secondary"
          onClick={() => {
            if (!scene || scene.durationSec === null) return;
            apply((draft) => syncSceneSubtitles(draft, scene), { label: "Субтитры сцены" });
          }}
          disabled={!scene || scene.durationSec === null}
          title={
            scene?.durationSec === null
              ? "Сначала синтезируйте озвучку: без неё неизвестно время реплик"
              : undefined
          }
        >
          <Captions className="size-4" />
          Субтитры
        </Button>

        <Button
          variant="secondary"
          onClick={() => void dataClient.projects.update(projectId, { isTemplate: true })}
        >
          <BookmarkPlus className="size-4" />
          Как шаблон
        </Button>

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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,320px)]">
        <ScriptPanel
          projectId={projectId}
          document={document}
          activeSceneId={activeSceneId}
          busySceneIds={busyVoiceSceneIds}
          onSelect={setSelectedId}
          onChangeText={changeText}
          onRemove={removeScene}
          onAdd={addScene}
        />

        <div className="space-y-3">
          <Card>
            <CardContent className="pt-5">
              <PreviewPlayer document={document} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              {scene ? (
                <SceneSettings
                  projectId={projectId}
                  scene={scene}
                  avatar={avatar}
                  onChange={(patch) => patchScene(scene.id, patch)}
                  activeJobs={activeJobs}
                />
              ) : (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Добавьте первую сцену в сценарии слева.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:max-h-[calc(100dvh-11rem)] xl:overflow-y-auto">
          <CardContent className="pt-5">
            {scene ? (
              <AvatarPanel
                scene={scene}
                clip={avatarClip}
                sceneIndex={document.sceneOrder.indexOf(scene.id)}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Оформление появится, когда будет выбрана сцена.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Timeline document={document} />
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
