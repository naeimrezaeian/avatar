import { AudioClip, AvatarClip, ProjectDocument, Scene, Track } from "@avatar/contracts";
import { useEditorStore } from "../src/lib/editor/store";
import {
  addMediaClip,
  addTextClip,
  applyDesignStyle,
  clampStart,
  duplicateClips,
  moveClip,
  removeClips,
  snap,
  syncSceneClips,
  trimClip,
} from "../src/lib/editor/operations";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const tracks = [
  Track.parse({ id: "t_avatar", kind: "avatar", name: "Аватар" }),
  Track.parse({ id: "t_voice", kind: "voiceover", name: "Озвучивание" }),
  Track.parse({ id: "t_music", kind: "music", name: "Музыка" }),
  Track.parse({ id: "t_image", kind: "image", name: "Изображения" }),
  Track.parse({ id: "t_text", kind: "text", name: "Текст" }),
];

function baseDocument(): ProjectDocument {
  return ProjectDocument.parse({
    projectId: "p1",
    revision: 3,
    aspectRatio: "16:9",
    scenes: {},
    sceneOrder: [],
    tracks: Object.fromEntries(tracks.map((t) => [t.id, t])),
    trackOrder: tracks.map((t) => t.id),
    clips: {
      c_music_a: AudioClip.parse({
        id: "c_music_a",
        trackId: "t_music",
        kind: "audio",
        assetId: "a1",
        startSec: 0,
        durationSec: 10,
      }),
      c_music_b: AudioClip.parse({
        id: "c_music_b",
        trackId: "t_music",
        kind: "audio",
        assetId: "a2",
        startSec: 20,
        durationSec: 5,
      }),
      c_avatar: AvatarClip.parse({
        id: "c_avatar",
        trackId: "t_avatar",
        kind: "avatar",
        sceneId: "s1",
        startSec: 0,
        durationSec: 12,
      }),
    },
  });
}

const store = useEditorStore;

// --- История ---
store.getState().load(baseDocument());
check("после загрузки история пуста", store.getState().past.length === 0);
check("документ не помечен изменённым", !store.getState().dirty);

store.getState().apply((draft) => moveClip(draft, "c_music_b", 30), { label: "Перемещение" });
check("перемещение записано в историю", store.getState().past.length === 1);
check("клип переместился", store.getState().document!.clips.c_music_b!.startSec === 30);

store.getState().undo();
check("отмена вернула позицию", store.getState().document!.clips.c_music_b!.startSec === 20);
check("шаг ушёл в стек повтора", store.getState().future.length === 1);

store.getState().redo();
check("повтор вернул позицию", store.getState().document!.clips.c_music_b!.startSec === 30);

store.getState().undo();
store.getState().apply((draft) => removeClips(draft, ["c_music_a"]), { label: "Удаление" });
check("новое действие обрывает ветку повтора", store.getState().future.length === 0);
check("клип удалён", store.getState().document!.clips.c_music_a === undefined);
store.getState().undo();
check("отмена вернула удалённый клип", store.getState().document!.clips.c_music_a !== undefined);

// --- Склейка патчей ---
store.getState().load(baseDocument());
for (let position = 21; position <= 30; position += 1) {
  store.getState().apply((draft) => moveClip(draft, "c_music_b", position), {
    label: "Перемещение",
    coalesceKey: "move:c_music_b",
  });
}
check("серия движений склеена в один шаг", store.getState().past.length === 1, `шагов: ${store.getState().past.length}`);
store.getState().undo();
check(
  "одна отмена возвращает в исходную точку",
  store.getState().document!.clips.c_music_b!.startSec === 20,
  `${store.getState().document!.clips.c_music_b!.startSec}`,
);

// --- Перекрытие ---
const doc = baseDocument();
const moved = clampStart(doc, doc.clips.c_music_b!, 5);
check("клип упирается в соседа, а не наезжает", moved === 10, `начало ${moved}`);

store.getState().load(baseDocument());
store.getState().apply((draft) => moveClip(draft, "c_music_b", 5), { label: "Перемещение" });
check(
  "перемещение внахлёст прижимается к границе",
  store.getState().document!.clips.c_music_b!.startSec === 10,
);

// --- Смена дорожки ---
store.getState().load(baseDocument());
store.getState().apply((draft) => moveClip(draft, "c_music_b", 0, "t_voice"), { label: "Дорожка" });
check("аудио перенеслось на дорожку озвучки", store.getState().document!.clips.c_music_b!.trackId === "t_voice");

store.getState().apply((draft) => moveClip(draft, "c_music_b", 0, "t_avatar"), { label: "Дорожка" });
check(
  "аудио не переносится на дорожку аватара",
  store.getState().document!.clips.c_music_b!.trackId === "t_voice",
);

// --- Обрезка ---
store.getState().load(baseDocument());
store.getState().apply((draft) => trimClip(draft, "c_avatar", "end", 6), { label: "Обрезка" });
check(
  "клип аватара не обрезается",
  store.getState().document!.clips.c_avatar!.durationSec === 12,
  `${store.getState().document!.clips.c_avatar!.durationSec} с`,
);

store.getState().apply((draft) => trimClip(draft, "c_music_a", "end", 6), { label: "Обрезка" });
check("обрезка справа меняет длительность", store.getState().document!.clips.c_music_a!.durationSec === 6);

store.getState().load(baseDocument());
store.getState().apply((draft) => trimClip(draft, "c_music_a", "start", 3), { label: "Обрезка" });
const trimmed = store.getState().document!.clips.c_music_a!;
check("обрезка слева сдвигает начало", trimmed.startSec === 3);
check("обрезка слева уменьшает длительность", trimmed.durationSec === 7, `${trimmed.durationSec} с`);
check("обрезка слева сдвигает точку входа в файл", trimmed.sourceInSec === 3, `${trimmed.sourceInSec} с`);

// --- Копирование ---
store.getState().load(baseDocument());
let created: string[] = [];
store.getState().apply((draft) => {
  created = duplicateClips(draft, ["c_music_a"]);
}, { label: "Копирование" });
const copy = store.getState().document!.clips[created[0]!]!;
check("копия встала сразу за оригиналом", copy.startSec === 10, `${copy.startSec} с`);
check("копия сохранила длительность", copy.durationSec === 10);

// --- Притяжение ---
check("притягивается к близкой точке", snap(9.9, [0, 10, 20], 0.3) === 10);
check("не притягивается к далёкой", snap(9.0, [0, 10, 20], 0.3) === 9.0);

// --- Раскладка сцены ---
store.getState().load(baseDocument());
const scene = Scene.parse({
  id: "s_new",
  avatarId: "avt",
  voiceId: "voi",
  scriptText: "Текст",
  voiceoverAssetId: "ast_voice",
  durationSec: 8,
});
store.getState().apply((draft) => syncSceneClips(draft, scene), { label: "Раскладка сцены" });
const clips = Object.values(store.getState().document!.clips);
const avatarClip = clips.find((c) => c.kind === "avatar" && c.sceneId === "s_new");
const voiceClip = clips.find((c) => c.kind === "audio" && c.sceneId === "s_new");
check("создан клип аватара", avatarClip !== undefined);
check("создан клип озвучки", voiceClip !== undefined);
check("пара начинается в одной точке", avatarClip!.startSec === voiceClip!.startSec);
check("длительность взята из озвучки", avatarClip!.durationSec === 8);

const startBefore = avatarClip!.startSec;
store.getState().apply((draft) => syncSceneClips(draft, { ...scene, durationSec: 11 }), {
  label: "Перегенерация",
});
const avatarAfter = Object.values(store.getState().document!.clips).find(
  (c) => c.kind === "avatar" && c.sceneId === "s_new",
)!;
check("перегенерация не переносит клип", avatarAfter.startSec === startBefore);
check("перегенерация обновила длительность", avatarAfter.durationSec === 11);

// --- Материал на дорожках ---
store.getState().load(baseDocument());

let imageId: string | null = null;
store.getState().apply((draft) => {
  imageId = addMediaClip(draft, {
    trackId: "t_image",
    kind: "image",
    assetId: "ast_bg",
    durationSec: null,
    startSec: 3,
  });
}, { label: "Фон" });
const imageClip = store.getState().document!.clips[imageId!];
check("изображение добавлено на дорожку", imageClip?.kind === "image");
check("картинке дана длительность по умолчанию", imageClip!.durationSec === 5);
check("картинка встала под курсором", imageClip!.startSec === 3);
check(
  "фон по умолчанию заполняет кадр",
  imageClip!.kind === "image" && imageClip.fitMode === "cover",
);

let musicId: string | null = null;
store.getState().apply((draft) => {
  musicId = addMediaClip(draft, {
    trackId: "t_music",
    kind: "audio",
    assetId: "ast_music",
    durationSec: 30,
    startSec: 5,
  });
}, { label: "Музыка" });
const musicClip = store.getState().document!.clips[musicId!]!;
check("длительность аудио взята из файла", musicClip.durationSec === 30);
check(
  "клип не наехал на соседа по дорожке",
  musicClip.startSec >= 10,
  `${musicClip.startSec} с`,
);

store.getState().apply((draft) => {
  const rejected = addMediaClip(draft, {
    trackId: "t_music",
    kind: "image",
    assetId: "ast_bg",
    durationSec: null,
    startSec: 0,
  });
  check("картинку не кладут на музыкальную дорожку", rejected === null);
}, { label: "Неверная дорожка" });

let textId: string | null = null;
store.getState().apply((draft) => {
  textId = addTextClip(draft, { trackId: "t_text", startSec: 2 });
}, { label: "Надпись" });
const textClip = store.getState().document!.clips[textId!]!;
check("надпись добавлена", textClip.kind === "text");
check("у надписи есть длительность", textClip.durationSec === 3);

store.getState().undo();
check("добавление отменяется", store.getState().document!.clips[textId!] === undefined);

// --- Стиль оформления ---
store.getState().load(baseDocument());
check("по умолчанию стиль чистый", store.getState().document!.styleId === "sty_clean");

let styledText: string | null = null;
store.getState().apply((draft) => {
  applyDesignStyle(draft, "sty_circle");
  styledText = addTextClip(draft, { trackId: "t_text", startSec: 0 });
}, { label: "Стиль" });

const styled = store.getState().document!;
const styledAvatar = styled.clips.c_avatar!;
const styledLabel = styled.clips[styledText!]!;
check("стиль записан в документ", styled.styleId === "sty_circle");
check(
  "стиль применён к клипу аватара",
  styledAvatar.kind === "avatar" && styledAvatar.style.shape === "circle",
);
check(
  "новая надпись рождается в стиле проекта",
  styledLabel.kind === "text" && styledLabel.style.backgroundColor === "#000000",
);

store.getState().undo();
const restored = store.getState().document!;
const restoredAvatar = restored.clips.c_avatar!;
check(
  "смена стиля отменяется",
  restored.styleId === "sty_clean" &&
    restoredAvatar.kind === "avatar" &&
    restoredAvatar.style.shape === "original",
);

console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
