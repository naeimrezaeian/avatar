"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ListOrdered, Plus, Trash2 } from "lucide-react";
import {
  Scene,
  estimateSpeechDurationSec,
  sceneGenerationState,
  videoInputHash,
  voiceoverInputHash,
  type AvatarClip,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { newId } from "@/lib/data/db";
import { useEditorStore } from "@/lib/editor/store";
import { useEditorSession, useUndoShortcuts } from "@/lib/editor/use-editor-session";
import { PreviewPlayer } from "@/components/preview/preview-player";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AvatarPanel } from "./avatar-panel";

/**
 * Студия — тот же документ проекта, но с другой точкой входа: здесь работают от
 * сценария. Строка сценария и есть сцена, поэтому отдельного хранилища нет и
 * правки видны в обычном редакторе сразу.
 */
export function StudioClient({ projectId }: { projectId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const session = useEditorSession(projectId);
  useUndoShortcuts();

  const document = useEditorStore((state) => state.document);
  const apply = useEditorStore((state) => state.apply);

  const project = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => dataClient.projects.get(projectId),
  });
  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });

  if (session.isPending || !document || !project.data) {
    return <Skeleton className="h-[70vh] rounded-2xl" />;
  }

  const activeSceneId =
    selectedId !== null && document.scenes[selectedId]
      ? selectedId
      : (document.sceneOrder[0] ?? null);
  const scene = activeSceneId ? (document.scenes[activeSceneId] ?? null) : null;

  const avatarClip =
    scene !== null
      ? ((Object.values(document.clips).find(
          (clip) => clip.kind === "avatar" && clip.sceneId === scene.id,
        ) ?? null) as AvatarClip | null)
      : null;

  const addScene = () => {
    const previous = scene ?? Object.values(document.scenes)[0] ?? null;
    const defaultAvatar = avatars.data?.find((item) => item.status === "ready") ?? null;
    const avatarId = previous?.avatarId ?? defaultAvatar?.id;
    const voiceId = previous?.voiceId ?? defaultAvatar?.voiceId;
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

  const patchScene = (sceneId: string, patch: Partial<Scene>) => {
    apply(
      (draft) => {
        const target = draft.scenes[sceneId];
        if (target) Object.assign(target, patch);
      },
      { label: "Правка сценария", coalesceKey: `script:${sceneId}` },
    );
  };

  const removeScene = (sceneId: string) => {
    apply(
      (draft) => {
        delete draft.scenes[sceneId];
        draft.sceneOrder = draft.sceneOrder.filter((id) => id !== sceneId);
        for (const [clipId, clip] of Object.entries(draft.clips)) {
          if ("sceneId" in clip && clip.sceneId === sceneId) delete draft.clips[clipId];
        }
      },
      { label: "Удаление сцены" },
    );
  };

  /** Разбиение вставленного текста: каждый абзац становится отдельной сценой. */
  const splitIntoScenes = (sceneId: string, text: string) => {
    const parts = text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length < 2) return false;

    const source = document.scenes[sceneId];
    if (!source) return false;

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
    return true;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href={`/projects/${projectId}`} />}
          aria-label="К обычному редактору"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{project.data.title}</h1>
          <p className="text-muted-foreground text-xs">
            Студия · {document.sceneOrder.length} сцен
          </p>
        </div>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={`/projects/${projectId}`} />}
        >
          Временная шкала
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,320px)]">
        {/* Сценарий */}
        <Card className="h-fit xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto">
          <CardContent className="space-y-2 pt-5">
            <div className="mb-1 flex items-center gap-2">
              <ListOrdered className="text-muted-foreground size-4" />
              <p className="font-medium">Сценарий</p>
            </div>

            {document.sceneOrder.map((sceneId, index) => {
              const item = document.scenes[sceneId];
              if (!item) return null;
              return (
                <ScriptLine
                  key={sceneId}
                  scene={item}
                  index={index}
                  active={sceneId === activeSceneId}
                  onSelect={() => setSelectedId(sceneId)}
                  onChange={(text) => {
                    if (!splitIntoScenes(sceneId, text)) {
                      patchScene(sceneId, { scriptText: text });
                    }
                  }}
                  onRemove={() => removeScene(sceneId)}
                />
              );
            })}

            <Button variant="ghost" className="w-full justify-start" onClick={addScene}>
              <Plus className="size-4" />
              Добавить сцену
            </Button>

            <p className="text-muted-foreground pt-1 text-xs">
              Вставьте текст с пустыми строками между абзацами — он сам разложится по сценам.
            </p>
          </CardContent>
        </Card>

        {/* Кадр */}
        <Card className="h-fit">
          <CardContent className="pt-5">
            <PreviewPlayer document={document} />
          </CardContent>
        </Card>

        {/* Аватар и голос */}
        <Card className="h-fit xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto">
          <CardContent className="pt-5">
            {scene ? (
              <AvatarPanel
                projectId={projectId}
                scene={scene}
                clip={avatarClip}
                sceneIndex={document.sceneOrder.indexOf(scene.id)}
              />
            ) : (
              <p className="text-muted-foreground text-sm">Добавьте первую сцену слева.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <SceneStrip
        sceneIds={document.sceneOrder}
        scenes={document.scenes}
        activeId={activeSceneId}
        onSelect={setSelectedId}
        onAdd={addScene}
      />
    </div>
  );
}

