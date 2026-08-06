"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Mic, Pause, Play, UserRound } from "lucide-react";
import { primaryImage, type Avatar, type Voice } from "@avatar/contracts";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Карточка говорящего: лицо, имя и голос с прослушиванием.
 *
 * Образец голоса слушают прямо здесь: выбирать голос по названию — это гадание,
 * а ошибка выясняется только после генерации, за которую уже списаны кредиты.
 */
export function SpeakerCard({
  label,
  accent,
  avatars,
  voices,
  avatarId,
  voiceId,
  onAvatarChange,
  onVoiceChange,
}: {
  label: string;
  accent: "host" | "guest";
  avatars: Avatar[];
  voices: Voice[];
  avatarId: string;
  voiceId: string;
  onAvatarChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
}) {
  const avatar = avatars.find((item) => item.id === avatarId) ?? null;
  const voice = voices.find((item) => item.id === voiceId) ?? null;

  const imageUrl = useAssetUrl(avatar ? primaryImage(avatar)?.assetId : null);
  const sampleUrl = useAssetUrl(voice?.sampleAssetId ?? null);

  const notReady = avatar !== null && avatar.status !== "ready";

  return (
    <div
      className={cn(
        "border-border bg-card relative flex h-full flex-col gap-3 rounded-2xl border p-4 transition-shadow",
        "shadow-soft hover:shadow-soft-lg",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            accent === "host" ? "bg-track-avatar" : "bg-track-image",
          )}
        />
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="bg-muted ring-border relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <UserRound className="text-muted-foreground size-7" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <Select
            items={Object.fromEntries(avatars.map((item) => [item.id, item.name]))}
            value={avatarId}
            onValueChange={(value) => value && onAvatarChange(value)}
          >
            <SelectTrigger className="h-9 w-full border-0 bg-transparent px-0 text-base font-semibold shadow-none">
              <SelectValue placeholder="Выберите аватар" />
            </SelectTrigger>
            <SelectContent>
              {avatars.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                  {item.status !== "ready" ? " · готовится" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-1 flex items-center gap-1.5">
            <VoicePreviewButton url={sampleUrl} />
            <Select
              items={Object.fromEntries(voices.map((item) => [item.id, item.name]))}
              value={voiceId}
              onValueChange={(value) => value && onVoiceChange(value)}
            >
              <SelectTrigger className="bg-muted/70 hover:bg-muted h-8 min-w-0 rounded-full border-0 px-3 text-sm shadow-none transition-colors">
                <Mic className="text-muted-foreground size-3.5" />
                <SelectValue placeholder="Голос" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Место под предупреждение зарезервировано всегда: иначе карточки
          собеседников разъезжаются по высоте, стоит одному из них оказаться
          неготовым. */}
      <div className="mt-auto min-h-6">
        {notReady ? (
          <span className="bg-warning/12 text-warning inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
            <AlertTriangle className="size-3" />
            Аватар ещё готовится
          </span>
        ) : null}
      </div>
    </div>
  );
}

function VoicePreviewButton({ url }: { url: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Элемент создаётся под конкретную ссылку и останавливается при её смене:
  // иначе образец продолжал бы играть после выбора другого голоса.
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

  const toggle = () => {
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

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={url === null}
      aria-label={playing ? "Остановить образец" : "Послушать образец голоса"}
      title={url === null ? "Образец недоступен" : "Послушать образец"}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-all",
        url === null
          ? "bg-muted text-muted-foreground/50"
          : "bg-foreground text-background hover:scale-105",
      )}
    >
      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </button>
  );
}
