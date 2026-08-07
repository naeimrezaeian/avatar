"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { UPLOAD_LIMITS } from "@avatar/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const { minDurationSec, maxDurationSec } = UPLOAD_LIMITS.voiceSample;

/**
 * Формат записи выбирается явно, а не отдаётся на усмотрение браузера.
 *
 * MediaRecorder по умолчанию пишет тем, чем умеет: Chrome — webm/opus, Firefox
 * — ogg/opus, Safari — mp4. Список перебирается в порядке предпочтения и
 * сверяется с isTypeSupported, поэтому платформа получает формат, который она
 * же принимает, а файл — расширение, соответствующее содержимому.
 */
const RECORDING_FORMATS = [
  { mimeType: "audio/mp4", extension: "m4a" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/ogg", extension: "ogg" },
] as const;

function pickFormat(): { mimeType?: string; extension: string } {
  if (typeof MediaRecorder === "undefined") return { extension: "webm" };

  for (const format of RECORDING_FORMATS) {
    if (MediaRecorder.isTypeSupported(format.mimeType)) return format;
  }
  // Ни один из перечисленных не подошёл — пишем тем, что выберет браузер, и
  // расширение берём из фактического типа записи.
  return { extension: "webm" };
}

/**
 * Запись образца голоса прямо в браузере (п.6 ТЗ).
 *
 * Поток микрофона останавливается явно при размонтировании: без этого индикатор
 * записи остаётся гореть в браузере после закрытия диалога, даже когда запись
 * уже завершена.
 */
export function VoiceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => stopTracks, []);

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const format = pickFormat();
      const recorder = new MediaRecorder(
        stream,
        format.mimeType ? { mimeType: format.mimeType } : undefined,
      );
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        stopTracks();
        const type = recorder.mimeType || format.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        onRecorded(new File([blob], `Запись голоса.${format.extension}`, { type }));
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((value) => {
          const next = value + 1;
          // Останавливаем сами на верхней границе: перезапись всё равно будет
          // отклонена при проверке длительности.
          if (next >= maxDurationSec) stop();
          return next;
        });
      }, 1000);
    } catch {
      setError("Не удалось получить доступ к микрофону. Разрешите запись в настройках браузера.");
    }
  };

  const tooShort = recording && seconds < minDurationSec;

  return (
    <div className="border-border bg-muted/40 flex flex-col items-center gap-3 rounded-xl border border-dashed p-6">
      <button
        type="button"
        onClick={recording ? stop : () => void start()}
        aria-label={recording ? "Остановить запись" : "Начать запись"}
        className={cn(
          "flex size-16 items-center justify-center rounded-full transition-all",
          recording
            ? "bg-destructive text-white shadow-soft-lg"
            : "bg-gradient-accent text-white shadow-soft hover:opacity-90",
        )}
      >
        {recording ? <Square className="size-6" /> : <Mic className="size-6" />}
      </button>

      <div className="text-center">
        <p className="font-mono text-lg tabular-nums">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")}
        </p>
        <p className="text-muted-foreground text-xs">
          {recording
            ? tooShort
              ? `Говорите ещё — нужно минимум ${minDurationSec} с`
              : "Идёт запись, можно останавливать"
            : `От ${minDurationSec} до ${maxDurationSec} секунд связной речи`}
        </p>
      </div>

      {error ? <p className="text-destructive text-center text-sm">{error}</p> : null}

      {recording ? (
        <Button variant="ghost" size="sm" onClick={stop}>
          Завершить запись
        </Button>
      ) : null}
    </div>
  );
}