function ScriptLine({
  scene,
  index,
  active,
  onSelect,
  onChange,
  onRemove,
}: {
  scene: Scene;
  index: number;
  active: boolean;
  onSelect: () => void;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const estimated = estimateSpeechDurationSec(scene.scriptText, scene.speech);
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
        "group rounded-lg border p-2 transition-colors",
        active ? "border-ring bg-accent/30" : "border-transparent hover:bg-muted/60",
      )}
      onFocusCapture={onSelect}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
          {index + 1}
        </span>
        <span className="text-muted-foreground flex-1 truncate text-xs">
          {estimated > 0 ? `≈${estimated.toFixed(1)} с` : "пусто"}
        </span>
        {state === "ready" ? <CheckCircle2 className="text-success size-3.5" /> : null}
        {state === "outdated" ? (
          <AlertTriangle className="text-warning size-3.5" aria-label="Результат устарел" />
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100"
          aria-label="Удалить сцену"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Textarea
        value={scene.scriptText}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onSelect}
        placeholder="Текст реплики…"
        rows={3}
        className="resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

function SceneStrip({
  sceneIds,
  scenes,
  activeId,
  onSelect,
  onAdd,
}: {
  sceneIds: string[];
  scenes: Record<string, Scene>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sceneIds.map((sceneId, index) => {
            const scene = scenes[sceneId];
            if (!scene) return null;
            const empty = scene.scriptText.trim().length === 0;

            return (
              <button
                key={sceneId}
                type="button"
                onClick={() => onSelect(sceneId)}
                className={cn(
                  "flex h-20 w-32 shrink-0 flex-col justify-between rounded-lg border p-2 text-left transition-colors",
                  sceneId === activeId
                    ? "border-ring bg-accent/40"
                    : "border-border hover:bg-muted/60",
                )}
              >
                <span className="text-muted-foreground text-xs tabular-nums">{index + 1}</span>
                <span
                  className={cn(
                    "line-clamp-2 text-xs",
                    empty ? "text-destructive" : "text-foreground",
                  )}
                >
                  {empty ? "Нет текста" : scene.scriptText}
                </span>
                <span className="text-muted-foreground text-xs">
                  {scene.durationSec !== null ? `${scene.durationSec.toFixed(1)} с` : "—"}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={onAdd}
            aria-label="Добавить сцену"
            className="border-border hover:bg-muted/60 flex h-20 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors"
          >
            <Plus className="text-muted-foreground size-5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
