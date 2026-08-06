import { SubtitleClip, type ProjectDocument, type Scene } from "@avatar/contracts";

/**
 * Автоматические субтитры.
 *
 * Текст сцены уже известен, поэтому распознавать речь не нужно — нужно
 * разложить известный текст по времени звучания. Настоящее выравнивание
 * (forced alignment) сделает модель на сервере; здесь длительность реплики
 * пропорциональна её длине в знаках. Это приближение, но оно всегда даёт
 * правильный текст — в отличие от распознавания, которое добавило бы ошибки.
 */

/** Максимальная длина строки субтитра: длиннее не прочитать за время показа. */
const MAX_CUE_CHARS = 90;
const MIN_CUE_SEC = 0.8;

export function splitIntoCues(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const cues: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= MAX_CUE_CHARS) {
      cues.push(sentence);
      continue;
    }

    // Длинное предложение режем по словам, а не по символам: разрыв посреди
    // слова читается как опечатка.
    let current = "";
    for (const word of sentence.split(/\s+/)) {
      if (current.length + word.length + 1 > MAX_CUE_CHARS && current.length > 0) {
        cues.push(current);
        current = word;
      } else {
        current = current.length === 0 ? word : `${current} ${word}`;
      }
    }
    if (current.length > 0) cues.push(current);
  }

  return cues;
}

export function buildSubtitleCues(
  scene: Scene,
  durationSec: number,
): Array<{ id: string; startSec: number; endSec: number; text: string }> {
  const texts = splitIntoCues(scene.scriptText);
  if (texts.length === 0 || durationSec <= 0) return [];

  const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
  const cues: Array<{ id: string; startSec: number; endSec: number; text: string }> = [];

  let cursor = 0;
  texts.forEach((text, index) => {
    const share = (text.length / totalChars) * durationSec;
    const length = Math.max(MIN_CUE_SEC, share);
    // Последняя реплика дотягивается ровно до конца, чтобы накопленное
    // округление не оставляло хвост без субтитра.
    const end = index === texts.length - 1 ? durationSec : Math.min(durationSec, cursor + length);

    cues.push({
      id: `cue_${index}`,
      startSec: Math.round(cursor * 100) / 100,
      endSec: Math.round(end * 100) / 100,
      text,
    });
    cursor = end;
  });

  return cues;
}

/**
 * Создаёт или обновляет клип субтитров сцены на дорожке субтитров. Дорожка
 * создаётся при первом обращении: держать её пустой во всех проектах, где
 * субтитры не нужны, — лишний шум на шкале.
 */
export function syncSceneSubtitles(draft: ProjectDocument, scene: Scene): void {
  if (scene.durationSec === null) return;

  const cues = buildSubtitleCues(scene, scene.durationSec);
  if (cues.length === 0) return;

  let trackId = draft.trackOrder.find((id) => draft.tracks[id]?.kind === "subtitle");
  if (!trackId) {
    trackId = `trk_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    draft.tracks[trackId] = {
      id: trackId,
      kind: "subtitle",
      name: "Субтитры",
      muted: false,
      hidden: false,
      locked: false,
    };
    draft.trackOrder.push(trackId);
  }

  const anchor = Object.values(draft.clips).find(
    (clip) => clip.kind === "avatar" && clip.sceneId === scene.id,
  );
  const startSec = anchor?.startSec ?? 0;

  const existing = Object.values(draft.clips).find(
    (clip) => clip.kind === "subtitle" && clip.sceneId === scene.id,
  );

  const clip = SubtitleClip.parse({
    id: existing?.id ?? `clp_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
    trackId,
    kind: "subtitle",
    sceneId: scene.id,
    startSec,
    durationSec: scene.durationSec,
    cues,
  });

  draft.clips[clip.id] = clip;
}
