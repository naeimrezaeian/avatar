import { z } from 'zod';
import { Id, Seconds } from './primitives';

/**
 * Дорожки таймлайна из п.9 ТЗ. Порядок в trackOrder задаёт порядок наложения
 * визуальных слоёв: чем позже дорожка, тем выше слой.
 */
export const TrackKind = z.enum([
  'video',
  'avatar',
  'image',
  'text',
  'voiceover',
  'music',
  'sfx',
  'subtitle',
]);
export type TrackKind = z.infer<typeof TrackKind>;

export const ClipKind = z.enum(['avatar', 'video', 'image', 'text', 'audio', 'subtitle']);
export type ClipKind = z.infer<typeof ClipKind>;

export const TRACK_ACCEPTS: Record<TrackKind, readonly ClipKind[]> = {
  video: ['video', 'image'],
  avatar: ['avatar'],
  image: ['image'],
  text: ['text'],
  voiceover: ['audio'],
  music: ['audio'],
  sfx: ['audio'],
  subtitle: ['subtitle'],
};

export const AUDIO_TRACK_KINDS: readonly TrackKind[] = ['voiceover', 'music', 'sfx'];

export const Track = z.object({
  id: Id,
  kind: TrackKind,
  name: z.string().min(1),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
});
export type Track = z.infer<typeof Track>;

/** Положение аватара в кадре — п.8 ТЗ. */
export const HorizontalAnchor = z.enum(['left', 'center', 'right']);
export type HorizontalAnchor = z.infer<typeof HorizontalAnchor>;

/**
 * Геометрия визуального клипа. Смещения — в долях кадра, а не в пикселях:
 * проект может рендериться в 720p и в 1080p, пиксельные координаты при этом
 * разъезжаются.
 */
export const Transform = z.object({
  anchor: HorizontalAnchor.default('center'),
  offsetXRatio: z.number().min(-1).max(1).default(0),
  offsetYRatio: z.number().min(-1).max(1).default(0),
  scale: z.number().min(0.1).max(4).default(1),
  rotationDeg: z.number().min(-180).max(180).default(0),
  opacity: z.number().min(0).max(1).default(1),
});
export type Transform = z.infer<typeof Transform>;

export const TRANSFORM_DEFAULT: Transform = Transform.parse({});

export const AudioSettings = z.object({
  volumePct: z.number().int().min(0).max(200).default(100),
  fadeInSec: Seconds.max(10).default(0),
  fadeOutSec: Seconds.max(10).default(0),
  muted: z.boolean().default(false),
});
export type AudioSettings = z.infer<typeof AudioSettings>;

export const AUDIO_SETTINGS_DEFAULT: AudioSettings = AudioSettings.parse({});

export const TransitionKind = z.enum(['none', 'fade', 'dissolve', 'slide', 'wipe']);
export type TransitionKind = z.infer<typeof TransitionKind>;

export const Transition = z.object({
  kind: TransitionKind.default('none'),
  durationSec: Seconds.max(3).default(0.5),
});
export type Transition = z.infer<typeof Transition>;

const ClipBase = z.object({
  id: Id,
  trackId: Id,
  /** Позиция начала клипа на таймлайне. */
  startSec: Seconds,
  /** Видимая длительность на таймлайне. */
  durationSec: Seconds.refine((value) => value > 0, 'Длительность клипа должна быть больше нуля'),
  /** Точка входа внутри исходного файла (обрезка слева). */
  sourceInSec: Seconds.default(0),
  transitionIn: Transition.optional(),
  transitionOut: Transition.optional(),
});

/**
 * Клип аватара. Его длительность равна длительности синтезированной озвучки
 * сцены и не редактируется вручную: видео порождается моделью из этого аудио,
 * растянуть его на таймлайне — значит рассинхронизировать губы и звук.
 * Чтобы изменить длительность, правят текст сцены и перегенерируют озвучку.
 */
