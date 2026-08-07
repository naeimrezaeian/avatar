import "fake-indexeddb/auto";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
  configurable: true,
});

async function main() {
  const { dataClient } = await import("../src/lib/data/index");
  const { seedIfEmpty } = await import("../src/lib/data/seed");
  const { buildSubtitleCues, splitIntoCues, syncSceneSubtitles } = await import(
    "../src/lib/editor/subtitles"
  );
  const { Scene, ProjectDocument, Track } = await import("@avatar/contracts");

  let failures = 0;
  function check(label: string, condition: boolean, detail = "") {
    if (!condition) failures += 1;
    console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  }

  await seedIfEmpty();
  const USER = "usr_demo";

  // --- Настройки ---
  const settings = await dataClient.settings.get();
  check("настройки создаются со значениями по умолчанию", settings.maxUploadMb === 512);
  check("модели включены по умолчанию", settings.ttsEnabled && settings.avatarVideoEnabled);

  const updated = await dataClient.settings.update({ maxUploadMb: 256, announcement: "Тест" });
  check("настройка сохраняется", updated.maxUploadMb === 256);
  check("объявление сохраняется", updated.announcement === "Тест");
  check(
    "повторное чтение возвращает сохранённое",
    (await dataClient.settings.get()).maxUploadMb === 256,
  );

  // --- Журнал ---
  await dataClient.logs.clear();
  await dataClient.logs.write({ level: "info", scope: "test", message: "Первое событие" });
  await dataClient.logs.write({ level: "error", scope: "test", message: "Сбой" });
  await dataClient.logs.write({ level: "warning", scope: "other", message: "Внимание" });

  const allLogs = await dataClient.logs.list();
  check("записи журнала читаются", allLogs.length === 3, `${allLogs.length}`);
  check("журнал отсортирован новыми вперёд", allLogs[0]!.createdAt >= allLogs[2]!.createdAt);
  check("фильтр по уровню работает", (await dataClient.logs.list({ level: "error" })).length === 1);
  check("фильтр по области работает", (await dataClient.logs.list({ scope: "test" })).length === 2);

  await dataClient.logs.clear();
  check("журнал очищается", (await dataClient.logs.list()).length === 0);

  // --- Уведомления ---
  await dataClient.notifications.clear(USER);
  const first = await dataClient.notifications.create({
    userId: USER,
    kind: "job_succeeded",
    title: "Готово",
    body: "Тело",
    href: "/dashboard",
  });
  await dataClient.notifications.create({
    userId: USER,
    kind: "job_failed",
    title: "Ошибка",
  });

  check("уведомления создаются", (await dataClient.notifications.list(USER)).length === 2);
  check("непрочитанных двое", (await dataClient.notifications.unreadCount(USER)) === 2);

  await dataClient.notifications.markRead(first.id);
  check("одно отмечено прочитанным", (await dataClient.notifications.unreadCount(USER)) === 1);

  await dataClient.notifications.markAllRead(USER);
  check("все отмечены прочитанными", (await dataClient.notifications.unreadCount(USER)) === 0);
  check(
    "прочитанные не удаляются",
    (await dataClient.notifications.list(USER)).length === 2,
  );

  await dataClient.notifications.clear(USER);
  check("очистка удаляет всё", (await dataClient.notifications.list(USER)).length === 0);

  // --- Тарифы ---
  const activePlans = await dataClient.plans.list();
  check("посеяны тарифы", activePlans.length === 3, `${activePlans.length}`);
  check(
    "тарифы отсортированы по объёму",
    activePlans[0]!.monthlySeconds <= activePlans[2]!.monthlySeconds,
  );

  await dataClient.plans.setActive("plan_free", false);
  check("отключённый тариф скрыт из выбора", (await dataClient.plans.list()).length === 2);
  check("отключённый виден администратору", (await dataClient.plans.list(true)).length === 3);
  await dataClient.plans.setActive("plan_free", true);

  // --- Субтитры ---
  const shortText = "Первое предложение. Второе предложение!";
  check("текст режется по предложениям", splitIntoCues(shortText).length === 2);

  const longSentence = `${"слово ".repeat(40)}конец.`;
  const longCues = splitIntoCues(longSentence);
  check("длинное предложение разбито", longCues.length > 1, `${longCues.length}`);
  check(
    "строки не длиннее предела",
    longCues.every((cue) => cue.length <= 90),
    `максимум ${Math.max(...longCues.map((c) => c.length))}`,
  );
  check(
    "слова не разрезаются",
    longCues.every((cue) => !cue.startsWith("о ") && !cue.endsWith(" сл")),
  );

  const scene = Scene.parse({
    id: "s1",
    avatarId: "a1",
    voiceId: "v1",
    scriptText: "Здравствуйте! Это проверка субтитров. Третья реплика для полноты картины.",
    durationSec: 12,
  });

  const cues = buildSubtitleCues(scene, 12);
  check("реплик столько же, сколько предложений", cues.length === 3, `${cues.length}`);
  check("первая начинается с нуля", cues[0]!.startSec === 0);
  check("последняя заканчивается ровно на длительности", cues.at(-1)!.endSec === 12);
  check(
    "реплики не перекрываются и не рвутся",
    cues.every((cue, index) => index === 0 || cue.startSec === cues[index - 1]!.endSec),
  );
  check(
    "у каждой реплики есть текст",
    cues.every((cue) => cue.text.trim().length > 0),
  );

  check("пустой текст не даёт реплик", buildSubtitleCues({ ...scene, scriptText: "" }, 12).length === 0);
  check("нулевая длительность не даёт реплик", buildSubtitleCues(scene, 0).length === 0);

  // --- Раскладка субтитров в документ ---
  const track = Track.parse({ id: "t_av", kind: "avatar", name: "Аватар" });
  const document = ProjectDocument.parse({
    projectId: "p1",
    revision: 0,
    aspectRatio: "16:9",
    scenes: { s1: scene },
    sceneOrder: ["s1"],
    tracks: { t_av: track },
    trackOrder: ["t_av"],
    clips: {},
  });

  const draft = structuredClone(document);
  syncSceneSubtitles(draft, scene);
  const subtitleTrack = Object.values(draft.tracks).find((t) => t.kind === "subtitle");
  check("дорожка субтитров создана по требованию", subtitleTrack !== undefined);

  const subtitleClips = Object.values(draft.clips).filter((clip) => clip.kind === "subtitle");
  check("создан один клип субтитров", subtitleClips.length === 1);

  syncSceneSubtitles(draft, scene);
  check(
    "повторный вызов не плодит клипы",
    Object.values(draft.clips).filter((clip) => clip.kind === "subtitle").length === 1,
  );
  check(
    "вторая дорожка субтитров не создаётся",
    Object.values(draft.tracks).filter((t) => t.kind === "subtitle").length === 1,
  );

  // --- Видеоподкаст ---
  const { parseScript, buildOutline, buildPodcastDocument, briefToTurns } = await import(
    "../src/lib/studio/podcast"
  );
  const { PodcastBrief, estimateTurnCount } = await import("@avatar/contracts");

  const alternating = parseScript("Первая реплика.\n\nВторая реплика.\n\nТретья реплика.");
  check("реплики чередуются без разметки", alternating.map((t) => t.role).join(",") === "host,guest,host");

  const marked = parseScript("Гость: Отвечаю первым.\nВедущий: А теперь спрашиваю.");
  check("разметка говорящих уважается", marked[0]?.role === "guest" && marked[1]?.role === "host");
  check("префикс убран из текста", marked[0]?.text === "Отвечаю первым.");

  const outline = buildOutline("Продуктивность", 3);
  check("длина каркаса соответствует времени", outline.length === estimateTurnCount(3), `${outline.length}`);
  check("каркас начинается с ведущего", outline[0]?.role === "host");
  check("каркас заканчивается ведущим", outline.at(-1)?.role === "host");
  check(
    "в каркасе есть задания, а не готовый текст",
    outline.every((t) => t.text.startsWith("[")),
  );

  const brief = PodcastBrief.parse({
    title: "Тестовый выпуск",
    host: { role: "host", avatarId: "avt_demo", voiceId: "voi_demo", displayName: "Ведущий" },
    guest: { role: "guest", avatarId: "avt_pending", voiceId: "voi_demo", displayName: "Гость" },
    content: "Первая.\n\nВторая.\n\nТретья.\n\nЧетвёртая.",
    ownScript: true,
    resolution: "720p",
    aspectRatio: "16:9",
    lengthMinutes: 1,
    sceneInstructions: "Студия с мягким светом",
  });

  const podcastTurns = briefToTurns(brief);
  const doc = buildPodcastDocument("prj_podcast", brief, podcastTurns);

  check("сцен столько же, сколько реплик", doc.sceneOrder.length === 4, `${doc.sceneOrder.length}`);
  const sceneList = doc.sceneOrder.map((id) => doc.scenes[id]!);
  check(
    "аватары чередуются между говорящими",
    sceneList.map((s) => s.avatarId).join(",") === "avt_demo,avt_pending,avt_demo,avt_pending",
  );
  check(
    "роль говорящего сохранена в сцене",
    sceneList.map((s) => s.speakerRole).join(",") === "host,guest,host,guest",
  );
  check(
    "указания к кадру попали в промпт",
    sceneList.every((s) => s.prompt.includes("Студия с мягким светом")),
  );

  const podcastClips = Object.values(doc.clips).sort((a, b) => a.startSec - b.startSec);
  check("создан клип на каждую реплику", podcastClips.length === 4);
  check("клипы идут подряд без наложения", podcastClips.every((clip, index) =>
    index === 0 || clip.startSec >= podcastClips[index - 1]!.startSec + podcastClips[index - 1]!.durationSec - 0.001,
  ));
  check(
    "говорящие разведены по сторонам кадра",
    podcastClips.every((clip) =>
      clip.kind === "avatar"
        ? clip.transform.anchor === (doc.scenes[clip.sceneId]!.speakerRole === "host" ? "left" : "right")
        : true,
    ),
  );
  check("дорожки подкаста созданы", doc.trackOrder.length === 3);

  // --- Оформление аватара ---
  const { AvatarClip, AVATAR_STYLE_DEFAULT } = await import("@avatar/contracts");
  const styled = AvatarClip.parse({
    id: "c1", trackId: "t1", kind: "avatar", sceneId: "s1", startSec: 0, durationSec: 5,
  });
  check("у клипа аватара есть оформление по умолчанию", styled.style.shape === "original");
  check("фон по умолчанию исходный", styled.style.background.kind === "original");
  check("приближение по умолчанию сто процентов", AVATAR_STYLE_DEFAULT.zoomPct === 100);

  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
