import {
  AudioClip,
  AvatarClip,
  TRACK_ACCEPTS,
  clipEndSec,
  isDurationLocked,
  type Clip,
  type ProjectDocument,
  type Scene,
  type TrackKind,
} from "@avatar/contracts";

/** Минимальная видимая длительность клипа после обрезки. */
export const MIN_CLIP_DURATION_SEC = 0.2;

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
  let start = Math.max(0, desiredStart);
  const end = start + clip.durationSec;

  for (const other of neighbours) {
    const otherEnd = clipEndSec(other);
    if (start < otherEnd && other.startSec < end) {
      // Прижимаем к той стороне соседа, которая ближе к желаемой позиции.
      const distanceToLeft = Math.abs(desiredStart + clip.durationSec - other.startSec);
      const distanceToRight = Math.abs(desiredStart - otherEnd);
      start =
        distanceToLeft < distanceToRight
          ? Math.max(0, other.startSec - clip.durationSec)
          : otherEnd;
    }
  }

  return Math.round(start * 1000) / 1000;
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

export function setClipVolume(draft: ProjectDocument, clipId: string, volumePct: number): void {
  const clip = draft.clips[clipId];
  if (!clip || !("audio" in clip)) return;
  clip.audio.volumePct = volumePct;
}

function findTrackByKind(draft: ProjectDocument, kind: TrackKind): string | null {
  return draft.trackOrder.find((id) => draft.tracks[id]?.kind === kind) ?? null;
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
