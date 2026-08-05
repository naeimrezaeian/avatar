import { z } from 'zod';
import { Id, IsoDateTime } from './primitives';

/**
 * Согласие на обработку биометрии. Лицо и голос — биометрические персональные
 * данные, поэтому согласие фиксируется отдельной записью, а не галочкой в общих
 * условиях: нужны версия текста, момент выдачи и возможность отзыва с удалением
 * материалов.
 *
 * Аватар и голос нельзя перевести в статус processing без действующего согласия
 * соответствующего вида.
 */
export const ConsentKind = z.enum([
  /** Клонирование голоса по загруженному образцу. */
  'voice_clone',
  /** Использование изображения лица для генерации видео. */
  'likeness',
]);
export type ConsentKind = z.infer<typeof ConsentKind>;

export const ConsentRecord = z.object({
  id: Id,
  userId: Id,
  kind: ConsentKind,
  /** Версия текста согласия, который пользователь реально видел. */
  documentVersion: z.string().min(1),
  grantedAt: IsoDateTime,
  /** Отзыв согласия обязывает удалить исходные материалы и связанные аватары. */
  revokedAt: IsoDateTime.nullable().default(null),
  ipAddress: z.string().nullable().default(null),
  userAgent: z.string().nullable().default(null),
});
export type ConsentRecord = z.infer<typeof ConsentRecord>;

export function isConsentActive(record: ConsentRecord): boolean {
  return record.revokedAt === null;
}
