"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AudioLines, Loader2, Pause, Play } from "lucide-react";
import type { Scene } from "@avatar/contracts";
import { dataClient } from "@/lib/data";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { cn } from "@/lib/utils";

/**
 * Озвучка реплики прямо в строке сценария.
 *
 * Одна кнопка на три состояния, а не три разных элемента: пока озвучки нет, она
 * её создаёт; пока идёт синтез — показывает работу; когда файл готов —
 * проигрывает. Отдельный проигрыватель в центре экрана для этого не нужен: он
 * относился к выбранной сцене, а слушать хочется любую, не выбирая её.
 */
export function SceneVoiceButton({
  projectId,
  scene,
  busy,
}: {
  projectId: string;
  scene: Scene;
  /** У сцены уже есть активная задача синтеза. */
  busy: boolean;
}) {
  const url = useAssetUrl(scene.voiceoverAssetId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const generate = useMutation({
    mutationFn: () => dataClient.generation.startVoiceover({ projectId, sceneId: scene.id }),
  });

  // Элемент создаётся под конкретную ссылку и останавливается при её смене:
  // после перегенерации иначе продолжал бы играть прежний файл.
  useEffect(() => {
    const audio = url ? new Audio(url) : null;
    audioRef.current = audio;
    if (!audio) return;

    const onEnded = () => setPlaying(false);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  const working = busy || generate.isPending;
  const ready = scene.voiceoverAssetId !== null;
  const empty = scene.scriptText.trim().length === 0;

  const onClick = () => {
    if (working) return;

    if (!ready) {
      generate.mutate();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio.currentTime = 0;
    void audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  const label = working
    ? "Идёт синтез озвучки"
    : ready
      ? playing
        ? "Остановить озвучку"
        : "Прослушать озвучку"
      : "Озвучить реплику";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty || working}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
        empty
          ? "bg-muted text-muted-foreground/50"
          : ready
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      {working ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : ready ? (
        playing ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )
      ) : (
        <AudioLines className="size-3.5" />
      )}
    </button>
  );
}
