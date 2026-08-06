"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Info, Loader2, Mic, Upload, Wand2 } from "lucide-react";
import {
  PODCAST_LENGTH_MINUTES,
  PodcastBrief,
  estimateCostSeconds,
  isAvatarUsable,
  podcastDurationSec,
  secondsToMinutesLabel,
  type AspectRatio,
  type Avatar,
  type PodcastLength,
  type Resolution,
} from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useSession } from "@/lib/auth/session-context";
import { briefToTurns, buildPodcastDocument } from "@/lib/studio/podcast";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { AspectRatioPicker } from "@/components/aspect-ratio-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { primaryImage } from "@avatar/contracts";

export function PodcastForm() {
  const router = useRouter();
  const { user } = useSession();

  const [title, setTitle] = useState("Новый подкаст");
  const [hostId, setHostId] = useState("");
  const [guestId, setGuestId] = useState("");
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

  const usable = (avatars.data ?? []).filter((avatar) =>
    isAvatarUsable(avatar, voices.data?.find((v) => v.id === avatar.voiceId)?.status ?? null),
  );

  const host = usable.find((item) => item.id === hostId) ?? null;
  const guest = usable.find((item) => item.id === guestId) ?? null;

  const brief = ((): PodcastBrief | null => {
    if (!host?.voiceId || !guest?.voiceId || content.trim().length === 0) return null;
    const parsed = PodcastBrief.safeParse({
      title: title.trim(),
      host: {
        role: "host",
        avatarId: host.id,
        voiceId: host.voiceId,
        displayName: host.name,
      },
      guest: {
        role: "guest",
        avatarId: guest.id,
        voiceId: guest.voiceId,
        displayName: guest.name,
      },
      content: content.trim(),
      ownScript,
      resolution,
      aspectRatio,
      lengthMinutes,
      sceneInstructions: sceneInstructions.trim(),
    });
    return parsed.success ? parsed.data : null;
  })();

  const turns = brief ? briefToTurns(brief) : [];

  const create = useMutation({
    mutationFn: async () => {
      if (!brief) throw new Error("Заполните форму");

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
      // разложены по дорожкам, и склеивать их с пустой заготовкой незачем.
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

  const durationSec = podcastDurationSec(lengthMinutes);
  const costSeconds = estimateCostSeconds(durationSec, resolution);

  if (usable.length < 2) {
    return (
      <Alert>
        <AlertDescription>
          Для подкаста нужны два готовых аватара — по одному на ведущего и гостя. Сейчас готово{" "}
          {usable.length}.{" "}
          <Link href="/avatars" className="underline underline-offset-2">
            Создать аватар
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-2">
            <Label htmlFor="podcast-title">Название выпуска</Label>
            <Input
              id="podcast-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <SpeakerPicker
              label="Ведущий"
              value={hostId}
              options={usable.filter((item) => item.id !== guestId)}
              onChange={setHostId}
            />

            <Button
              variant="ghost"
              size="icon"
              aria-label="Поменять ролями"
              className="mb-1 hidden sm:inline-flex"
              onClick={() => {
                const previous = hostId;
                setHostId(guestId);
                setGuestId(previous);
              }}
            >
              <ArrowLeftRight className="size-4" />
            </Button>

            <SpeakerPicker
              label="Гость"
              value={guestId}
              options={usable.filter((item) => item.id !== hostId)}
              onChange={setGuestId}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="podcast-content">Содержание подкаста</Label>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ownScript}
                onChange={(event) => setOwnScript(event.target.checked)}
                className="accent-primary size-4"
              />
              Использовать свой сценарий
            </label>
          </div>

          <Textarea
            id="podcast-content"
            rows={8}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              ownScript
                ? "Реплики построчно. Можно помечать говорящего: «Ведущий: ...», «Гость: ...» — иначе реплики чередуются по порядку."
                : "Тема выпуска: о чём говорить, какие вопросы разобрать, для кого этот выпуск."
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="border-border hover:bg-muted inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Upload className="size-4" />
                Загрузить документ
              </span>
              <input
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  // Читаем только текстовые форматы: разбор docx и pdf — работа
                  // сервера, и притворяться, что он умеет это здесь, нельзя.
                  setContent(await file.text());
                  event.target.value = "";
                }}
              />
            </label>
            <span className="text-muted-foreground text-xs">Пока поддерживаются TXT и Markdown</span>
          </div>

          {!ownScript ? (
            <Alert>
              <Wand2 className="size-4" />
              <AlertDescription>
                Из темы строится структура разговора: кто говорит, в каком порядке и о чём. Текст
                реплик придумывает языковая модель — её подключение относится к серверной части,
                поэтому сейчас в сценах появятся задания вида «вопрос по теме», а не готовые
                фразы. Включите «свой сценарий», если текст уже написан.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-2">
            <Label>Качество</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["480p", "720p", "1080p"] as Resolution[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setResolution(option)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm transition-colors",
                    option === resolution
                      ? "border-ring bg-accent/40 font-medium"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Формат кадра</Label>
            <AspectRatioPicker value={aspectRatio} onChange={setAspectRatio} />
          </div>

          <div className="grid gap-2 sm:max-w-xs">
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

          <div className="grid gap-2">
            <Label htmlFor="podcast-instructions">Указания к постановке кадра</Label>
            <Textarea
              id="podcast-instructions"
              rows={2}
              value={sceneInstructions}
              onChange={(event) => setSceneInstructions(event.target.value)}
              placeholder="Ракурсы, обстановка студии, как должны выглядеть собеседники"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">Будет создано реплик: {turns.length || "—"}</span>
            <span className="text-muted-foreground text-sm tabular-nums">
              Оценка стоимости: {secondsToMinutesLabel(costSeconds)} мин кредитов
            </span>
          </div>

          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              Получится обычный проект: реплики станут сценами, разложенными по дорожкам. Дальше
              их можно править, переставлять и генерировать поштучно — как в любом проекте.
            </AlertDescription>
          </Alert>

          {create.error ? (
            <p className="text-destructive text-sm">{create.error.message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" nativeButton={false} render={<Link href="/projects" />}>
              Отмена
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={brief === null || create.isPending}
              className="bg-gradient-accent text-white hover:opacity-90"
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
              Создать подкаст
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SpeakerPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Avatar[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((item) => item.id === value) ?? null;
  const imageUrl = useAssetUrl(selected ? primaryImage(selected)?.assetId : null);

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="border-border flex items-center gap-3 rounded-xl border p-2">
        <span className="bg-muted size-12 shrink-0 overflow-hidden rounded-full">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : null}
        </span>
        <Select
          items={Object.fromEntries(options.map((option) => [option.id, option.name]))}
          value={value}
          onValueChange={(next) => onChange(next ?? "")}
        >
          <SelectTrigger className="border-0 shadow-none">
            <SelectValue placeholder="Выберите аватар" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
