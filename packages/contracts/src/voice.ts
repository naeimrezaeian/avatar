import { z } from 'zod';
import { Id, LanguageCode, PreparationStatus, Seconds, SoftDeletable, Timestamps } from './primitives';

export const VoiceSampleSource = z.enum(['upload', 'recording']);
export type VoiceSampleSource = z.infer<typeof VoiceSampleSource>;

/**
 * Параметры синтеза. Живут на сцене, а не на голосе: один и тот же голос в
 * разных сценах читает с разной скоростью и громкостью.
 */
export const SpeechSettings = z.object({
  /** 50–200 %, где 100 — исходный темп голоса. */
  speedPct: z.number().int().min(50).max(200).default(100),
  /** Полутоны, −12…+12. */
  pitchSemitones: z.number().int().min(-12).max(12).default(0),
  volumePct: z.number().int().min(0).max(200).default(100),
  /** Пауза между предложениями сверх естественной. */
  sentencePauseSec: z.number().min(0).max(3).default(0),
});
export type SpeechSettings = z.infer<typeof SpeechSettings>;

export const SPEECH_SETTINGS_DEFAULT: SpeechSettings = SpeechSettings.parse({});

export const Voice = z
  .object({
    id: Id,
    userId: Id,
    name: z.string().min(1).max(80),
    language: LanguageCode,
    /** Описание манеры речи, попадает в подсказку синтезатору. */
    style: z.string().max(200).nullable().default(null),
    source: VoiceSampleSource,
    sampleAssetId: Id.nullable().default(null),
    sampleDurationSec: Seconds.nullable().default(null),
    /** Короткая фраза, синтезированная после клонирования, — для прослушивания. */
    previewAssetId: Id.nullable().default(null),
    status: PreparationStatus,
    statusMessage: z.string().nullable().default(null),
    /** Клонирование не запускается без действующего согласия voice_clone. */
    consentId: Id.nullable().default(null),
  })
  .extend(Timestamps.shape)
  .extend(SoftDeletable.shape);
export type Voice = z.infer<typeof Voice>;