export const AvatarClip = ClipBase.extend({
  kind: z.literal('avatar'),
  sceneId: Id,
  transform: Transform.default(TRANSFORM_DEFAULT),
  audio: AudioSettings.default(AUDIO_SETTINGS_DEFAULT),
  /** Аватар можно скрыть в отдельных сценах, оставив звук (п.8 ТЗ). */
  videoHidden: z.boolean().default(false),
});
export type AvatarClip = z.infer<typeof AvatarClip>;

export const VideoClip = ClipBase.extend({
  kind: z.literal('video'),
  assetId: Id,
  transform: Transform.default(TRANSFORM_DEFAULT),
  audio: AudioSettings.default(AUDIO_SETTINGS_DEFAULT),
});
export type VideoClip = z.infer<typeof VideoClip>;

export const ImageClip = ClipBase.extend({
  kind: z.literal('image'),
  assetId: Id,
  transform: Transform.default(TRANSFORM_DEFAULT),
  /** Фон растягивается на весь кадр и игнорирует anchor. */
  fitMode: z.enum(['contain', 'cover', 'fill']).default('contain'),
});
export type ImageClip = z.infer<typeof ImageClip>;

export const TextStyle = z.object({
  fontFamily: z.string().default('Inter'),
  fontSizeRatio: z.number().min(0.01).max(0.5).default(0.06),
  fontWeight: z.number().int().min(100).max(900).default(600),
  color: z.string().default('#FFFFFF'),
  backgroundColor: z.string().nullable().default(null),
  align: z.enum(['left', 'center', 'right']).default('center'),
  shadow: z.boolean().default(true),
});
export type TextStyle = z.infer<typeof TextStyle>;

export const TEXT_STYLE_DEFAULT: TextStyle = TextStyle.parse({});

export const TextClip = ClipBase.extend({
  kind: z.literal('text'),
  text: z.string().max(500),
  style: TextStyle.default(TEXT_STYLE_DEFAULT),
  transform: Transform.default(TRANSFORM_DEFAULT),
});
export type TextClip = z.infer<typeof TextClip>;

export const AudioClip = ClipBase.extend({
  kind: z.literal('audio'),
  assetId: Id,
  audio: AudioSettings.default(AUDIO_SETTINGS_DEFAULT),
  /** Озвучка сцены помечена ссылкой на неё — чтобы двигать вместе с аватаром. */
  sceneId: Id.nullable().default(null),
});
export type AudioClip = z.infer<typeof AudioClip>;

/**
 * Субтитры получаются выравниванием уже известного текста сцены по аудио
 * (forced alignment), а не распознаванием речи: текст у нас есть, ASR добавил
 * бы только ошибки и стоимость.
 */
export const SubtitleCue = z.object({
  id: Id,
  startSec: Seconds,
  endSec: Seconds,
  text: z.string().min(1).max(200),
});
export type SubtitleCue = z.infer<typeof SubtitleCue>;

export const SubtitleClip = ClipBase.extend({
  kind: z.literal('subtitle'),
  sceneId: Id.nullable().default(null),
  cues: z.array(SubtitleCue),
  style: TextStyle.default(TEXT_STYLE_DEFAULT),
});
export type SubtitleClip = z.infer<typeof SubtitleClip>;

export const Clip = z.discriminatedUnion('kind', [
  AvatarClip,
  VideoClip,
  ImageClip,
  TextClip,
  AudioClip,
  SubtitleClip,
]);
export type Clip = z.infer<typeof Clip>;

export function clipEndSec(clip: Clip): number {
  return clip.startSec + clip.durationSec;
}

/** Клипы аватара длительностью не управляются — см. комментарий к AvatarClip. */
export function isDurationLocked(clip: Clip): boolean {
  return clip.kind === 'avatar';
}

export function clipsOverlap(a: Clip, b: Clip): boolean {
  return a.startSec < clipEndSec(b) && b.startSec < clipEndSec(a);
}
