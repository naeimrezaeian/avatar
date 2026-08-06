"use client";

import { useId, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ConsentKind } from "@avatar/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Версия текста согласия. Меняется вместе с формулировками: в ConsentRecord
 * попадает именно она, чтобы потом было видно, с чем конкретно согласился
 * пользователь.
 */
export const CONSENT_DOCUMENT_VERSION = "2026-08-01";

const CONSENT_TEXTS: Record<ConsentKind, { title: string; body: string; checkbox: string }> = {
  voice_clone: {
    title: "Согласие на клонирование голоса",
    body:
      "Голос относится к биометрическим персональным данным. Загруженный образец будет использован для создания голосовой модели и синтеза речи в ваших проектах. Образец и модель хранятся, пока вы не отзовёте согласие; после отзыва они удаляются вместе со связанными аватарами.",
    checkbox:
      "Я подтверждаю, что голос на записи принадлежит мне, и даю согласие на его клонирование",
  },
  likeness: {
    title: "Согласие на использование изображения",
    body:
      "Изображение лица относится к биометрическим персональным данным. Загруженные фотографии будут использованы для генерации видео с вашим цифровым аватаром. Материалы хранятся, пока вы не отзовёте согласие; после отзыва они удаляются вместе с созданными аватарами.",
    checkbox:
      "Я подтверждаю, что на фотографиях изображён я, и даю согласие на создание цифрового аватара",
  },
};

/**
 * Согласие оформляется отдельным блоком с собственным текстом и версией, а не
 * галочкой в общих условиях: для биометрии требуется отдельное информированное
 * согласие, и оно должно быть получено до запуска обработки.
 */
export function ConsentGate({
  kind,
  granted,
  onChange,
}: {
  kind: ConsentKind;
  granted: boolean;
  onChange: (granted: boolean) => void;
}) {
  const text = CONSENT_TEXTS[kind];
  const checkboxId = useId();

  return (
    <Alert>
      <ShieldCheck className="size-4" />
      <AlertTitle>{text.title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{text.body}</p>
        <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-2.5">
          <input
            id={checkboxId}
            type="checkbox"
            checked={granted}
            onChange={(event) => onChange(event.target.checked)}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
          <span className="text-foreground text-sm">{text.checkbox}</span>
        </label>
      </AlertDescription>
    </Alert>
  );
}

/** Небольшая обёртка состояния, чтобы формы не дублировали одну и ту же пару. */
export function useConsent() {
  const [granted, setGranted] = useState(false);
  return { granted, setGranted };
}
