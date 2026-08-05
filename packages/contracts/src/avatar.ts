import { z } from 'zod';
import { Id, LanguageCode, PreparationStatus, SoftDeletable, Timestamps } from './primitives';

/**
 * Изображение аватара. Модель генерации получает одно референсное изображение,
 * поэтому ровно одно из них помечено основным — остальные хранятся для быстрой
 * замены без пересоздания аватара.
 */
export const AvatarImage = z.object({
  id: Id,
  assetId: Id,
  isPrimary: z.boolean(),
  order: z.number().int().nonnegative(),
});
export type AvatarImage = z.infer<typeof AvatarImage>;

export const Avatar = z
  .object({
    id: Id,
    userId: Id,
    name: z.string().min(1).max(80),
    images: z.array(AvatarImage),
    voiceId: Id.nullable().default(null),
    language: LanguageCode,
    status: PreparationStatus,
    statusMessage: z.string().nullable().default(null),
    /** Тестовый ролик, который пользователь смотрит перед первым проектом. */
    previewAssetId: Id.nullable().default(null),
    /** Генерация не запускается без действующего согласия likeness. */
    consentId: Id.nullable().default(null),
  })
  .extend(Timestamps.shape)
  .extend(SoftDeletable.shape);
export type Avatar = z.infer<typeof Avatar>;

export function primaryImage(avatar: Avatar): AvatarImage | undefined {
  return avatar.images.find((image) => image.isPrimary) ?? avatar.images[0];
}

/**
 * Аватар пригоден для генерации, только когда готовы и он сам, и его голос.
 * Проверяется до показа кнопки запуска, иначе пользователь тратит кредиты на
 * заведомо падающую задачу.
 */
export function isAvatarUsable(avatar: Avatar, voiceStatus: PreparationStatus | null): boolean {
  return (
    avatar.status === 'ready' &&
    avatar.deletedAt === null &&
    avatar.archivedAt === null &&
    avatar.voiceId !== null &&
    voiceStatus === 'ready'
  );
}
