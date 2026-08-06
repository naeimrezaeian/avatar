"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Plus, Trash2 } from "lucide-react";
import type { Voice } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { useAssetUrl } from "@/lib/data/use-asset-url";
import { PreparationStatusBadge } from "@/components/preparation-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateVoiceDialog } from "./create-voice-dialog";

export function VoicesClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const voices = useQuery({ queryKey: queryKeys.voices, queryFn: () => dataClient.voices.list() });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-gradient-accent text-white hover:opacity-90"
        >
          <Plus className="size-4" />
          Добавить голос
        </Button>
      </div>

      {voices.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : voices.data && voices.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {voices.data.map((voice) => (
            <VoiceCard key={voice.id} voice={voice} />
          ))}
        </div>
      ) : (
        <EmptyState onCreate={() => setDialogOpen(true)} />
      )}

      <CreateVoiceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function VoiceCard({ voice }: { voice: Voice }) {
  const queryClient = useQueryClient();
  const sampleUrl = useAssetUrl(voice.sampleAssetId);

  const remove = useMutation({
    mutationFn: () => dataClient.voices.remove(voice.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.voices }),
  });

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
              <AudioLines className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{voice.name}</p>
              <p className="text-muted-foreground text-xs">
                {voice.language === "ru" ? "Русский" : "Английский"}
                {voice.sampleDurationSec !== null
                  ? ` · образец ${Math.round(voice.sampleDurationSec)} с`
                  : ""}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Удалить голос"
            onClick={() => remove.mutate()}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <PreparationStatusBadge status={voice.status} message={voice.statusMessage} />

        {sampleUrl ? (
          <audio controls src={sampleUrl} className="w-full" preload="metadata" />
        ) : (
          <p className="text-muted-foreground text-xs">Образец недоступен для прослушивания</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-border bg-card rounded-2xl border border-dashed p-10 text-center shadow-soft">
      <span className="bg-gradient-accent mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
        <AudioLines className="size-5 text-white" />
      </span>
      <h2 className="font-semibold">Пока нет ни одного голоса</h2>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
        Голос нужен аватару, чтобы озвучивать сцены. Загрузите образец речи или запишите его
        прямо здесь — достаточно 15–30 секунд связного текста.
      </p>
      <Button onClick={onCreate} className="bg-gradient-accent mt-5 text-white hover:opacity-90">
        <Plus className="size-4" />
        Добавить голос
      </Button>
    </div>
  );
}
