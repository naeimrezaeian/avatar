import { z } from 'zod';
import { AspectRatio, Id, IsoDateTime, Resolution, Seconds, SoftDeletable, Timestamps } from './primitives';
import { SpeechSettings, SPEECH_SETTINGS_DEFAULT } from './voice';
import { Clip, Track } from './timeline';
import { SpeakerRole } from './studio';

/**
 * Границы одной генерации у LongCat-Video-Avatar. Сцена длиннее максимума
 * разбивается на несколько генераций, короче минимума — не отправляется вовсе.
 */
export const SCENE_MIN_DURATION_SEC = 5;
export const SCENE_MAX_DURATION_SEC = 600;

/**
 * Сцена — единица генерации, а не единица монтажа. Из неё модель делает один
 * ролик: референсное изображение аватара + озвучка + текстовый промпт.
 * На таймлайне сцене соответствует клип аватара, чью длительность задаёт
 * озвучка (см. AvatarClip).
 *
 * Порядок сцен хранится в sceneOrder документа, а не в поле index: при
 * перетаскивании иначе пришлось бы переписывать все сцены сразу, а патч
 * автосохранения раздувался бы до размеров документа.
 */
export const Scene = z.object({
  id: Id,
  title: z.string().max(120).default(''),
  avatarId: Id,
  voiceId: Id,
  /** Текст для озвучивания. */
  scriptText: z.string().max(5000).default(''),
  /**
   * Промпт управляет тем, что происходит между репликами — жестами, планом,
   * поведением в паузах. Речь задаётся текстом, а не промптом.
   */
  prompt: z.string().max(1000).default(''),
  speech: SpeechSettings.default(SPEECH_SETTINGS_DEFAULT),
  /**
   * Кто произносит реплику в диалоговом формате. null — обычная сцена с одним
   * говорящим; роль нужна, чтобы чередование ведущего и гостя пережило
   * перестановку сцен.
   */
  speakerRole: SpeakerRole.nullable().default(null),

  /** Результат первого этапа: синтезированная озвучка. */
  voiceoverAssetId: Id.nullable().default(null),
  /** Результат второго этапа: видео аватара, порождённое из этой озвучки. */
  videoAssetId: Id.nullable().default(null),

  /**
   * Отпечаток входных данных на момент генерации. Если текущий отпечаток не
   * совпадает — результат устарел, и UI обязан показать это до того, как
   * пользователь соберёт видео из старых кусков.
   */
  voiceoverInputHash: z.string().nullable().default(null),
  videoInputHash: z.string().nullable().default(null),

  /** Длительность озвучки; она же длительность клипа аватара. */
  durationSec: Seconds.nullable().default(null),
});
export type Scene = z.infer<typeof Scene>;

export const SceneGenerationState = z.enum([
  /** Нет текста — генерировать нечего. */
  'empty',
  /** Текст есть, озвучка не сделана. */
  'needs_voiceover',
  /** Озвучка готова, видео не сделано. */
  'needs_video',
  /** Входные данные изменились после генерации. */
  'outdated',
  'ready',
]);
export type SceneGenerationState = z.infer<typeof SceneGenerationState>;

/**
 * Состояние сцены выводится из данных, а не хранится: хранимый статус
 * рассинхронизируется с текстом при любом редактировании.
 * `currentVoiceoverHash` / `currentVideoHash` считает вызывающая сторона,
 * потому что хэш зависит от версии моделей, известной приложению.
 */
export function sceneGenerationState(
  scene: Scene,
  currentVoiceoverHash: string,
  currentVideoHash: string,
): SceneGenerationState {
  if (scene.scriptText.trim().length === 0) return 'empty';
  if (scene.voiceoverAssetId === null) return 'needs_voiceover';
  if (scene.voiceoverInputHash !== currentVoiceoverHash) return 'outdated';
  if (scene.videoAssetId === null) return 'needs_video';
  if (scene.videoInputHash !== currentVideoHash) return 'outdated';
  return 'ready';
}

export const ProjectStatus = z.enum(['draft', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/**
 * Карточка проекта для списков. Отделена от документа: страница со списком
 * проектов не должна тянуть сцены и клипы каждого из них.
 */
export const Project = z
  .object({
    id: Id,
    userId: Id,
    title: z.string().min(1).max(120),
    description: z.string().max(500).default(''),
    /**
     * Выбирается при создании и дальше не меняется: композиция сцен привязана
     * к кадру, смена соотношения сторон задним числом ломает раскладку.
     */
    aspectRatio: AspectRatio,
    defaultResolution: Resolution.default('720p'),
    coverAssetId: Id.nullable().default(null),
    status: ProjectStatus.default('draft'),
    isTemplate: z.boolean().default(false),
    /** Кэш длительности для карточки; источник истины — документ. */
    durationSec: Seconds.default(0),
    sceneCount: z.number().int().nonnegative().default(0),
    lastOpenedAt: IsoDateTime.nullable().default(null),
  })
  .extend(Timestamps.shape)
  .extend(SoftDeletable.shape);
export type Project = z.infer<typeof Project>;

/**
 * Редактируемое содержимое проекта. Сущности хранятся словарями по id, а
 * порядок — отдельными массивами: патчи Immer тогда адресуют конкретный объект
 * (`clips/<id>/startSec`), автосохранение отправляет десятки байт вместо всего
 * документа, а undo/redo получает точные обратные патчи.
 */
export const ProjectDocument = z.object({
  projectId: Id,
  /**
   * Растёт на каждое сохранение. Нужна для контроля конкурентной записи с
   * двух вкладок и как якорь потока патчей.
   */
  revision: z.number().int().nonnegative(),
  aspectRatio: AspectRatio,

  scenes: z.record(Id, Scene),
  sceneOrder: z.array(Id),

  tracks: z.record(Id, Track),
  trackOrder: z.array(Id),

  clips: z.record(Id, Clip),
});
export type ProjectDocument = z.infer<typeof ProjectDocument>;

export function documentDurationSec(document: ProjectDocument): number {
  return Object.values(document.clips).reduce(
    (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
    0,
  );
}

export function clipsOfTrack(document: ProjectDocument, trackId: Id): Clip[] {
  return Object.values(document.clips)
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startSec - b.startSec);
}
