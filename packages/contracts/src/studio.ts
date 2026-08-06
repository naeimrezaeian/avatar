import { z } from 'zod';
import { AspectRatio, Id, Resolution, Seconds } from './primitives';

/**
 * Роль говорящего в диалоговом формате. Ведущий задаёт тему и ведёт разговор,
 * гость отвечает — от роли зависит и порядок реплик, и то, чей аватар
 * показывается в кадре.
 */
export const SpeakerRole = z.enum(['host', 'guest']);
export type SpeakerRole = z.infer<typeof SpeakerRole>;

export const Speaker = z.object({
  role: SpeakerRole,
  avatarId: Id,
  voiceId: Id,
  /** Отображаемое имя в кадре и в сценарии. */
  displayName: z.string().min(1).max(60),
});
export type Speaker = z.infer<typeof Speaker>;

export const PODCAST_LENGTH_MINUTES = [1, 3, 5, 10] as const;
export const PodcastLength = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(5),
  z.literal(10),
]);
export type PodcastLength = z.infer<typeof PodcastLength>;

/**
 * Задание на создание видеоподкаста. Из него собирается обычный проект с
 * чередующимися сценами — отдельной сущности «подкаст» нет намеренно: иначе
 * редактор, экспорт и кредиты пришлось бы поддерживать в двух вариантах.
 */
export const PodcastBrief = z.object({
  title: z.string().min(1).max(120),
  host: Speaker,
  guest: Speaker,
  /** Сценарий целиком либо тема, из которой строится структура разговора. */
  content: z.string().min(1).max(20_000),
  /**
   * true — текст уже написан пользователем и разбивается на реплики как есть.
   * false — из темы строится структура диалога с подсказками, что сказать.
   */
  ownScript: z.boolean().default(false),
  resolution: Resolution.default('720p'),
  aspectRatio: AspectRatio.default('16:9'),
  lengthMinutes: PodcastLength.default(1),
  /** Пожелания к постановке кадра; попадают в промпт каждой сцены. */
  sceneInstructions: z.string().max(1000).default(''),
});
export type PodcastBrief = z.infer<typeof PodcastBrief>;

/**
 * Фон аватара в кадре. `remove` требует отделения фигуры от фона — это работа
 * модели сегментации на сервере, поэтому в предпросмотре такой фон показывается
 * приближённо.
 */
export const AvatarBackgroundKind = z.enum(['original', 'remove', 'color', 'image']);
export type AvatarBackgroundKind = z.infer<typeof AvatarBackgroundKind>;

export const AvatarBackground = z.object({
  kind: AvatarBackgroundKind.default('original'),
  /** Для kind = color. */
  color: z.string().default('#111827'),
  /** Для kind = image. */
  assetId: Id.nullable().default(null),
});
export type AvatarBackground = z.infer<typeof AvatarBackground>;

export const AvatarShape = z.enum(['original', 'circle']);
export type AvatarShape = z.infer<typeof AvatarShape>;

/**
 * Оформление аватара в кадре — то, что в интерфейсе называется «Аватар и
 * голос» для конкретной сцены. Хранится на клипе, а не на аватаре: один и тот
 * же аватар в разных сценах вставляют по-разному.
 */
export const AvatarStyle = z.object({
  background: AvatarBackground.default({ kind: 'original', color: '#111827', assetId: null }),
  shape: AvatarShape.default('original'),
  /** Скругление углов кадра аватара, в пикселях кадра 1080p. */
  cornerRadiusPx: z.number().int().min(0).max(400).default(0),
  /** Приближение кадра аватара, проценты. */
  zoomPct: z.number().int().min(50).max(300).default(100),
});
export type AvatarStyle = z.infer<typeof AvatarStyle>;

export const AVATAR_STYLE_DEFAULT: AvatarStyle = AvatarStyle.parse({});

/**
 * Оценка числа реплик под заданную длительность. Средняя реплика в разговоре
 * держится около двенадцати секунд: короче — разговор рубленый, длиннее —
 * превращается в монолог.
 */
export const AVERAGE_TURN_SEC = 12;

export function estimateTurnCount(lengthMinutes: number): number {
  return Math.max(2, Math.round((lengthMinutes * 60) / AVERAGE_TURN_SEC));
}

/** Длительность подкаста в секундах — для сметы до запуска. */
export function podcastDurationSec(lengthMinutes: number): Seconds {
  return lengthMinutes * 60;
}
