import { z } from 'zod';
import { Id, Seconds, Timestamps } from './primitives';

export const AssetKind = z.enum(['image', 'audio', 'video', 'subtitle']);
export type AssetKind = z.infer<typeof AssetKind>;

export const AssetOrigin = z.enum([
  /** Загружено пользователем. */
  'upload',
  /** Результат генерации (озвучка, видео сцены, экспорт). */
  'generated',
  /** Из встроенной библиотеки фонов и музыки. */
  'library',
]);
export type AssetOrigin = z.infer<typeof AssetOrigin>;

/**
 * Ограничения на входные файлы продиктованы моделью генерации
 * (LongCat-Video-Avatar принимает изображение и аудио до 10 МБ), поэтому
 * проверяются на клиенте до начала загрузки, а не только на сервере.
 */
export const UPLOAD_LIMITS = {
  avatarImage: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  voiceSample: {
    maxBytes: 10 * 1024 * 1024,
    /**
     * webm и ogg — это то, что выдаёт запись с микрофона: MediaRecorder пишет
     * webm/opus в Chrome и ogg/opus в Firefox, а mp4 — в Safari. Без них
     * собственная кнопка записи создавала файл, который платформа же и
     * отвергала.
     */
    mimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/ogg',
      'audio/webm',
      'audio/flac',
    ],
    minDurationSec: 5,
    maxDurationSec: 120,
  },
  media: {
    maxBytes: 512 * 1024 * 1024,
    mimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/ogg',
      'audio/webm',
    ],
  },
} as const;

export const Asset = z
  .object({
    id: Id,
    userId: Id,
    /** Ассет привязан к проекту, если создан внутри него; библиотечные — null. */
    projectId: Id.nullable().default(null),
    kind: AssetKind,
    origin: AssetOrigin,
    name: z.string().min(1),
    url: z.string().min(1),
    thumbnailUrl: z.string().nullable().default(null),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    /** Заполнено для audio и video. */
    durationSec: Seconds.nullable().default(null),
    width: z.number().int().positive().nullable().default(null),
    height: z.number().int().positive().nullable().default(null),
    /**
     * Пиковая огибающая для отрисовки волны на аудиодорожке. Считается один раз
     * при загрузке — декодировать файл заново на каждый рендер таймлайна нельзя.
     */
    waveformPeaks: z.array(z.number().min(0).max(1)).nullable().default(null),
  })
  .extend(Timestamps.shape);
export type Asset = z.infer<typeof Asset>;
