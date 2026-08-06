"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { UPLOAD_LIMITS, type LanguageCode } from "@avatar/contracts";
import { dataClient, queryKeys } from "@/lib/data";
import { startPreparation } from "@/lib/data/preparation";
import { UploadValidationError, uploadFile, validateFile } from "@/lib/data/uploads";
import { CONSENT_DOCUMENT_VERSION, ConsentGate } from "@/components/consent-gate";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceRecorder } from "./voice-recorder";

export function CreateVoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState<LanguageCode>("ru");
  const [source, setSource] = useState<"upload" | "recording">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [consentGranted, setConsentGranted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setLanguage("ru");
    setSource("upload");
    setFile(null);
    setConsentGranted(false);
    setValidationError(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Не выбран образец голоса");

      // Согласие записывается до создания голоса: клонирование не должно
      // стартовать раньше, чем зафиксирован факт согласия.
      const consent = await dataClient.consents.grant({
        userId: "usr_demo",
        kind: "voice_clone",
        documentVersion: CONSENT_DOCUMENT_VERSION,
      });

      const asset = await uploadFile({ file, kind: "voiceSample" });
      const voice = await dataClient.voices.create({
        name: name.trim(),
        language,
        source,
        sampleAssetId: asset.id,
        consentId: consent.id,
      });

      await dataClient.voices.update(voice.id, {
        sampleDurationSec: asset.durationSec,
      });
      startPreparation("voices", voice.id);
      return voice;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.voices });
      reset();
      onOpenChange(false);
    },
  });

  const acceptFile = (candidate: File | null) => {
    setValidationError(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    try {
      // Проверяем до сохранения: сообщать о превышении лимита после ожидания
      // загрузки — худший момент из возможных.
      validateFile(candidate, "voiceSample");
      setFile(candidate);
      if (name.trim().length === 0) setName(candidate.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      setFile(null);
      setValidationError(
        error instanceof UploadValidationError ? error.message : "Файл не подошёл",
      );
    }
  };

  const canSubmit = name.trim().length > 0 && file !== null && consentGranted;
  const submitError = create.error;

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
          <DialogTitle>Новый голос</DialogTitle>
          <DialogDescription>
            Загрузите образец речи или запишите его здесь. Чем чище запись, тем точнее клон.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="voice-name">Название</Label>
            <Input
              id="voice-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: дикторский голос"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="voice-language">Язык</Label>
            <Select
              items={{ ru: "Русский", en: "Английский" }}
              value={language}
              onValueChange={(value) => setLanguage(value as LanguageCode)}
            >
              <SelectTrigger id="voice-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="en">Английский</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs
            value={source}
            onValueChange={(value) => {
              setSource(value as "upload" | "recording");
              setFile(null);
              setValidationError(null);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="upload" className="flex-1">
                Загрузить файл
              </TabsTrigger>
              <TabsTrigger value="recording" className="flex-1">
                Записать
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-3">
              <label className="border-border bg-muted/40 hover:bg-muted/70 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors">
                <Upload className="text-muted-foreground size-6" />
                <span className="text-sm font-medium">
                  {file ? file.name : "Выберите аудиофайл"}
                </span>
                <span className="text-muted-foreground text-xs">
                  MP3, WAV, M4A, OGG или FLAC до{" "}
                  {Math.round(UPLOAD_LIMITS.voiceSample.maxBytes / (1024 * 1024))} МБ
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </TabsContent>

            <TabsContent value="recording" className="mt-3">
              <VoiceRecorder onRecorded={(recorded) => setFile(recorded)} />
              {file && source === "recording" ? (
                <p className="text-muted-foreground mt-2 text-center text-xs">
                  Запись готова: {Math.round(file.size / 1024)} КБ
                </p>
              ) : null}
            </TabsContent>
          </Tabs>

          {validationError ? (
            <p className="text-destructive text-sm">{validationError}</p>
          ) : null}

          <ConsentGate kind="voice_clone" granted={consentGranted} onChange={setConsentGranted} />

          {submitError ? (
            <p className="text-destructive text-sm">{submitError.message}</p>
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
            Создать голос
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
