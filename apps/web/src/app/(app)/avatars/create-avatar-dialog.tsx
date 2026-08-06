"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { UPLOAD_LIMITS, type LanguageCode } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { startPreparation } from "@/lib/data/preparation";
import { UploadValidationError, validateFile } from "@/lib/data/uploads";
import { uploadFile } from "@/lib/data/uploads";
import { CONSENT_DOCUMENT_VERSION, ConsentGate } from "@/components/consent-gate";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Draft = { file: File; previewUrl: string };

export function CreateAvatarDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState<LanguageCode>("ru");
  const [voiceId, setVoiceId] = useState<string>("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [consentGranted, setConsentGranted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const voices = useQuery({ queryKey: queryKeys.voices, queryFn: () => dataClient.voices.list() });
  const readyVoices = (voices.data ?? []).filter((voice) => voice.status === "ready");

  const reset = () => {
    // Превью держат блобы в памяти, поэтому ссылки отзываются явно.
    drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
    setName("");
    setLanguage("ru");
    setVoiceId("");
    setDrafts([]);
    setPrimaryIndex(0);
    setConsentGranted(false);
    setValidationError(null);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setValidationError(null);

    const accepted: Draft[] = [];
    for (const file of Array.from(files)) {
      try {
        validateFile(file, "avatarImage");
        accepted.push({ file, previewUrl: URL.createObjectURL(file) });
      } catch (error) {
        setValidationError(
          error instanceof UploadValidationError ? error.message : "Файл не подошёл",
        );
      }
    }

    if (accepted.length > 0) setDrafts((current) => [...current, ...accepted]);
  };

  const removeDraft = (index: number) => {
    setDrafts((current) => {
      const draft = current[index];
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      return current.filter((_, position) => position !== index);
    });
    setPrimaryIndex((current) => (current >= index && current > 0 ? current - 1 : current));
  };

  const create = useMutation({
    mutationFn: async () => {
      if (drafts.length === 0) throw new Error("Не загружено ни одного изображения");

      const consent = await dataClient.consents.grant({
        userId: "usr_demo",
        kind: "likeness",
        documentVersion: CONSENT_DOCUMENT_VERSION,
      });

      // Основное изображение идёт первым: модель получает один референсный
      // кадр, и порядок в контракте определяет, какой именно.
      const ordered = [
        drafts[primaryIndex]!,
        ...drafts.filter((_, index) => index !== primaryIndex),
      ];

      const assets = [];
      for (const draft of ordered) {
        assets.push(await uploadFile({ file: draft.file, kind: "avatarImage" }));
      }

      const avatar = await dataClient.avatars.create({
        name: name.trim(),
        language,
        imageAssetIds: assets.map((asset) => asset.id),
        voiceId: voiceId || null,
        consentId: consent.id,
      });

      startPreparation("avatars", avatar.id);
      return avatar;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.avatars });
      reset();
      onOpenChange(false);
    },
  });

  const canSubmit =
    name.trim().length > 0 && drafts.length > 0 && voiceId !== "" && consentGranted;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый аватар</DialogTitle>
          <DialogDescription>
            Загрузите фотографии и выберите основную — именно она станет референсным кадром для
            генерации видео.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="avatar-name">Название</Label>
            <Input
              id="avatar-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: деловой образ"
            />
          </div>

          <div className="grid gap-2">
            <Label>Фотографии</Label>
            <div className="grid grid-cols-3 gap-2">
              {drafts.map((draft, index) => (
                <div key={draft.previewUrl} className="group relative">
                  <button
                    type="button"
                    onClick={() => setPrimaryIndex(index)}
                    className={cn(
                      "block aspect-3/4 w-full overflow-hidden rounded-lg border-2 transition-colors",
                      index === primaryIndex ? "border-ring" : "border-transparent",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- локальный object URL, оптимизатор next/image к нему не применим */}
                    <img
                      src={draft.previewUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  </button>
                  {index === primaryIndex ? (
                    <span className="bg-gradient-accent absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-white">
                      <Check className="size-2.5" />
                      Основная
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeDraft(index)}
                    aria-label="Удалить изображение"
                    className="bg-background/90 absolute top-1 right-1 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}

              <label className="border-border bg-muted/40 hover:bg-muted/70 flex aspect-3/4 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed transition-colors">
                <ImagePlus className="text-muted-foreground size-5" />
                <span className="text-muted-foreground text-[11px]">Добавить</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />
              </label>
            </div>
            <p className="text-muted-foreground text-xs">
              JPG, PNG или WebP до{" "}
              {Math.round(UPLOAD_LIMITS.avatarImage.maxBytes / (1024 * 1024))} МБ. Лицо крупно, без
              резких теней.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="avatar-voice">Голос</Label>
            {readyVoices.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Готовых голосов пока нет. Аватар без голоса не сможет озвучивать сцены —{" "}
                  <Link href="/voices" className="underline underline-offset-2">
                    сначала создайте голос
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={voiceId} onValueChange={(value) => setVoiceId(value ?? "")}>
                <SelectTrigger id="avatar-voice">
                  <SelectValue placeholder="Выберите голос" />
                </SelectTrigger>
                <SelectContent>
                  {readyVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="avatar-language">Язык речи</Label>
            <Select value={language} onValueChange={(value) => setLanguage(value as LanguageCode)}>
              <SelectTrigger id="avatar-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="en">Английский</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {validationError ? (
            <p className="text-destructive text-sm">{validationError}</p>
          ) : null}

          <ConsentGate kind="likeness" granted={consentGranted} onChange={setConsentGranted} />

          {create.error ? (
            <p className="text-destructive text-sm">{create.error.message}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            className="bg-gradient-accent text-white hover:opacity-90"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Создать аватар
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
