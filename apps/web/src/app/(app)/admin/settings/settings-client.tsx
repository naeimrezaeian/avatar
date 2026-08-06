"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Resolution, SystemSettings } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useSession } from "@/lib/auth/session-context";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export function AdminSettingsClient() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [draft, setDraft] = useState<Partial<SystemSettings>>({});
  const [saved, setSaved] = useState(false);

  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => dataClient.settings.get(),
  });

  const save = useMutation({
    mutationFn: async () => {
      const next = await dataClient.settings.update(draft);
      await dataClient.logs.write({
        level: "info",
        scope: "admin",
        message: "Изменены системные настройки",
        actorUserId: user?.id ?? null,
      });
      return next;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      setDraft({});
      setSaved(true);
    },
  });

  if (settings.isPending || !settings.data) return <Skeleton className="h-96 rounded-2xl" />;

  const value = { ...settings.data, ...draft };
  const dirty = Object.keys(draft).length > 0;

  const patch = (change: Partial<SystemSettings>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...change }));
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="font-semibold">Ограничения на загрузку</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              id="max-upload"
              label="Файл, МБ"
              value={value.maxUploadMb}
              onChange={(maxUploadMb) => patch({ maxUploadMb })}
            />
            <NumberField
              id="max-image"
              label="Фото аватара, МБ"
              value={value.maxAvatarImageMb}
              onChange={(maxAvatarImageMb) => patch({ maxAvatarImageMb })}
            />
            <NumberField
              id="max-voice"
              label="Образец голоса, МБ"
              value={value.maxVoiceSampleMb}
              onChange={(maxVoiceSampleMb) => patch({ maxVoiceSampleMb })}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Ужесточить лимиты можно, но поднять выше ограничений модели бессмысленно: она примет
            изображение и аудио не больше 10 МБ.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="font-semibold">Генерация</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="max-resolution">Максимальное разрешение</Label>
              <Select
                value={value.maxResolution}
                onValueChange={(next) => patch({ maxResolution: (next as Resolution) ?? "1080p" })}
              >
                <SelectTrigger id="max-resolution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberField
              id="max-jobs"
              label="Задач на пользователя"
              value={value.maxConcurrentJobs}
              onChange={(maxConcurrentJobs) => patch({ maxConcurrentJobs })}
            />
          </div>

          <ToggleField
            label="Синтез речи доступен"
            hint="Выключенная модель не предлагается при генерации"
            checked={value.ttsEnabled}
            onChange={(ttsEnabled) => patch({ ttsEnabled })}
          />
          <ToggleField
            label="Генерация видео доступна"
            hint="LongCat-Video-Avatar"
            checked={value.avatarVideoEnabled}
            onChange={(avatarVideoEnabled) => patch({ avatarVideoEnabled })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="font-semibold">Хранение и доступ</h2>
          <NumberField
            id="retention"
            label="Хранить черновики, дней (0 — бессрочно)"
            value={value.draftRetentionDays}
            onChange={(draftRetentionDays) => patch({ draftRetentionDays })}
          />
          <ToggleField
            label="Регистрация открыта"
            hint="При выключении новые учётные записи создать нельзя"
            checked={value.registrationOpen}
            onChange={(registrationOpen) => patch({ registrationOpen })}
          />

          <div className="grid gap-2">
            <Label htmlFor="announcement">Системное объявление</Label>
            <Textarea
              id="announcement"
              rows={2}
              value={value.announcement}
              onChange={(event) => patch({ announcement: event.target.value })}
              placeholder="Показывается всем пользователям; пустое поле — не показывать"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Сохранить настройки
        </Button>
        {saved ? <span className="text-success text-sm">Сохранено</span> : null}
        {dirty ? <span className="text-muted-foreground text-sm">Есть несохранённые изменения</span> : null}
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary mt-0.5 size-4"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </label>
  );
}
