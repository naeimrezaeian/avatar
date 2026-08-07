"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import { isAvatarUsable, type AspectRatio, type Avatar, type Voice } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
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

/**
 * Почему готовый на вид аватар нельзя выбрать.
 *
 * Аватар годится для проекта, только если готов он сам и готов привязанный к
 * нему голос: генерация берёт из него и кадр, и речь. Раньше на все случаи
 * писалось «готовых аватаров нет» — и это выглядело неправдой рядом со списком
 * аватаров, где один помечен готовым.
 */
function unusableReason(avatar: Avatar, voice: Voice | null): string {
  if (avatar.status === "error") return "не удалось подготовить";
  if (avatar.status !== "ready") return "ещё готовится";
  if (avatar.voiceId === null) return "не привязан голос";
  if (!voice) return "привязанный голос удалён";
  if (voice.status === "error") return `голос «${voice.name}» не удалось подготовить`;
  return `голос «${voice.name}» ещё готовится`;
}

export function NewProjectForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [avatarId, setAvatarId] = useState("");

  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const voices = useQuery({ queryKey: queryKeys.voices, queryFn: () => dataClient.voices.list() });

  const voiceOf = (avatar: Avatar): Voice | null =>
    voices.data?.find((item) => item.id === avatar.voiceId) ?? null;

  // Пока не пришли оба списка, судить о пригодности нельзя: голоса приходят
  // отдельным запросом, и без них любой аватар выглядел бы негодным.
  const loading = avatars.isPending || voices.isPending;

  const liveAvatars = (avatars.data ?? []).filter(
    (avatar) => avatar.deletedAt === null && avatar.archivedAt === null,
  );
  const usableAvatars = liveAvatars.filter((avatar) =>
    isAvatarUsable(avatar, voiceOf(avatar)?.status ?? null),
  );
  const blockedAvatars = liveAvatars.filter((avatar) => !usableAvatars.includes(avatar));

  /**
   * Единственный пригодный аватар выбирается сам.
   *
   * Значение выводится, а не записывается эффектом: список приходит запросом, и
   * копия в состоянии разъезжалась бы с ним, стоит аватару догото́виться уже
   * после открытия формы.
   */
  const effectiveAvatarId = avatarId || (usableAvatars[0]?.id ?? "");
  const selectedAvatar =
    usableAvatars.find((avatar) => avatar.id === effectiveAvatarId) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      const project = await dataClient.projects.create({
        title: title.trim(),
        aspectRatio,
        avatarId: selectedAvatar?.id ?? null,
        voiceId: selectedAvatar?.voiceId ?? null,
      });
      if (description.trim().length > 0) {
        await dataClient.projects.update(project.id, { description: description.trim() });
      }
      return project;
    },
    onSuccess: (project) => router.push(`/projects/${project.id}`),
  });

  // Аватар необязателен: об этом прямо написано под полем, и требовать его
  // кнопкой значило бы спорить с собственной подсказкой. Проект без аватара —
  // это заготовка со сценарием, аватар назначается позже.
  const canSubmit = title.trim().length > 0;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-2">
            <Label htmlFor="project-avatar">Аватар</Label>
            {loading ? (
              <p className="text-muted-foreground text-sm">Загрузка аватаров…</p>
            ) : usableAvatars.length === 0 ? (
              <Alert>
                <AlertDescription>
                  {blockedAvatars.length === 0 ? (
                    <>
                      Готовых аватаров нет. Проект создать можно, но генерировать в нём будет
                      нечем —{" "}
                      <Link href="/avatars" className="underline underline-offset-2">
                        сначала создайте аватар
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      Ни один аватар пока нельзя выбрать:
                      <ul className="mt-1 list-disc pl-5">
                        {blockedAvatars.map((avatar) => (
                          <li key={avatar.id}>
                            «{avatar.name}» — {unusableReason(avatar, voiceOf(avatar))}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1">
                        Проект создать можно и сейчас — аватар назначается позже, на{" "}
                        <Link href="/avatars" className="underline underline-offset-2">
                          странице аватаров
                        </Link>
                        .
                      </p>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Select
                  items={Object.fromEntries(
                    usableAvatars.map((avatar) => [avatar.id, avatar.name]),
                  )}
                  value={effectiveAvatarId}
                  onValueChange={(value) => setAvatarId(value ?? "")}
                >
                  <SelectTrigger id="project-avatar">
                    <SelectValue placeholder="Выберите аватар" />
                  </SelectTrigger>
                  <SelectContent>
                    {usableAvatars.map((avatar) => (
                      <SelectItem key={avatar.id} value={avatar.id}>
                        {avatar.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Аватар выбирается первым: он задаёт и лицо, и голос — озвучка пойдёт тем,
                  что к нему привязан. В отдельных сценах голос можно будет заменить.
                </p>
              </>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-title">Название проекта</Label>
            <Input
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например: приветственный ролик"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-description">Описание</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Необязательно: для чего этот ролик"
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label>Соотношение сторон</Label>
            <AspectRatioPicker value={aspectRatio} onChange={setAspectRatio} />
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                Кадр выбирается один раз: композиция сцен привязана к нему, и сменить его потом
                без пересборки раскладки нельзя.
              </AlertDescription>
            </Alert>
          </div>

          {create.error ? (
            <p className="text-destructive text-sm">{create.error.message}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" nativeButton={false} role="link" render={<Link href="/projects" />}>
          Отмена
        </Button>
        <Button
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Создать проект
        </Button>
      </div>
    </div>
  );
}
