import { z } from 'zod';

/**
 * Момент времени в ISO 8601 (UTC). Все даты в контрактах — строки, а не Date:
 * документ проекта сериализуется в патчи и в localStorage, Date там не переживает
 * round-trip.
 */
export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/**
 * Время внутри таймлайна и длительности — в секундах с плавающей точкой.
 * Кредиты считаются в секундах готового видео (см. credits.ts), пользователю
 * показываются минуты. Не смешивать эти две шкалы.
 */
export const Seconds = z.number().finite().nonnegative();
export type Seconds = z.infer<typeof Seconds>;

/**
 * Соотношение сторон — свойство проекта, а не экспорта: композиция сцен зависит
 * от кадра, поэтому оно выбирается при создании и дальше только читается.
 */
export const AspectRatio = z.enum(['16:9', '9:16', '1:1']);
export type AspectRatio = z.infer<typeof AspectRatio>;

export const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
};

export const Resolution = z.enum(['480p', '720p', '1080p']);
export type Resolution = z.infer<typeof Resolution>;

export const Fps = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]);
export type Fps = z.infer<typeof Fps>;

/**
 * Языки, для которых поддержаны клонирование голоса и субтитры.
 */
export const LanguageCode = z.enum(['ru', 'en']);
export type LanguageCode = z.infer<typeof LanguageCode>;

/**
 * Общий жизненный цикл для всего, что готовится асинхронно (аватар, голос).
 * Соответствует статусам из п.6 ТЗ.
 */
export const PreparationStatus = z.enum([
  'materials_uploaded',
  'processing',
  'ready',
  'error',
]);
export type PreparationStatus = z.infer<typeof PreparationStatus>;

export const SoftDeletable = z.object({
  archivedAt: IsoDateTime.nullable().default(null),
  deletedAt: IsoDateTime.nullable().default(null),
});

export const Timestamps = z.object({
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

/**
 * Страница списка. Курсорная, а не оффсетная: списки проектов и генераций
 * меняются во время просмотра, оффсет даёт дубли и пропуски.
 */
export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });
