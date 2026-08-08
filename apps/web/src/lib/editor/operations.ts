import {
  AudioClip,
  AvatarClip,
  ImageClip,
  TRACK_ACCEPTS,
  TextClip,
  VideoClip,
  clipEndSec,
  findStyle,
  isDurationLocked,
  type Clip,
  type ClipKind,
  type ProjectDocument,
  type Scene,
  type TrackKind,
} from "@avatar/contracts";

/** Минимальная видимая длительность клипа после обрезки. */
export const MIN_CLIP_DURATION_SEC = 0.2;

/**
 * Сколько длится то, у чего своей длительности нет.
 *
 * У картинки и надписи её не существует в принципе — длительность задаёт монтаж,
 * а не файл. Значения по умолчанию взяты такими, чтобы клип было видно на шкале
 * сразу и не пришлось растягивать его от нуля.
 */
const DEFAULT_IMAGE_DURATION_SEC = 5;
const DEFAULT_TEXT_DURATION_SEC = 3;

function newClipId(): string {
  return `clp_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function clipsOnTrack(
  document: ProjectDocument,
  trackId: string,
  exceptClipId?: string,
): Clip[] {
  return Object.values(document.clips)
    .filter((clip) => clip.trackId === trackId && clip.id !== exceptClipId)
    .sort((a, b) => a.startSec - b.startSec);
}

/**
 * Ограничение позиции соседями по дорожке. Перекрытие клипов на одной дорожке
 * не запрещено технически, но означает, что два источника претендуют на один
 * отрезок времени — при сборке победил бы верхний, и пользователь потерял бы
 * часть материала молча. Поэтому клип упирается в соседа, а не наезжает на него.
 */
export function clampStart(
  document: ProjectDocument,
  clip: Clip,
  desiredStart: number,
): number {
  const neighbours = clipsOnTrack(document, clip.trackId, clip.id);
  const duration = clip.durationSec;
  const desired = Math.max(0, desiredStart);

  // Свободные промежутки дорожки. Позиция выбирается по ним, а не отталкиванием
  // от каждого соседа по очереди: длинный клип, не помещающийся между двумя
  // соседями, при отталкивании оказывался бы поверх одного из них — то есть
  // ровно там, где быть не должен.
  const gaps: Array<{ from: number; to: number }> = [];
  let cursor = 0;

  for (const other of neighbours) {
    if (other.startSec > cursor) gaps.push({ from: cursor, to: other.startSec });
    cursor = Math.max(cursor, clipEndSec(other));
  }
  // Хвост дорожки бесконечен: туда клип помещается всегда.
  gaps.push({ from: cursor, to: Number.POSITIVE_INFINITY });

  let best = cursor;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const gap of gaps) {
    if (gap.to - gap.from < duration) continue;
    const start = Math.min(Math.max(desired, gap.from), gap.to - duration);
    const distance = Math.abs(start - desired);
    if (distance < bestDistance) {
      best = start;
      bestDistance = distance;
    }
  }

  return Math.round(best * 1000) / 1000;
}

/**
 * Точки притяжения: начало таймлайна, курсор воспроизведения и границы всех
 * клипов. Без них выровнять реплику по музыке на глаз практически невозможно.
 */
export function collectSnapPoints(
  document: ProjectDocument,
  options: { playheadSec: number; exceptClipId?: string },
): number[] {
  const points = [0, options.playheadSec];

  for (const clip of Object.values(document.clips)) {
    if (clip.id === options.exceptClipId) continue;
    points.push(clip.startSec, clipEndSec(clip));
  }

  return points;
}

export function snap(value: number, points: number[], thresholdSec: number): number {
  let best = value;
  let bestDistance = thresholdSec;

  for (const point of points) {
    const distance = Math.abs(point - value);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
}

export function moveClip(
  draft: ProjectDocument,
  clipId: string,
  startSec: number,
  trackId?: string,
): void {
  const clip = draft.clips[clipId];
  if (!clip) return;

  if (trackId !== undefined && trackId !== clip.trackId) {
    const track = draft.tracks[trackId];
    // Клип аудио нельзя уронить на дорожку субтитров: дорожка определяет,
    // как содержимое будет собрано.
    if (!track || !TRACK_ACCEPTS[track.kind].includes(clip.kind)) return;
    clip.trackId = trackId;
  }

  clip.startSec = clampStart(draft, clip, startSec);
}

/**
 * Обрезка. Для клипа аватара запрещена: его видео порождено из озвучки, и
 * растягивание рассинхронизирует губы со звуком. Менять длительность нужно
 * правкой текста сцены и повторной генерацией.
 */
export function trimClip(
  draft: ProjectDocument,
  clipId: string,
  edge: "start" | "end",
  seconds: number,
): void {
  const clip = draft.clips[clipId];
  if (!clip || isDurationLocked(clip)) return;

  if (edge === "end") {
    const duration = Math.max(MIN_CLIP_DURATION_SEC, seconds - clip.startSec);
    clip.durationSec = Math.round(duration * 1000) / 1000;
    return;
  }

  const end = clipEndSec(clip);
  const start = Math.max(0, Math.min(seconds, end - MIN_CLIP_DURATION_SEC));
  const delta = start - clip.startSec;

  clip.startSec = Math.round(start * 1000) / 1000;
  clip.durationSec = Math.round((end - start) * 1000) / 1000;
  // Сдвигая левый край, сдвигаем и точку входа в исходный файл — иначе
  // обрезка слева просто выкинула бы начало и подтянула остальное.
  clip.sourceInSec = Math.max(0, clip.sourceInSec + delta);
}

export function removeClips(draft: ProjectDocument, clipIds: string[]): void {
  for (const id of clipIds) delete draft.clips[id];
}

export function duplicateClips(draft: ProjectDocument, clipIds: string[]): string[] {
  const created: string[] = [];

  for (const id of clipIds) {
    const source = draft.clips[id];
    if (!source) continue;

    const copy = {
      ...source,
      id: `clp_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    } as Clip;
    // Копия встаёт сразу за оригиналом, а не поверх него.
    copy.startSec = clampStart(draft, copy, clipEndSec(source));
    draft.clips[copy.id] = copy;
    created.push(copy.id);
  }

  return created;
}

/**
 * Куда встанет новый клип.
 *
 * От курсора воспроизведения — там смотрит пользователь, туда и кладём. Если
 * место занято, clampStart прижмёт клип к свободной стороне соседа: наложение
 * означало бы, что два источника претендуют на один отрезок времени, и при
 * сборке один из них молча пропал бы.
 */
function placeAt(draft: ProjectDocument, clip: Clip, desiredStart: number): Clip {
  clip.startSec = clampStart(draft, clip, Math.max(0, desiredStart));
  return clip;
}

/**
 * Добавление материала на дорожку: музыка, звук, фоновое изображение, видео.
 *
 * Проверяется, что дорожка принимает такой вид клипа: дорожка определяет, как
 * содержимое будет собрано, и звук на дорожке субтитров означал бы не то, что
 * задумано.
 */
export function addMediaClip(
  draft: ProjectDocument,
  input: {
    trackId: string;
    kind: Extract<ClipKind, "image" | "video" | "audio">;
    assetId: string;
    /** Из файла — для аудио и видео; у картинки её нет. */
    durationSec: number | null;
    startSec: number;
  },
): string | null {
  const track = draft.tracks[input.trackId];
  if (!track || !TRACK_ACCEPTS[track.kind].includes(input.kind)) return null;

  const base = {
    id: newClipId(),
    trackId: input.trackId,
    startSec: 0,
    durationSec:
      input.durationSec && input.durationSec > 0
        ? input.durationSec
        : DEFAULT_IMAGE_DURATION_SEC,
    assetId: input.assetId,
  };

  const clip =
    input.kind === "audio"
      ? AudioClip.parse({ ...base, kind: "audio" })
      : input.kind === "video"
        ? VideoClip.parse({ ...base, kind: "video" })
        : ImageClip.parse({ ...base, kind: "image", fitMode: "cover" });

  const placed = placeAt(draft, clip, input.startSec);
  draft.clips[placed.id] = placed;
  return placed.id;
}

export function addTextClip(
  draft: ProjectDocument,
  input: { trackId: string; startSec: number; text?: string },
): string | null {
  const track = draft.tracks[input.trackId];
  if (!track || !TRACK_ACCEPTS[track.kind].includes("text")) return null;

  const clip = TextClip.parse({
    id: newClipId(),
    trackId: input.trackId,
    kind: "text",
    startSec: 0,
    durationSec: DEFAULT_TEXT_DURATION_SEC,
    text: input.text ?? "Новая надпись",
    // Надпись рождается в оформлении проекта, а не в стандартном: иначе выбор
    // стиля не влиял бы ни на что, пока не поправишь каждую вручную.
    style: findStyle(draft.styleId).text,
  });

  const placed = placeAt(draft, clip, input.startSec);
  draft.clips[placed.id] = placed;
  return placed.id;
}

