"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileAudio, FileVideo, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import type { Asset, AssetKind } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { UploadValidationError, deleteAssetBlob, uploadFile } from "@/lib/data/uploads";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { formatDuration, formatUpdatedAt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = "all" | AssetKind;

const KIND_ICONS: Record<AssetKind, typeof ImageIcon> = {
  image: ImageIcon,
  audio: FileAudio,
  video: FileVideo,
  subtitle: FileAudio,
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function LibraryClient() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const assets = useQuery({
    queryKey: queryKeys.assets(),
    queryFn: () => dataClient.assets.list(),
  });
  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => dataClient.settings.get(),
  });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      // Файлы загружаются по одному: параллельная загрузка десятка роликов
      // забивает память декодированием и не даёт показать честный прогресс.
      for (const file of Array.from(files)) {
        await uploadFile({ file, kind: "media" });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assets() }),
    onError: (cause) =>
      setError(cause instanceof UploadValidationError ? cause.message : "Не удалось загрузить файл"),
  });

  const remove = useMutation({
    mutationFn: async (asset: Asset) => {
      // Метаданные и содержимое удаляются вместе, иначе блоб остался бы
      // занимать место без единой ссылки на него.
      await dataClient.assets.remove(asset.id);
      await deleteAssetBlob(asset.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assets() }),
  });

  const items = (assets.data ?? []).filter(
    (asset) => filter === "all" || asset.kind === filter,
  );
  const totalBytes = (assets.data ?? []).reduce((sum, asset) => sum + asset.sizeBytes, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="image">Изображения</TabsTrigger>
            <TabsTrigger value="audio">Аудио</TabsTrigger>
            <TabsTrigger value="video">Видео</TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="text-muted-foreground text-xs">
          {(assets.data ?? []).length} файлов · {formatBytes(totalBytes)}
        </span>

        <label className="ml-auto">
          <span
            className={
              "bg-gradient-accent inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white shadow-soft hover:opacity-90"
            }
          >
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Загрузить файлы
          </span>
          <input
            type="file"
            multiple
            accept="image/*,audio/*,video/*"
            className="hidden"
            onChange={(event) => {
              setError(null);
              if (event.target.files) upload.mutate(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {settings.data ? (
        <p className="text-muted-foreground text-xs">
          Ограничение на файл: {settings.data.maxUploadMb} МБ. Черновики без активности удаляются
          через {settings.data.draftRetentionDays === 0 ? "— (не удаляются)" : `${settings.data.draftRetentionDays} дней`}.
        </p>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {assets.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {filter === "all"
                ? "Медиатека пуста. Загрузите изображения, аудио или собственные видео."
                : "Файлов этого типа нет."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onRemove={() => remove.mutate(asset)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onRemove }: { asset: Asset; onRemove: () => void }) {
  const url = useAssetUrl(asset.id);
  const Icon = KIND_ICONS[asset.kind];

  return (
    <Card className="overflow-hidden pt-0">
      <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden">
        {asset.kind === "image" && url ? (
          // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="text-muted-foreground size-8" />
        )}
      </div>

      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{asset.name}</p>
            <p className="text-muted-foreground text-xs">
              {formatBytes(asset.sizeBytes)}
              {asset.durationSec !== null ? ` · ${formatDuration(asset.durationSec)}` : ""}
              {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Удалить файл"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {asset.kind === "audio" && url ? (
          <audio controls src={url} className="w-full" preload="metadata" />
        ) : null}

        <p className="text-muted-foreground text-xs">
          {asset.origin === "generated" ? "Создан генерацией" : "Загружен"}{" "}
          {formatUpdatedAt(asset.createdAt)}
        </p>
      </CardContent>
    </Card>
  );
}
