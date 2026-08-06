"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Trash2, UserRound } from "lucide-react";
import { isAvatarUsable, primaryImage, type Avatar, type Voice } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { PreparationStatusBadge } from "@/components/preparation-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateAvatarDialog } from "./create-avatar-dialog";

export function AvatarsClient() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const avatars = useQuery({
    queryKey: queryKeys.avatars,
    queryFn: () => dataClient.avatars.list(),
  });
  const voices = useQuery({ queryKey: queryKeys.voices, queryFn: () => dataClient.voices.list() });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          <Plus className="size-4" />
          Создать аватар
        </Button>
      </div>

      {avatars.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : avatars.data && avatars.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {avatars.data.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              voice={voices.data?.find((item) => item.id === avatar.voiceId) ?? null}
            />
          ))}
        </div>
      ) : (
        <EmptyState onCreate={() => setDialogOpen(true)} />
      )}

      <CreateAvatarDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function AvatarCard({ avatar, voice }: { avatar: Avatar; voice: Voice | null }) {
  const queryClient = useQueryClient();
  const image = primaryImage(avatar);
  const imageUrl = useAssetUrl(image?.assetId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.avatars });
  const archive = useMutation({
    mutationFn: () => dataClient.avatars.archive(avatar.id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => dataClient.avatars.remove(avatar.id),
    onSuccess: invalidate,
  });

  // Аватар пригоден к генерации, только когда готовы и он сам, и его голос:
  // показывать кнопку запуска раньше — значит обещать то, что упадёт.
  const usable = isAvatarUsable(avatar, voice?.status ?? null);

  return (
    <Card className="overflow-hidden pt-0 shadow-soft">
      <div className="bg-muted relative aspect-3/4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <UserRound className="size-10" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <PreparationStatusBadge
            status={avatar.status}
            message={avatar.statusMessage}
            className="bg-background/90 backdrop-blur-sm"
          />
        </div>
      </div>

      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{avatar.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {voice ? `Голос: ${voice.name}` : "Голос не выбран"}
            </p>
          </div>
          <div className="flex shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Архивировать"
              onClick={() => archive.mutate()}
            >
              <Archive className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Удалить аватар"
              onClick={() => remove.mutate()}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {!usable ? (
          <p className="text-muted-foreground text-xs">
            {avatar.status !== "ready"
              ? "Аватар ещё готовится"
              : voice?.status !== "ready"
                ? "Голос ещё не готов"
                : "Не хватает данных для генерации"}
          </p>
        ) : (
          <p className="text-success text-xs">Готов к генерации видео</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
      <span className="bg-gradient-accent mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
        <UserRound className="size-5 text-white" />
      </span>
      <h2 className="font-semibold">Пока нет ни одного аватара</h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
        Аватар — это фотография и привязанный к ней голос. Из них модель собирает видео, где вы
        произносите написанный текст.
      </p>
      <Button onClick={onCreate} className="bg-gradient-accent mt-5 text-white hover:opacity-90">
        <Plus className="size-4" />
        Создать аватар
      </Button>
    </div>
  );
}
