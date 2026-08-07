"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ListOrdered,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  estimateSpeechDurationSec,
  sceneGenerationState,
  videoInputHash,
  voiceoverInputHash,
  type ProjectDocument,
  type Scene,
} from "@avatar/contracts";
import { SceneVoiceButton } from "./scene-voice-button";
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
  projectId,
  document,
  activeSceneId,
  busySceneIds,
  expanded,
  onToggleExpanded,
  onSelect,
  onChangeText,
  onChangeTitle,
  onRemove,
  onAdd,
}: {
  projectId: string;
  document: ProjectDocument;
  activeSceneId: string | null;
  /** Сцены с запущенным синтезом озвучки. */
  busySceneIds: Set<string>;
  /** Панель занимает всю ширину рабочей области. */
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: (sceneId: string) => void;
  onChangeText: (sceneId: string, text: string) => void;
  onChangeTitle: (sceneId: string, title: string) => void;
  onRemove: (sceneId: string) => void;
  onAdd: () => void;
}) {
  return (
    // На широком экране карточка занимает всю высоту ряда (её позиционирует
    // родитель), поэтому длина сценария меняет не высоту колонки, а длину
    // прокрутки внутри списка.
    <Card
      className={cn(
        "flex flex-col overflow-hidden",
        !expanded && "xl:absolute xl:inset-0",
      )}
    >
      <CardContent className="flex min-h-0 flex-1 flex-col pt-5">
        <div className="mb-2 flex shrink-0 items-center gap-2">
          <ListOrdered className="text-muted-foreground size-4" />
          <p className="font-medium">Сценарий</p>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {document.sceneOrder.length}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleExpanded}
            aria-pressed={expanded}
            aria-label={expanded ? "Свернуть сценарий" : "Развернуть сценарий на всю ширину"}
            title={expanded ? "Свернуть сценарий" : "Развернуть сценарий на всю ширину"}
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>

        <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
          {document.sceneOrder.map((sceneId, index) => {
            const scene = document.scenes[sceneId];
            if (!scene) return null;
            return (
              <ScriptLine
                key={sceneId}
                projectId={projectId}
                scene={scene}
                index={index}
                active={sceneId === activeSceneId}
                busy={busySceneIds.has(sceneId)}
                expanded={expanded}
                onSelect={() => onSelect(sceneId)}
                onChange={(text) => onChangeText(sceneId, text)}
                onChangeTitle={(title) => onChangeTitle(sceneId, title)}
                onRemove={() => onRemove(sceneId)}
              />
            );
          })}

          {/* Кнопка идёт сразу за последней сценой, а не прижата к низу
              карточки: добавляют сцену в конец списка, туда и тянется рука. */}
          <Button variant="ghost" className="w-full justify-start" onClick={onAdd}>
            <Plus className="size-4" />
            Добавить сцену
          </Button>

          <p className="text-muted-foreground pt-1 text-xs">
            Вставьте текст с пустыми строками между абзацами — он сам разложится по сценам.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScriptLine({
  projectId,
  scene,
  index,
  active,
  busy,
  expanded,
  onSelect,
  onChange,
  onChangeTitle,
  onRemove,
}: {
  projectId: string;
  scene: Scene;
  index: number;
  active: boolean;
  busy: boolean;
  expanded: boolean;
  onSelect: () => void;
  onChange: (text: string) => void;
  onChangeTitle: (title: string) => void;
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
      {/* Название сцены стоит над её текстом: подпись нужна там же, где
          содержимое, а не в отдельном блоке на другом краю экрана. */}
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
          {index + 1}
        </span>
        <input
          value={scene.title}
          onChange={(event) => onChangeTitle(event.target.value)}
          onFocus={onSelect}
          placeholder="Название сцены"
          aria-label={`Название сцены ${index + 1}`}
          className="placeholder:text-muted-foreground/70 min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-sm font-medium outline-none"
        />
        {state === "ready" ? <CheckCircle2 className="text-success size-3.5 shrink-0" /> : null}
        {state === "outdated" ? (
          <AlertTriangle
            className="text-warning size-3.5 shrink-0"
            aria-label="Результат устарел"
          />
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-0 group-hover:opacity-100"
          aria-label="Удалить сцену"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <p className="text-muted-foreground mb-1 pl-6 text-xs">
        {scene.durationSec !== null
          ? `${scene.durationSec.toFixed(1)} с`
          : estimated > 0
            ? `≈${estimated.toFixed(1)} с`
            : "пусто"}
      </p>

      <div className="flex items-start gap-2">
        <Textarea
          value={scene.scriptText}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onSelect}
          placeholder="Текст реплики…"
          // В развёрнутой панели поле выше: там текст и пишут, а не просматривают.
          rows={expanded ? 7 : 3}
          className="min-w-0 flex-1 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
        <SceneVoiceButton projectId={projectId} scene={scene} busy={busy} />
      </div>
    </div>
  );
}
