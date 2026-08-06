"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, Upload, UserRound, Wand2 } from "lucide-react";
import {
  PODCAST_LENGTH_MINUTES,
  PodcastBrief,
  estimateCostSeconds,
  podcastDurationSec,
  primaryImage,
  secondsToMinutesLabel,
  type AspectRatio,
  type Avatar,
  type PodcastLength,
  type Resolution,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useSession } from "@/lib/auth/session-context";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { briefToTurns, buildPodcastDocument } from "@/lib/studio/podcast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SpeakerCard } from "./speaker-card";

const LAYOUT_LABELS: Record<AspectRatio, string> = {
  "16:9": "16:9 — горизонтальное",
  "9:16": "9:16 — вертикальное",
  "1:1": "1:1 — квадратное",
};

export function PodcastForm() {
  const router = useRouter();
  const { user } = useSession();

  const [title, setTitle] = useState("Новый подкаст");
  const [hostAvatarId, setHostAvatarId] = useState("");
  const [hostVoiceId, setHostVoiceId] = useState("");
  const [guestAvatarId, setGuestAvatarId] = useState("");
  const [guestVoiceId, setGuestVoiceId] = useState("");
  const [content, setContent] = useState("");
  const [ownScript, setOwnScript] = useState(false);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [lengthMinutes, setLengthMinutes] = useState<PodcastLength>(1);
  const [sceneInstructions, setSceneInstructions] = useState("");

  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const voices = useQuery({ queryKey: queryKeys.voices, queryFn: () => dataClient.voices.list() });

  const avatarList = avatars.data ?? [];
  const voiceList = (voices.data ?? []).filter((voice) => voice.status === "ready");

  /**
   * Выбор выводится, а не записывается в состояние при загрузке справочников:
   * форма должна открываться заполненной, но подставленное значение не должно
   * перетирать выбор пользователя.
   */
  const host = avatarList.find((item) => item.id === hostAvatarId) ?? avatarList[0] ?? null;
  const guest =
    avatarList.find((item) => item.id === guestAvatarId) ??
    avatarList.find((item) => item.id !== host?.id) ??
    host;

  const effectiveHostVoice = hostVoiceId || host?.voiceId || voiceList[0]?.id || "";
  const effectiveGuestVoice = guestVoiceId || guest?.voiceId || voiceList[0]?.id || "";

  const bothReady = host?.status === "ready" && guest?.status === "ready";

  const brief =
    host && guest && effectiveHostVoice && effectiveGuestVoice && content.trim().length > 0
      ? (PodcastBrief.safeParse({
          title: title.trim() || "Новый подкаст",
          host: {
            role: "host",
            avatarId: host.id,
            voiceId: effectiveHostVoice,
            displayName: host.name,
          },
          guest: {
            role: "guest",
            avatarId: guest.id,
            voiceId: effectiveGuestVoice,
            displayName: guest.name,
          },
          content: content.trim(),
          ownScript,
          resolution,
          aspectRatio,
          lengthMinutes,
          sceneInstructions: sceneInstructions.trim(),
        }).data ?? null)
      : null;

  const turns = brief ? briefToTurns(brief) : [];

  const create = useMutation({
    mutationFn: async () => {
      if (!brief) throw new Error("Заполните содержание подкаста");

      const project = await dataClient.projects.create({
        title: brief.title,
        aspectRatio: brief.aspectRatio,
        avatarId: brief.host.avatarId,
        voiceId: brief.host.voiceId,
      });
      await dataClient.projects.update(project.id, {
        description: `Подкаст: ${brief.host.displayName} и ${brief.guest.displayName}`,
        defaultResolution: brief.resolution,
      });

      // Документ, созданный вместе с проектом, заменяется целиком: реплики уже
      // разложены по дорожкам, склеивать их с пустой заготовкой незачем.
      const document = buildPodcastDocument(project.id, brief, turns);
      const stored = await dataClient.documents.get(project.id);
      await dataClient.documents.save(
        { ...document, revision: stored?.revision ?? 0 },
        stored?.revision ?? 0,
      );

      await dataClient.logs.write({
        level: "info",
        scope: "podcast",
        message: `Создан подкаст из ${turns.length} реплик`,
        actorUserId: user?.id ?? null,
        targetId: project.id,
      });

      return project;
    },
    onSuccess: (project) => router.push(`/projects/${project.id}`),
  });

  const costSeconds = estimateCostSeconds(podcastDurationSec(lengthMinutes), resolution);

  if (avatars.isPending || voices.isPending) {
    return <Skeleton className="h-[70vh] rounded-3xl" />;
  }

  if (avatarList.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Для подкаста нужен хотя бы один аватар.{" "}
          <Link href="/avatars" className="underline underline-offset-2">
            Создать аватар
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="border-border bg-card mx-auto max-w-5xl overflow-hidden rounded-3xl border shadow-soft-lg">
      <CoverHeader title={title} host={host} guest={guest} />

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-2">
          <Label htmlFor="podcast-title">Название выпуска</Label>
          <Input
            id="podcast-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <SpeakerCard
            label="Ведущий"
            avatars={avatarList}
            voices={voiceList}
            avatarId={host?.id ?? ""}
            voiceId={effectiveHostVoice}
            onAvatarChange={setHostAvatarId}
            onVoiceChange={setHostVoiceId}
          />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Поменять ведущего и гостя местами"
            className="mx-auto"
            onClick={() => {
              const previousHost = host?.id ?? "";
              const previousHostVoice = effectiveHostVoice;
              setHostAvatarId(guest?.id ?? "");
              setHostVoiceId(effectiveGuestVoice);
              setGuestAvatarId(previousHost);
              setGuestVoiceId(previousHostVoice);
            }}
          >
            <ArrowLeftRight className="size-4" />
          </Button>

          <SpeakerCard
            label="Гость"
            avatars={avatarList}
            voices={voiceList}
            avatarId={guest?.id ?? ""}
            voiceId={effectiveGuestVoice}
            onAvatarChange={setGuestAvatarId}
            onVoiceChange={setGuestVoiceId}
          />
        </div>

        {host?.id === guest?.id ? (
          <p className="text-muted-foreground text-sm">
            Ведущий и гость — один и тот же аватар. Разговор соберётся, но собеседников будет
            различать только голос: выберите разные голоса или создайте второго аватара.
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="podcast-content">Содержание подкаста</Label>

          <div className="border-border focus-within:border-ring rounded-2xl border transition-colors">
            <Textarea
              id="podcast-content"
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                ownScript
                  ? "Реплики построчно. Говорящего можно пометить: «Ведущий: …», «Гость: …» — иначе реплики чередуются по абзацам."
                  : "Тема выпуска: о чём говорить, какие вопросы разобрать, для кого этот выпуск."
              }
              className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />

            <div className="border-border flex flex-wrap items-center gap-3 border-t px-3 py-2">
              <label>
                <span
                  className="border-border hover:bg-muted flex size-8 cursor-pointer items-center justify-center rounded-full border"
                  title="Загрузить документ (TXT, Markdown)"
                >
                  <Upload className="size-4" />
                </span>
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    // Только текстовые форматы: разбор docx и pdf — работа
                    // сервера, и делать вид, что он происходит здесь, нельзя.
                    setContent(await file.text());
                    event.target.value = "";
                  }}
                />
              </label>

              <span className="bg-border h-5 w-px" />

              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={ownScript}
                  onChange={(event) => setOwnScript(event.target.checked)}
                  className="accent-primary size-4"
                />
                Использовать свой сценарий
              </label>

              <span className="text-muted-foreground ml-auto text-xs">
                {content.trim().length > 0 ? `Реплик: ${turns.length}` : "TXT и Markdown"}
              </span>
            </div>
          </div>

          {!ownScript ? (
            <Alert>
              <Wand2 className="size-4" />
              <AlertDescription>
                Из темы строится структура разговора: кто говорит, в каком порядке и о чём. Сам
                текст реплик пишет языковая модель — она относится к серверной части, поэтому
                сейчас в сценах появятся задания вроде «вопрос по теме», а не готовые фразы.
                Включите «свой сценарий», если текст уже написан.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label>Качество</Label>
          <div className="bg-muted/60 grid grid-cols-2 gap-1 rounded-full p-1">
            {(
              [
                { value: "720p", title: "Стандартное" },
                { value: "1080p", title: "Высокое" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setResolution(option.value)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
                  resolution === option.value
                    ? "bg-card font-medium shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.title}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    resolution === option.value
                      ? "bg-gradient-accent text-white"
                      : "bg-muted-foreground/15",
                  )}
                >
                  {option.value}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="podcast-layout">Формат кадра</Label>
            <Select
              items={LAYOUT_LABELS}
              value={aspectRatio}
              onValueChange={(value) => setAspectRatio((value as AspectRatio) ?? "16:9")}
            >
              <SelectTrigger id="podcast-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LAYOUT_LABELS) as AspectRatio[]).map((ratio) => (
                  <SelectItem key={ratio} value={ratio}>
                    {LAYOUT_LABELS[ratio]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="podcast-length">Длительность</Label>
            <Select
              items={Object.fromEntries(
                PODCAST_LENGTH_MINUTES.map((minutes) => [String(minutes), `${minutes} мин`]),
              )}
              value={String(lengthMinutes)}
              onValueChange={(value) => setLengthMinutes(Number(value ?? 1) as PodcastLength)}
            >
              <SelectTrigger id="podcast-length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PODCAST_LENGTH_MINUTES.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} мин
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="podcast-instructions">
            Указания к кадру <span className="text-muted-foreground">(необязательно)</span>
          </Label>
          <Textarea
            id="podcast-instructions"
            rows={3}
            value={sceneInstructions}
            onChange={(event) => setSceneInstructions(event.target.value)}
            placeholder="Ракурсы, обстановка студии, как должны выглядеть собеседники"
          />
        </div>

        {!bothReady ? (
          <p className="text-warning text-sm">
            Один из аватаров ещё готовится. Подкаст создать можно, но запустить генерацию
            получится только когда оба будут готовы.
          </p>
        ) : null}
      </div>

      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-3 border-t px-5 py-4 sm:px-6">
        <div className="text-muted-foreground text-sm">
          {content.trim().length === 0
            ? "Добавьте содержание, чтобы создать подкаст"
            : `Будет создано реплик: ${turns.length} · оценка ${secondsToMinutesLabel(costSeconds)} мин кредитов`}
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/projects" />}>
            Отмена
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={brief === null || create.isPending}
            className="bg-gradient-accent text-white hover:opacity-90"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Создать подкаст
          </Button>
        </div>
      </div>

      {create.error ? (
        <p className="text-destructive px-5 pb-4 text-sm sm:px-6">{create.error.message}</p>
      ) : null}
    </div>
  );
}

/**
 * Шапка с обложкой. Лица собеседников вынесены на неё, потому что подкаст — это
 * прежде всего про то, кто разговаривает.
 */
function CoverHeader({
  title,
  host,
  guest,
}: {
  title: string;
  host: Avatar | null;
  guest: Avatar | null;
}) {
  const hostImage = useAssetUrl(host ? primaryImage(host)?.assetId : null);
  const guestImage = useAssetUrl(guest ? primaryImage(guest)?.assetId : null);

  return (
    <div className="bg-gradient-accent relative h-44 sm:h-56">
      <div className="absolute inset-0 bg-black/10" />

      <div className="absolute right-5 bottom-5 flex sm:right-6">
        <Face url={hostImage} />
        <Face url={guestImage} className="-ml-5" />
      </div>

      <h2 className="absolute bottom-5 left-5 max-w-[55%] truncate text-2xl font-semibold text-white sm:left-6 sm:text-3xl">
        {title || "Новый подкаст"}
      </h2>
    </div>
  );
}

function Face({ url, className }: { url: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted ring-card flex size-16 items-center justify-center overflow-hidden rounded-full ring-3 sm:size-20",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <UserRound className="text-muted-foreground size-6" />
      )}
    </span>
  );
}
