import { z } from 'zod';
import { Id, IsoDateTime, Resolution, Seconds, Timestamps } from './primitives';

/**
 * Внутренняя единица учёта — секунда готового видео в базовом качестве.
 * Пользователю показываются минуты (п.5 ТЗ), но хранить минуты нельзя:
 * себестоимость зависит от разрешения и числа повторов, а округление минут
 * при каждой операции накапливает расхождение баланса.
 */
export const QUALITY_COST_MULTIPLIER: Record<Resolution, number> = {
  '480p': 0.6,
  '720p': 1,
  '1080p': 2,
};

export function estimateCostSeconds(durationSec: number, resolution: Resolution): number {
  return Math.ceil(durationSec * QUALITY_COST_MULTIPLIER[resolution]);
}

export function secondsToMinutesLabel(seconds: number): string {
  const totalMinutes = seconds / 60;
  return totalMinutes < 10 ? totalMinutes.toFixed(1) : String(Math.round(totalMinutes));
}

/**
 * Счёт кредитов. reservedSeconds отделены от balanceSeconds, потому что
 * проверка «хватает ли кредитов» перед запуском — это гонка: две вкладки
 * проходят проверку одновременно и уводят баланс в минус. Списание идёт через
 * резерв, а доступное к трате — availableSeconds().
 */
export const CreditAccount = z
  .object({
    userId: Id,
    balanceSeconds: z.number().int().nonnegative(),
    reservedSeconds: z.number().int().nonnegative(),
    /** Срок действия кредитов, назначаемый администратором (п.5 ТЗ). */
    expiresAt: IsoDateTime.nullable().default(null),
    planId: Id.nullable().default(null),
  })
  .extend(Timestamps.shape);
export type CreditAccount = z.infer<typeof CreditAccount>;

export function availableSeconds(account: CreditAccount): number {
  return Math.max(0, account.balanceSeconds - account.reservedSeconds);
}

export function hasEnoughCredits(account: CreditAccount, costSeconds: number): boolean {
  return availableSeconds(account) >= costSeconds;
}

export const CreditHoldStatus = z.enum([
  /** Зарезервировано под запущенную задачу. */
  'held',
  /** Задача успешна, резерв превращён в списание. */
  'committed',
  /** Задача упала или отменена, резерв возвращён пользователю. */
  'released',
]);
export type CreditHoldStatus = z.infer<typeof CreditHoldStatus>;

export const CreditHold = z.object({
  id: Id,
  userId: Id,
  jobId: Id,
  seconds: z.number().int().positive(),
  status: CreditHoldStatus,
  createdAt: IsoDateTime,
  settledAt: IsoDateTime.nullable().default(null),
});
export type CreditHold = z.infer<typeof CreditHold>;

export const CreditTransactionKind = z.enum([
  'grant',
  'spend',
  /** Возврат за упавшую генерацию — иначе пользователь платит за наши сбои. */
  'refund',
  'expire',
  'admin_adjust',
]);
export type CreditTransactionKind = z.infer<typeof CreditTransactionKind>;

export const CreditTransaction = z.object({
  id: Id,
  userId: Id,
  kind: CreditTransactionKind,
  /** Положительная — начисление, отрицательная — списание. */
  deltaSeconds: z.number().int(),
  balanceAfterSeconds: z.number().int().nonnegative(),
  jobId: Id.nullable().default(null),
  projectId: Id.nullable().default(null),
  /** Кто произвёл операцию, если это действие администратора. */
  actorUserId: Id.nullable().default(null),
  note: z.string().max(500).default(''),
  createdAt: IsoDateTime,
});
export type CreditTransaction = z.infer<typeof CreditTransaction>;

export const Plan = z
  .object({
    id: Id,
    name: z.string().min(1).max(80),
    description: z.string().max(500).default(''),
    monthlySeconds: z.number().int().nonnegative(),
    maxResolution: Resolution.default('1080p'),
    maxProjects: z.number().int().positive().nullable().default(null),
    maxAvatars: z.number().int().positive().nullable().default(null),
    /** Водяной знак на экспорте, если тариф его не снимает. */
    watermark: z.boolean().default(true),
    priceMinor: z.number().int().nonnegative().default(0),
    currency: z.string().length(3).default('RUB'),
    isActive: z.boolean().default(true),
  })
  .extend(Timestamps.shape);
export type Plan = z.infer<typeof Plan>;

/** Смета, показываемая до запуска генерации (п.5 ТЗ). */
export const CostEstimate = z.object({
  durationSec: Seconds,
  resolution: Resolution,
  costSeconds: z.number().int().nonnegative(),
  availableSeconds: z.number().int().nonnegative(),
  sufficient: z.boolean(),
});
export type CostEstimate = z.infer<typeof CostEstimate>;
