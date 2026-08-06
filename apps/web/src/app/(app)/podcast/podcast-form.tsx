"use client";

import { useState, type ReactNode } from "react";
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
import { StepSection } from "@/components/podcast/step-section";
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
        format: "podcast",
        participantAvatarIds: [brief.host.avatarId, brief.guest.avatarId],
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
    onSuccess: (project) => router.push(`/podcast/${project.id}`),
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
      <CoverHeader
        title={title}
        host={host}
        guest={guest}
        aspectRatio={aspectRatio}
        lengthMinutes={lengthMinutes}
        resolution={resolution}
      />

      <div className="space-y-8 p-5 sm:p-8">
        <StepSection
          step={1}
          title="Участники"
          hint="Кто ведёт разговор и кто отвечает. У каждого свой голос."
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:max-w-md">
              <Label htmlFor="podcast-title">Название выпуска</Label>
              <Input
                id="podcast-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
              <SpeakerCard
                label="Ведущий"
                accent="host"
                avatars={avatarList}
                voices={voiceList}
                avatarId={host?.id ?? ""}
                voiceId={effectiveHostVoice}
                onAvatarChange={setHostAvatarId}
                onVoiceChange={setHostVoiceId}
              />

              <div className="flex items-center justify-center">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Поменять ведущего и гостя местами"
                  title="Поменять местами"
                  className="rounded-full"
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
              </div>

              <SpeakerCard
                label="Гость"
                accent="guest"
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
          </div>
        </StepSection>

        <div className="border-border border-t" />

        <StepSection
          step={2}
          title="Содержание"
          hint="Готовый сценарий или тема, из которой построится структура разговора."
        >
          <div className="space-y-3">
            <div className="border-border focus-within:border-ring focus-within:ring-ring/20 overflow-hidden rounded-2xl border transition-all focus-within:ring-3">
              <Textarea
                id="podcast-content"
                aria-label="Содержание подкаста"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={
                  ownScript
                    ? "Реплики построчно. Говорящего можно пометить: «Ведущий: …», «Гость: …» — иначе реплики чередуются по абзацам."
                    : "Тема выпуска: о чём говорить, какие вопросы разобрать, для кого этот выпуск."
                }
                className="min-h-44 resize-none rounded-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
              />

              <div className="border-border bg-muted/30 flex flex-wrap items-center gap-3 border-t px-3 py-2">
                <label>
                  <span
                    className="border-border bg-card hover:bg-muted flex size-9 cursor-pointer items-center justify-center rounded-full border transition-colors"
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

                <span className="bg-border h-6 w-px" />

                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={ownScript}
                    onChange={(event) => setOwnScript(event.target.checked)}
                    className="accent-primary size-4"
                  />
                  Свой сценарий
                </label>

                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {content.trim().length > 0
                    ? `${content.trim().length} знаков · реплик: ${turns.length}`
                    : "TXT и Markdown"}
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
        </StepSection>

        <div className="border-border border-t" />

        <StepSection
          step={3}
          title="Как снимать"
          hint="Качество, кадр и длительность влияют на стоимость генерации."
        >
          <div className="space-y-5">
            <div className="grid gap-2">
              <Label>Качество</Label>
              <div className="border-border bg-muted/50 grid grid-cols-2 gap-1 rounded-full border p-1">
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
                    aria-pressed={resolution === option.value}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm transition-all",
                      resolution === option.value
                        ? "bg-card font-medium shadow-soft"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.title}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
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
                  <SelectTrigger id="podcast-layout" className="w-full">
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
                  <SelectTrigger id="podcast-length" className="w-full">
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
          </div>
        </StepSection>
      </div>

      <div className="border-border bg-card/85 sticky bottom-0 flex flex-wrap items-center gap-3 border-t px-5 py-4 backdrop-blur-md sm:px-8">
        <div className="min-w-0 flex-1">
          {content.trim().length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Добавьте содержание, чтобы создать подкаст
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <SummaryChip>Реплик: {turns.length}</SummaryChip>
              <SummaryChip>{secondsToMinutesLabel(costSeconds)} мин кредитов</SummaryChip>
              {!bothReady ? (
                <SummaryChip tone="warning">Один из аватаров ещё готовится</SummaryChip>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            nativeButton={false}
            role="link"
            render={<Link href="/podcast" />}
          >
            Отмена
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={brief === null || create.isPending}
            className="bg-gradient-accent text-white shadow-soft hover:opacity-90"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Создать подкаст
          </Button>
        </div>
      </div>

      {create.error ? (
        <p className="text-destructive px-5 pb-4 text-sm sm:px-8">{create.error.message}</p>
      ) : null}
    </div>
  );
}

function SummaryChip({ children, tone }: { children: ReactNode; tone?: "warning" }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        tone === "warning" ? "bg-warning/12 text-warning" : "border-border bg-card border",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Шапка выпуска. Лица собеседников и текущие настройки вынесены сюда: подкаст
 * узнают по тому, кто разговаривает, а настройки на обложке избавляют от
 * прокрутки вниз ради проверки.
 */
function CoverHeader({
  title,
  host,
  guest,
  aspectRatio,
  lengthMinutes,
  resolution,
}: {
  title: string;
  host: Avatar | null;
  guest: Avatar | null;
  aspectRatio: AspectRatio;
  lengthMinutes: PodcastLength;
  resolution: Resolution;
}) {
  const hostImage = useAssetUrl(host ? primaryImage(host)?.assetId : null);
  const guestImage = useAssetUrl(guest ? primaryImage(guest)?.assetId : null);

  return (
    <div className="relative h-56 overflow-hidden sm:h-60">
      <div className="bg-gradient-accent absolute inset-0" />
      {/* Мягкие световые пятна дают глубину: ровная заливка выглядит плоской
          заглушкой, а не обложкой. */}
      <div className="absolute -top-20 -left-16 size-72 rounded-full bg-white/25 blur-3xl" />
      <div className="absolute -right-16 -bottom-24 size-80 rounded-full bg-black/20 blur-3xl" />
      <div className="absolute inset-0 bg-linear-to-t from-black/30 via-transparent to-transparent" />

      <div className="absolute right-5 bottom-6 flex sm:right-8">
        <Face url={hostImage} />
        <Face url={guestImage} className="-ml-6" />
      </div>

      <div className="absolute bottom-6 left-5 max-w-[58%] sm:left-8">
        <p className="text-xs font-medium tracking-widest text-white/75 uppercase">Видеоподкаст</p>
        <h2 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">
          {title || "Новый подкаст"}
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <CoverChip>{aspectRatio}</CoverChip>
          <CoverChip>{lengthMinutes} мин</CoverChip>
          <CoverChip>{resolution}</CoverChip>
        </div>
      </div>
    </div>
  );
}

function CoverChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
      {children}
    </span>
  );
}

function Face({ url, className }: { url: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "bg-muted flex size-20 items-center justify-center overflow-hidden rounded-full ring-4 ring-white/80 sm:size-24",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <UserRound className="text-muted-foreground size-8" />
      )}
    </span>
  );
}
