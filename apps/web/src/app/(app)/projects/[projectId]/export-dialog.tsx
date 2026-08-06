"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import {
  ExportSettings,
  estimateCostSeconds,
  secondsToMinutesLabel,
  type AspectRatio,
  type ProjectDocument,
  type Resolution,
} from "@avatar/contracts";
import { InsufficientCreditsError, dataClient, queryKeys } from "@/lib/data";
import { aspectRatioLabel, formatDuration } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  aspectRatio,
  durationSec,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  aspectRatio: AspectRatio;
  durationSec: number;
}) {
  const queryClient = useQueryClient();

  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [format, setFormat] = useState<"mp4" | "webm" | "mov">("mp4");
  const [fps, setFps] = useState<24 | 25 | 30 | 60>(30);
  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [watermark, setWatermark] = useState(true);

  const account = useQuery({
    queryKey: queryKeys.creditAccount,
    queryFn: () => dataClient.credits.getAccount("usr_demo"),
  });

  const costSeconds = estimateCostSeconds(durationSec, resolution);
  const availableSec = account.data
    ? account.data.balanceSeconds - account.data.reservedSeconds
    : 0;
  const sufficient = availableSec >= costSeconds;

  const start = useMutation({
    mutationFn: () =>
      dataClient.generation.startExport({
        projectId,
        settings: ExportSettings.parse({
          resolution,
          fps,
          format,
          aspectRatio,
          burnSubtitles,
          watermark,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Экспорт видео</DialogTitle>
          <DialogDescription>
            Кадр {aspectRatioLabel(aspectRatio)} ({aspectRatio}), длительность{" "}
            {formatDuration(durationSec)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="export-resolution">Разрешение</Label>
            <Select
              value={resolution}
              onValueChange={(value) => setResolution((value as Resolution) ?? "1080p")}
            >
              <SelectTrigger id="export-resolution">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="480p">480p — черновик</SelectItem>
                <SelectItem value="720p">720p — стандарт</SelectItem>
                <SelectItem value="1080p">1080p — публикация</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Разрешение влияет на стоимость: 1080p дороже 720p вдвое, 480p дешевле почти вдвое.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="export-format">Формат</Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat((value as typeof format) ?? "mp4")}
              >
                <SelectTrigger id="export-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="webm">WebM</SelectItem>
                  <SelectItem value="mov">MOV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="export-fps">Частота кадров</Label>
              <Select
                value={String(fps)}
                onValueChange={(value) => setFps(Number(value ?? 30) as typeof fps)}
              >
                <SelectTrigger id="export-fps">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="60">60</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={burnSubtitles}
              onChange={(event) => setBurnSubtitles(event.target.checked)}
              className="accent-primary size-4"
            />
            Вшить субтитры в картинку
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={watermark}
              onChange={(event) => setWatermark(event.target.checked)}
              className="accent-primary size-4"
            />
            Водяной знак платформы
          </label>

          <div className="bg-muted/50 flex items-baseline justify-between gap-2 rounded-xl p-3 text-sm">
            <span className="text-muted-foreground">Спишется при успехе</span>
            <span className="font-medium tabular-nums">
              {secondsToMinutesLabel(costSeconds)} мин из {secondsToMinutesLabel(availableSec)}
            </span>
          </div>

          {!sufficient ? (
            <Alert>
              <AlertDescription>
                Кредитов не хватает. Выберите разрешение ниже или пополните баланс — списание
                произойдёт только после успешной сборки.
              </AlertDescription>
            </Alert>
          ) : null}

          {start.error ? (
            <p className="text-destructive text-sm">
              {start.error instanceof InsufficientCreditsError
                ? "Кредитов не хватает для запуска"
                : start.error.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => start.mutate()}
            disabled={!sufficient || durationSec === 0 || start.isPending}
            className="bg-gradient-accent text-white hover:opacity-90"
          >
            {start.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Начать экспорт
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function projectDurationSec(document: ProjectDocument): number {
  return Object.values(document.clips).reduce(
    (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
    0,
  );
}
