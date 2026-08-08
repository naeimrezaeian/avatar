"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Scene, isJobActive, type AvatarClip } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { newId } from "@/lib/data/db";
import { useEditorStore } from "@/lib/editor/store";
import { syncSceneClips } from "@/lib/editor/operations";
import { syncSceneSubtitles } from "@/lib/editor/subtitles";
import type { ScriptPart } from "@/lib/editor/script-import";
import { useEditorSession, useUndoShortcuts } from "@/lib/editor/use-editor-session";
import { aspectRatioLabel, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PreviewPlayer } from "@/components/preview/preview-player";
import { ClipInspector } from "@/components/timeline/clip-inspector";
import { Timeline } from "@/components/timeline/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarPanel } from "./avatar-panel";
import { ExportDialog, projectDurationSec } from "./export-dialog";
import { ScriptPanel } from "./script-panel";
import { SceneActions } from "./scene-actions";

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
  /**
   * Сценарий во всю ширину.
   *
   * Колонка в 300 px годится, чтобы пробежать список сцен, но не чтобы писать в
   * ней текст: строка обрывается на трёх словах. Разворот отдаёт сценарию всю
   * ширину, а кадр и настройки на это время убираются — они всё равно не нужны,
   * пока набирают реплики.
   */
  const [scriptExpanded, setScriptExpanded] = useState(false);

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

  /**
   * Сценарий из файла.
   *
   * Пустая заготовка заменяется, непустой сценарий дополняется в конец: терять
   * уже написанное из-за одного нажатия недопустимо, а требовать сначала
   * очистить список — лишний шаг.
   */
  const importScript = (parts: ScriptPart[]) => {
    const avatarId = project.data?.defaultAvatarId ?? scene?.avatarId ?? null;
    const voiceId = project.data?.defaultVoiceId ?? scene?.voiceId ?? null;
    if (!avatarId || !voiceId) return;

    apply(
      (draft) => {
        const empty = draft.sceneOrder.filter(
          (id) => (draft.scenes[id]?.scriptText ?? "").trim().length === 0,
        );
        for (const id of empty) {
          delete draft.scenes[id];
          draft.sceneOrder = draft.sceneOrder.filter((item) => item !== id);
        }

        parts.forEach((part, index) => {
          const created = Scene.parse({
            id: newId("scn"),
            title: part.title ?? `Сцена ${draft.sceneOrder.length + 1}`,
            avatarId,
            voiceId,
            scriptText: part.text,
          });
          draft.scenes[created.id] = created;
          draft.sceneOrder.push(created.id);
          if (index === 0) setSelectedId(created.id);
        });
      },
      { label: "Сценарий из файла" },
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
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        aspectRatio={document.aspectRatio}
        durationSec={projectDurationSec(document)}
      />

      {/* Колонки выравниваются по нижнему краю: высоту ряда задаёт центральная
          колонка, а карточка оформления в ней не растягивается — поэтому под
          ползунками нет пустого поля, и при этом все три колонки кончаются на
          одной линии. */}
      <div
        className={cn(
          "grid gap-3",
          !scriptExpanded &&
            "xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,320px)]",
        )}
      >
        {/* Сценарий не задаёт высоту ряда: на широком экране карточка вынута из
            потока и растянута по строке. Иначе длинный список сцен вытягивал
            колонку вниз, и под карточкой оформления оставалось пустое поле. */}
        <div className={cn(!scriptExpanded && "xl:relative")}>
          <ScriptPanel
            projectId={projectId}
            document={document}
            activeSceneId={activeSceneId}
            busySceneIds={busyVoiceSceneIds}
            expanded={scriptExpanded}
            onToggleExpanded={() => setScriptExpanded((value) => !value)}
            onSelect={setSelectedId}
            onChangeText={changeText}
            onChangeTitle={(sceneId, title) => patchScene(sceneId, { title })}
            onRemove={removeScene}
            onAdd={addScene}
            onImport={importScript}
          />
        </div>

        {/* Кадр и оформление — одна колонка: настройки вида относятся к тому,
            что показано выше, и держать их на другом краю экрана значило бы
            заставлять переводить взгляд после каждой правки. */}
        <div className={cn("flex flex-col gap-3", scriptExpanded && "hidden")}>
          <Card className="shrink-0">
            <CardContent className="pt-5">
              <PreviewPlayer document={document} />
            </CardContent>
          </Card>

          {scene ? (
            <Card>
              <CardContent className="pt-5">
                <AvatarPanel projectId={projectId} clip={avatarClip} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className={cn("flex flex-col gap-3", scriptExpanded && "hidden")}>
          {scene ? (
            <>
              <Card>
                <CardContent className="pt-5">
                  <SceneActions
                    projectId={projectId}
                    scene={scene}
                    avatar={avatar}
                    activeJobs={activeJobs}
                    projectDurationSec={projectDurationSec(document)}
                    onChangePrompt={(prompt) => patchScene(scene.id, { prompt })}
                    onSubtitles={() => {
                      if (scene.durationSec === null) return;
                      apply((draft) => syncSceneSubtitles(draft, scene), {
                        label: "Субтитры сцены",
                      });
                    }}
                    onExport={() => setExportOpen(true)}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <p className="text-muted-foreground text-sm">
                  Добавьте первую сцену в сценарии слева.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Timeline document={document} />

      {/* Настройки выделенного клипа — сразу под шкалой, где его и выделили. */}
      <ClipInspector document={document} />
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