/**
 * Смена стиля оформления проекта.
 *
 * Применяется и к уже созданным клипам: стиль, меняющий вид только будущих
 * сцен, оставлял бы проект наполовину в старом оформлении — то есть делал бы
 * ровно обратное тому, зачем его выбирают. Клипы, которые правили вручную,
 * это тоже затрагивает: выбор стиля — осознанное действие, и его можно отменить.
 */
export function applyDesignStyle(draft: ProjectDocument, styleId: string): void {
  const style = findStyle(styleId);
  draft.styleId = style.id;

  for (const clip of Object.values(draft.clips)) {
    if (clip.kind === "avatar") clip.style = { ...style.avatar };
    if (clip.kind === "text" || clip.kind === "subtitle") clip.style = { ...style.text };
  }
}

export function setClipVolume(draft: ProjectDocument, clipId: string, volumePct: number): void {
  const clip = draft.clips[clipId];
  if (!clip || !("audio" in clip)) return;
  clip.audio.volumePct = volumePct;
}

function findTrackByKind(draft: ProjectDocument, kind: TrackKind): string | null {
  return draft.trackOrder.find((id) => draft.tracks[id]?.kind === kind) ?? null;
}

/**
 * Дорожки, которые пользователь заводит сам.
 *
 * Проект создаётся с четырьмя: аватар, озвучка, фон, музыка. Остальные
 * появляются по требованию — восемь пустых дорожек в новом проекте это шум, а
 * не удобство, но и совсем без них титры оказались бы недостижимы.
 */
export const ADDABLE_TRACKS: Array<{ kind: TrackKind; name: string }> = [
  { kind: "text", name: "Текст" },
  { kind: "image", name: "Изображения" },
  { kind: "sfx", name: "Звуки" },
];

export function addTrack(draft: ProjectDocument, kind: TrackKind): string | null {
  const existing = findTrackByKind(draft, kind);
  if (existing) return existing;

  const preset = ADDABLE_TRACKS.find((item) => item.kind === kind);
  if (!preset) return null;

  const track = {
    id: `trk_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    kind,
    name: preset.name,
    muted: false,
    hidden: false,
    locked: false,
  };

  draft.tracks[track.id] = track;
  draft.trackOrder.push(track.id);
  return track.id;
}

/**
 * Раскладка сцены на дорожки после успешной генерации.
 *
 * Клип аватара и клип озвучки создаются парой и начинаются в одной точке: они
 * описывают один и тот же отрезок речи, и разъехавшись, дали бы рассинхрон.
 * Длительность берётся из озвучки — см. AvatarClip в контрактах.
 */
export function syncSceneClips(draft: ProjectDocument, scene: Scene): void {
  if (scene.durationSec === null || scene.voiceoverAssetId === null) return;

  const avatarTrackId = findTrackByKind(draft, "avatar");
  const voiceTrackId = findTrackByKind(draft, "voiceover");
  if (!avatarTrackId || !voiceTrackId) return;

  // Предикаты объявлены как сужающие: Array.find по размеченному объединению
  // сам тип не сужает, и без этого поля конкретного вида клипа недоступны.
  const clips = Object.values(draft.clips);
  const existingAvatar = clips.find(
    (clip): clip is Extract<Clip, { kind: "avatar" }> =>
      clip.kind === "avatar" && clip.sceneId === scene.id,
  );
  const existingVoice = clips.find(
    (clip): clip is Extract<Clip, { kind: "audio" }> =>
      clip.kind === "audio" && clip.sceneId === scene.id,
  );

  // Новая сцена встаёт в конец таймлайна, уже размещённая остаётся на месте:
  // перегенерация не должна перекладывать смонтированный проект.
  const startSec =
    existingAvatar?.startSec ??
    Object.values(draft.clips).reduce((max, clip) => Math.max(max, clipEndSec(clip)), 0);

  if (existingAvatar) {
    existingAvatar.durationSec = scene.durationSec;
  } else {
    const clip = AvatarClip.parse({
      id: `clp_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      trackId: avatarTrackId,
      kind: "avatar",
      sceneId: scene.id,
      startSec,
      durationSec: scene.durationSec,
      style: findStyle(draft.styleId).avatar,
    });
    draft.clips[clip.id] = clip;
  }

  if (existingVoice) {
    existingVoice.durationSec = scene.durationSec;
    existingVoice.assetId = scene.voiceoverAssetId;
  } else {
    const clip = AudioClip.parse({
      id: `clp_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      trackId: voiceTrackId,
      kind: "audio",
      sceneId: scene.id,
      assetId: scene.voiceoverAssetId,
      startSec,
      durationSec: scene.durationSec,
    });
    draft.clips[clip.id] = clip;
  }
}
