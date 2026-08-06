"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, UserRound } from "lucide-react";
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
 * Образец голоса можно послушать прямо здесь: выбирать голос по названию — это
 * гадание, а ошибка выяснится только после генерации, за которую уже списаны
 * кредиты.
 */
export function SpeakerCard({
  label,
  avatars,
  voices,
  avatarId,
  voiceId,
  onAvatarChange,
  onVoiceChange,
}: {
  label: string;
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

  return (
    <div className="border-border bg-card rounded-2xl border p-3 shadow-soft">
      <p className="text-muted-foreground mb-2 text-sm font-medium">{label}</p>

      <div className="flex items-center gap-3">
        <span className="bg-muted ring-background flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <UserRound className="text-muted-foreground size-6" />
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <Select
            items={Object.fromEntries(avatars.map((item) => [item.id, item.name]))}
            value={avatarId}
            onValueChange={(value) => value && onAvatarChange(value)}
          >
            <SelectTrigger className="h-9 border-0 bg-transparent px-0 text-base font-medium shadow-none">
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

          <div className="flex items-center gap-1.5">
            <VoicePreviewButton url={sampleUrl} />
            <Select
              items={Object.fromEntries(voices.map((item) => [item.id, item.name]))}
              value={voiceId}
              onValueChange={(value) => value && onVoiceChange(value)}
            >
              <SelectTrigger className="bg-muted/60 h-7 rounded-full border-0 px-3 text-sm shadow-none">
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

      {avatar !== null && avatar.status !== "ready" ? (
        <p className="text-warning mt-2 text-xs">
          Аватар ещё готовится — запустить генерацию можно будет после того, как он будет готов.
        </p>
      ) : null}
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
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={url === null}
      aria-label={playing ? "Остановить образец" : "Послушать образец голоса"}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
        url === null
          ? "bg-muted text-muted-foreground/50"
          : "bg-foreground text-background hover:opacity-85",
      )}
    >
      {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
    </button>
  );
}
