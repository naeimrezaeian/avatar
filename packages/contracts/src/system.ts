import { z } from 'zod';
import { Id, IsoDateTime, Resolution, Timestamps } from './primitives';

/**
 * Уведомление пользователю. Порождается событиями задач и действиями
 * администратора. Прочитанность хранится флагом, а не удалением: список
 * «что произошло, пока меня не было» нужен и после прочтения.
 */
export const NotificationKind = z.enum([
  'job_succeeded',
  'job_failed',
  'credits_granted',
  'credits_low',
  'avatar_ready',
  'system_announcement',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

export const Notification = z.object({
  id: Id,
  userId: Id,
  kind: NotificationKind,
  title: z.string().min(1).max(200),
  body: z.string().max(1000).default(''),
  /** Куда ведёт уведомление; null — просто сообщение. */
  href: z.string().nullable().default(null),
  readAt: IsoDateTime.nullable().default(null),
  createdAt: IsoDateTime,
});
export type Notification = z.infer<typeof Notification>;

/**
 * Запись системного журнала. Отделена от уведомлений: журнал — для
 * администратора и разбора инцидентов, уведомления — для пользователя.
 */
export const LogLevel = z.enum(['info', 'warning', 'error']);
export type LogLevel = z.infer<typeof LogLevel>;

export const SystemLogEntry = z.object({
  id: Id,
  level: LogLevel,
  /** Область: auth, generation, credits, admin, storage. */
  scope: z.string().min(1).max(40),
  message: z.string().min(1).max(500),
  /** Кто вызвал действие; null — системное событие. */
  actorUserId: Id.nullable().default(null),
  targetId: Id.nullable().default(null),
  createdAt: IsoDateTime,
});
export type SystemLogEntry = z.infer<typeof SystemLogEntry>;

/**
 * Настройки платформы, редактируемые администратором (п.11, п.12 ТЗ).
 * Хранятся одной записью: они читаются вместе и меняются редко.
 */
export const SystemSettings = z
  .object({
    id: z.literal('system'),
    /** Ограничения на загрузку, которые администратор может ужесточить. */
    maxUploadMb: z.number().int().min(1).max(2048).default(512),
    maxAvatarImageMb: z.number().int().min(1).max(50).default(10),
    maxVoiceSampleMb: z.number().int().min(1).max(50).default(10),
    /** Разрешение, выше которого генерация недоступна всем тарифам. */
    maxResolution: Resolution.default('1080p'),
    /** Одновременных задач генерации на пользователя. */
    maxConcurrentJobs: z.number().int().min(1).max(20).default(3),
    /** Черновики без активности удаляются через столько дней; 0 — не удалять. */
    draftRetentionDays: z.number().int().min(0).max(365).default(90),
    /** Доступные модели. Выключенная модель не предлагается при генерации. */
    ttsEnabled: z.boolean().default(true),
    avatarVideoEnabled: z.boolean().default(true),
    /** Объявление, показываемое всем пользователям; пустое — не показывать. */
    announcement: z.string().max(500).default(''),
    registrationOpen: z.boolean().default(true),
  })
  .extend(Timestamps.shape);
export type SystemSettings = z.infer<typeof SystemSettings>;

export const DEFAULT_SYSTEM_SETTINGS = {
  id: 'system' as const,
  maxUploadMb: 512,
  maxAvatarImageMb: 10,
  maxVoiceSampleMb: 10,
  maxResolution: '1080p' as const,
  maxConcurrentJobs: 3,
  draftRetentionDays: 90,
  ttsEnabled: true,
  avatarVideoEnabled: true,
  announcement: '',
  registrationOpen: true,
};
