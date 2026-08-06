"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import { isAvatarUsable, type AspectRatio } from "@avatar/contracts";
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

  const usableAvatars = (avatars.data ?? []).filter((avatar) =>
    isAvatarUsable(avatar, voices.data?.find((v) => v.id === avatar.voiceId)?.status ?? null),
  );

  const selectedAvatar = usableAvatars.find((avatar) => avatar.id === avatarId) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      const project = await dataClient.projects.create({
        title: title.trim(),
        aspectRatio,
        avatarId: avatarId || null,
        voiceId: selectedAvatar?.voiceId ?? null,
      });
      if (description.trim().length > 0) {
        await dataClient.projects.update(project.id, { description: description.trim() });
      }
      return project;
    },
    onSuccess: (project) => router.push(`/projects/${project.id}`),
  });

  const canSubmit = title.trim().length > 0 && avatarId !== "";

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-5">
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

          <div className="grid gap-2">
            <Label htmlFor="project-avatar">Аватар по умолчанию</Label>
            {usableAvatars.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Готовых аватаров нет. Проект без аватара создать можно, но генерировать в нём
                  будет нечем —{" "}
                  <Link href="/avatars" className="underline underline-offset-2">
                    сначала создайте аватар
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Select
                  items={Object.fromEntries(
                    usableAvatars.map((avatar) => [avatar.id, avatar.name]),
                  )}
                  value={avatarId}
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
                  Голос подставится тот, что привязан к аватару. В отдельных сценах его можно
                  будет заменить.
                </p>
              </>
            )}
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
