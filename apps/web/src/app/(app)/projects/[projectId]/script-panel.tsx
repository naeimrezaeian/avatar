"use client";

import { AlertTriangle, CheckCircle2, ListOrdered, Plus, Trash2 } from "lucide-react";
import {
  estimateSpeechDurationSec,
  sceneGenerationState,
  videoInputHash,
  voiceoverInputHash,
  type ProjectDocument,
  type Scene,
} from "@avatar/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Сценарий проекта: строка сценария и есть сцена.
 *
 * Раньше сцены редактировались в двух местах — списком в редакторе и текстом в
 * студии, — и правка в одном месте выглядела пропажей в другом. Панель теперь
 * одна, а на шкале внизу видно, как эти же сцены разложены во времени.
 */
export function ScriptPanel({
  document,
  activeSceneId,
  onSelect,
  onChangeText,
  onRemove,
  onAdd,
}: {
  document: ProjectDocument;
  activeSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onChangeText: (sceneId: string, text: string) => void;
  onRemove: (sceneId: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card className="h-fit xl:max-h-[calc(100dvh-11rem)] xl:overflow-y-auto">
      <CardContent className="space-y-2 pt-5">
        <div className="mb-1 flex items-center gap-2">
          <ListOrdered className="text-muted-foreground size-4" />
          <p className="font-medium">Сценарий</p>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {document.sceneOrder.length}
          </span>
        </div>

        {document.sceneOrder.map((sceneId, index) => {
          const scene = document.scenes[sceneId];
          if (!scene) return null;
          return (
            <ScriptLine
              key={sceneId}
              scene={scene}
              index={index}
              active={sceneId === activeSceneId}
              onSelect={() => onSelect(sceneId)}
              onChange={(text) => onChangeText(sceneId, text)}
              onRemove={() => onRemove(sceneId)}
            />
          );
        })}

        <Button variant="ghost" className="w-full justify-start" onClick={onAdd}>
          <Plus className="size-4" />
          Добавить сцену
        </Button>

        <p className="text-muted-foreground pt-1 text-xs">
          Вставьте текст с пустыми строками между абзацами — он сам разложится по сценам.
        </p>
      </CardContent>
    </Card>
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
        active ? "border-ring bg-accent/40" : "border-transparent hover:bg-muted",
      )}
      onFocusCapture={onSelect}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
          {index + 1}
        </span>
        <span className="text-muted-foreground flex-1 truncate text-xs">
          {scene.durationSec !== null
            ? `${scene.durationSec.toFixed(1)} с`
            : estimated > 0
              ? `≈${estimated.toFixed(1)} с`
              : "пусто"}
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
