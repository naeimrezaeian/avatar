import { z } from 'zod';
import { AspectRatio, Fps, Id, IsoDateTime, Resolution, Seconds, Timestamps } from './primitives';

/**
 * Пайплайн строго последовательный: текст → озвучка клонированным голосом →
 * видео из этой озвучки. Видео нельзя запустить параллельно с озвучкой — она
 * является его входом.
 */
export const JobKind = z.enum([
  /** Синтез речи клонированным голосом. Секунды, дёшево. */
  'tts',
  /** Генерация видео аватара из изображения, аудио и промпта. Минуты, дорого. */
  'avatar_video',
  /** Сборка и кодирование итогового ролика. */
  'export',
]);
export type JobKind = z.infer<typeof JobKind>;

export const JobStatus = z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']);
export type JobStatus = z.infer<typeof JobStatus>;

/**
 * Подэтапы, которые видит пользователь при экспорте (п.10 ТЗ). Держим отдельно
 * от JobStatus: «выполняется» — одно состояние задачи, но три разных сообщения.
 */
export const JobStage = z.enum([
  'waiting',
  'synthesizing_speech',
  'generating_video',
  'assembling',
  'encoding',
  'uploading',
  'done',
]);
export type JobStage = z.infer<typeof JobStage>;

export const JobErrorCode = z.enum([
  'insufficient_credits',
  'consent_missing',
  'avatar_not_ready',
  'input_too_long',
  'model_unavailable',
  'canceled_by_user',
  'internal_error',
]);
export type JobErrorCode = z.infer<typeof JobErrorCode>;

export const JobError = z.object({
  code: JobErrorCode,
  message: z.string(),
  /** Можно ли перезапустить задачу без изменения входных данных. */
  retryable: z.boolean(),
});
export type JobError = z.infer<typeof JobError>;

export const ExportFormat = z.enum(['mp4', 'webm', 'mov']);
export type ExportFormat = z.infer<typeof ExportFormat>;

export const ExportSettings = z.object({
  resolution: Resolution.default('1080p'),
  fps: Fps.default(30),
  format: ExportFormat.default('mp4'),
  /**
   * Дублирует соотношение сторон проекта. Хранится в настройках экспорта
   * только для истории: менять его здесь нельзя, кадрирование задано проектом.
   */
  aspectRatio: AspectRatio,
  burnSubtitles: z.boolean().default(false),
  watermark: z.boolean().default(true),
  audioBitrateKbps: z.union([z.literal(128), z.literal(192), z.literal(256)]).default(192),
});
export type ExportSettings = z.infer<typeof ExportSettings>;

export const GenerationJob = z
  .object({
    id: Id,
    userId: Id,
    kind: JobKind,
    status: JobStatus,
    stage: JobStage.default('waiting'),
    progressPct: z.number().int().min(0).max(100).default(0),

    projectId: Id.nullable().default(null),
    sceneId: Id.nullable().default(null),
    /** Резерв кредитов; при провале задачи он возвращается, а не списывается. */
    creditHoldId: Id.nullable().default(null),
    estimatedCostSeconds: z.number().int().nonnegative().default(0),

    resultAssetId: Id.nullable().default(null),
    error: JobError.nullable().default(null),

    /**
     * Настройки, с которыми запущен экспорт. Живут на задаче, а не рядом с ней:
     * повтор упавшего экспорта должен собрать ролик ровно теми же параметрами,
     * а после перезагрузки страницы их больше взять неоткуда.
     */
    exportSettings: ExportSettings.nullable().default(null),

    /** Позиция в очереди — для честного ожидания вместо бесконечного спиннера. */
    queuePosition: z.number().int().nonnegative().nullable().default(null),
    estimatedWaitSec: Seconds.nullable().default(null),

    startedAt: IsoDateTime.nullable().default(null),
    finishedAt: IsoDateTime.nullable().default(null),
  })
  .extend(Timestamps.shape);
export type GenerationJob = z.infer<typeof GenerationJob>;

export function isJobActive(job: GenerationJob): boolean {
  return job.status === 'queued' || job.status === 'running';
}

/**
 * Событие потока статусов. Долгие задачи отдаются через SSE, а не поллингом:
 * один поток питает и тосты, и центр уведомлений, и статусы в списках.
 */
export const JobEvent = z.object({
  jobId: Id,
  status: JobStatus,
  stage: JobStage,
  progressPct: z.number().int().min(0).max(100),
  queuePosition: z.number().int().nonnegative().nullable(),
  error: JobError.nullable(),
  at: IsoDateTime,
});
export type JobEvent = z.infer<typeof JobEvent>;

/**
 * Готовая версия ролика. Хранит revision документа, из которого собрана: без
 * этого «создать новую версию» и «откатиться» не имеют определённого смысла.
 */
export const RenderVersion = z
  .object({
    id: Id,
    projectId: Id,
    jobId: Id,
    versionNumber: z.number().int().positive(),
    documentRevision: z.number().int().nonnegative(),
    settings: ExportSettings,
    assetId: Id.nullable().default(null),
    durationSec: Seconds.default(0),
    sizeBytes: z.number().int().nonnegative().default(0),
    /** Токен публичной ссылки; null — доступ только владельцу. */
    shareToken: z.string().nullable().default(null),
    shareExpiresAt: IsoDateTime.nullable().default(null),
  })
  .extend(Timestamps.shape);
export type RenderVersion = z.infer<typeof RenderVersion>;
