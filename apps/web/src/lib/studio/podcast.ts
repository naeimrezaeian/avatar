import {
  AudioClip,
  AvatarClip,
  Scene,
  Track,
  estimateSpeechDurationSec,
  estimateTurnCount,
  SPEECH_SETTINGS_DEFAULT,
  type PodcastBrief,
  type ProjectDocument,
  type SpeakerRole,
} from "@avatar/contracts";
import { newId } from "@/lib/data/db";

/**
 * Сборка видеоподкаста.
 *
 * Отдельной сущности «подкаст» нет намеренно: получается обычный проект с
 * чередующимися сценами. Иначе редактор, экспорт, кредиты и историю пришлось бы
 * поддерживать в двух вариантах, а расходиться они начали бы с первой правки.
 */

/** Явная разметка говорящего в начале строки: «Ведущий: ...». */
const SPEAKER_PREFIX = /^\s*(ведущий|гость|host|guest)\s*[:—-]\s*/i;

function roleFromPrefix(line: string): SpeakerRole | null {
  const match = SPEAKER_PREFIX.exec(line);
  if (!match) return null;
  const marker = match[1]!.toLowerCase();
  return marker === "ведущий" || marker === "host" ? "host" : "guest";
}

export type Turn = { role: SpeakerRole; text: string };

/**
 * Разбор готового сценария на реплики.
 *
 * Если автор разметил говорящих — уважаем разметку: он лучше знает, кто что
 * произносит. Если нет, реплики чередуются по порядку абзацев, начиная с
 * ведущего.
 */
export function parseScript(content: string): Turn[] {
  const lines = content
    .split(/\n\s*\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const marked = lines.some((line) => roleFromPrefix(line) !== null);

  return lines.map((line, index) => {
    const explicit = roleFromPrefix(line);
    return {
      role: explicit ?? (marked ? "host" : index % 2 === 0 ? "host" : "guest"),
      text: line.replace(SPEAKER_PREFIX, "").trim(),
    };
  });
}

/**
 * Построение структуры разговора из темы.
 *
 * Придумать содержательный диалог могла бы языковая модель, которой у нас нет.
 * Поэтому здесь строится каркас: кто говорит, в каком порядке и о чём — а сам
 * текст пишет человек. Подсказки сформулированы как задание, а не как готовая
 * реплика, чтобы никто не принял их за сгенерированный сценарий.
 */
export function buildOutline(topic: string, lengthMinutes: number): Turn[] {
  const turns = estimateTurnCount(lengthMinutes);
  const subject = topic.trim().split(/\n/)[0]?.slice(0, 120) || "тема выпуска";

  const middle = Math.max(0, turns - 3);
  const result: Turn[] = [
    { role: "host", text: `[Приветствие и представление гостя. Тема выпуска: ${subject}]` },
    { role: "guest", text: "[Короткий рассказ о себе и о том, чем занимаетесь]" },
  ];

  for (let index = 0; index < middle; index += 1) {
    const isQuestion = index % 2 === 0;
    result.push({
      role: isQuestion ? "host" : "guest",
      text: isQuestion
        ? `[Вопрос ${Math.floor(index / 2) + 1} по теме «${subject}»]`
        : "[Развёрнутый ответ с примером из практики]",
    });
  }

  result.push({ role: "host", text: "[Итог разговора и прощание со зрителями]" });
  return result;
}

export function briefToTurns(brief: PodcastBrief): Turn[] {
  return brief.ownScript ? parseScript(brief.content) : buildOutline(brief.content, brief.lengthMinutes);
}

/**
 * Документ проекта из задания. Клипы раскладываются сразу: подкаст с двумя
 * говорящими собирается предсказуемо — реплики идут подряд, — и заставлять
 * человека расставлять полтора десятка сцен вручную незачем.
 *
 * Длительность до синтеза берётся из оценки по тексту, а после генерации
 * заменяется фактической — как и в обычных сценах.
 */
export function buildPodcastDocument(
  projectId: string,
  brief: PodcastBrief,
  turns: Turn[],
): ProjectDocument {
  const avatarTrack = Track.parse({ id: newId("trk"), kind: "avatar", name: "Аватар" });
  const voiceTrack = Track.parse({ id: newId("trk"), kind: "voiceover", name: "Озвучивание" });
  const musicTrack = Track.parse({ id: newId("trk"), kind: "music", name: "Музыка" });

  const scenes: Record<string, Scene> = {};
  const sceneOrder: string[] = [];
  const clips: Record<string, AvatarClip | AudioClip> = {};

  let cursorSec = 0;

  turns.forEach((turn, index) => {
    const speaker = turn.role === "host" ? brief.host : brief.guest;
    const durationSec = Math.max(1, estimateSpeechDurationSec(turn.text, SPEECH_SETTINGS_DEFAULT));

    const scene = Scene.parse({
      id: newId("scn"),
      title: `${index + 1}. ${speaker.displayName}`,
      avatarId: speaker.avatarId,
      voiceId: speaker.voiceId,
      scriptText: turn.text,
      speakerRole: turn.role,
      // Постановка кадра общая для выпуска, а роль говорящего добавляется к
      // ней: в кадре должен быть тот, кто сейчас говорит.
      prompt: [
        brief.sceneInstructions.trim(),
        turn.role === "host" ? "Ведущий в кадре, обращается к гостю" : "Гость в кадре, отвечает",
      ]
        .filter(Boolean)
        .join(". "),
    });

    scenes[scene.id] = scene;
    sceneOrder.push(scene.id);

    const avatarClip = AvatarClip.parse({
      id: newId("clp"),
      trackId: avatarTrack.id,
      kind: "avatar",
      sceneId: scene.id,
      startSec: cursorSec,
      durationSec,
      // Говорящие разведены по сторонам кадра — так зритель различает их
      // без подписей.
      transform: { anchor: turn.role === "host" ? "left" : "right" },
    });
    clips[avatarClip.id] = avatarClip;

    cursorSec = Math.round((cursorSec + durationSec) * 1000) / 1000;
  });

  const tracks = [avatarTrack, voiceTrack, musicTrack];

  return {
    projectId,
    revision: 0,
    aspectRatio: brief.aspectRatio,
    scenes,
    sceneOrder,
    tracks: Object.fromEntries(tracks.map((track) => [track.id, track])),
    trackOrder: tracks.map((track) => track.id),
    clips,
  };
}
