import "fake-indexeddb/auto";
import { dataClient, InsufficientCreditsError } from "../src/lib/data/index";
import { seedIfEmpty } from "../src/lib/data/seed";
import { availableSeconds } from "@avatar/contracts";

const PROJECT = "prj_demo";
const SCENE = "scn_demo";

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function waitForJob(jobId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Задача ${jobId} не завершилась`)), 20_000);
    const unsubscribe = dataClient.generation.subscribe((event) => {
      if (event.jobId !== jobId) return;
      if (event.status === "succeeded" || event.status === "failed" || event.status === "canceled") {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.status);
      }
    });
  });
}

async function main() {
  await seedIfEmpty();

  const account0 = await dataClient.credits.getAccount("usr_demo");
  check("посев создал счёт на 45 минут", account0.balanceSeconds === 2700);
  check("резерв изначально пуст", account0.reservedSeconds === 0);

  // --- Этап 1: озвучка (бесплатная) ---
  const ttsJob = await dataClient.generation.startVoiceover({ projectId: PROJECT, sceneId: SCENE });
  check("озвучка не резервирует кредиты", ttsJob.creditHoldId === null && ttsJob.estimatedCostSeconds === 0);

  const ttsStatus = await waitForJob(ttsJob.id);
  check("озвучка завершилась успешно", ttsStatus === "succeeded", ttsStatus);

  const doc1 = await dataClient.documents.get(PROJECT);
  const scene1 = doc1!.scenes[SCENE]!;
  check("сцена получила аудио-ассет", scene1.voiceoverAssetId !== null);
  check("сцена получила длительность", (scene1.durationSec ?? 0) > 0, `${scene1.durationSec} с`);
  check("записан хэш входных данных озвучки", scene1.voiceoverInputHash !== null);

  // --- Порядок этапов ---
  let orderError: string | null = null;
  try {
    await dataClient.generation.startVideo({ projectId: PROJECT, sceneId: "scn_missing" });
  } catch (error) {
    orderError = (error as Error).message;
  }
  check("несуществующая сцена отклонена", orderError !== null);

  // --- Этап 2: видео (платное) ---
  const before = await dataClient.credits.getAccount("usr_demo");
  const videoJob = await dataClient.generation.startVideo({ projectId: PROJECT, sceneId: SCENE });
  const held = await dataClient.credits.getAccount("usr_demo");
  check("видео зарезервировало кредиты", held.reservedSeconds === videoJob.estimatedCostSeconds, `${held.reservedSeconds} с`);
  check("баланс при резерве не тронут", held.balanceSeconds === before.balanceSeconds);
  check("доступное уменьшилось на резерв", availableSeconds(held) === availableSeconds(before) - videoJob.estimatedCostSeconds);

  const videoStatus = await waitForJob(videoJob.id);
  check("видео завершилось успешно", videoStatus === "succeeded", videoStatus);

  const after = await dataClient.credits.getAccount("usr_demo");
  check("резерв снят после успеха", after.reservedSeconds === 0);
  check("баланс списан ровно на стоимость", after.balanceSeconds === before.balanceSeconds - videoJob.estimatedCostSeconds, `${after.balanceSeconds} с`);

  const doc2 = await dataClient.documents.get(PROJECT);
  check("сцена получила видео-ассет", doc2!.scenes[SCENE]!.videoAssetId !== null);

  const transactions = await dataClient.credits.listTransactions("usr_demo");
  check("создана транзакция списания", transactions.some((t) => t.kind === "spend"));

  // --- Провал задачи возвращает кредиты ---
  const failDoc = await dataClient.documents.get(PROJECT);
  const failScene = { ...failDoc!.scenes[SCENE]!, prompt: "жесты #ошибка" };
  await dataClient.documents.save(
    { ...failDoc!, scenes: { ...failDoc!.scenes, [SCENE]: failScene } },
    failDoc!.revision,
  );

  const beforeFail = await dataClient.credits.getAccount("usr_demo");
  const failJob = await dataClient.generation.startVideo({ projectId: PROJECT, sceneId: SCENE });
  const failStatus = await waitForJob(failJob.id);
  check("задача с маркером упала", failStatus === "failed", failStatus);

  const afterFail = await dataClient.credits.getAccount("usr_demo");
  check("баланс после провала не изменился", afterFail.balanceSeconds === beforeFail.balanceSeconds, `${afterFail.balanceSeconds} с`);
  check("резерв освобождён после провала", afterFail.reservedSeconds === 0);
  check("создана транзакция возврата", (await dataClient.credits.listTransactions("usr_demo")).some((t) => t.kind === "refund"));

  // --- Конфликт версий документа ---
  const docA = await dataClient.documents.get(PROJECT);
  await dataClient.documents.save(docA!, docA!.revision);
  let conflict = false;
  try {
    await dataClient.documents.save(docA!, docA!.revision);
  } catch (error) {
    conflict = (error as Error).name === "DocumentConflictError";
  }
  check("повторное сохранение старой ревизии отклонено", conflict);

  // --- Нехватка кредитов ---
  const account = await dataClient.credits.getAccount("usr_demo");
  const drained = { ...account, balanceSeconds: 1 };
  const db = await (await import("../src/lib/data/db")).getDb();
  await db.put("creditAccounts", drained as never);

  let insufficient = false;
  try {
    await dataClient.generation.startVideo({ projectId: PROJECT, sceneId: SCENE });
  } catch (error) {
    insufficient = error instanceof InsufficientCreditsError;
  }
  check("запуск без кредитов отклонён типизированной ошибкой", insufficient);

  const finalAccount = await dataClient.credits.getAccount("usr_demo");
  check("неудачный запуск ничего не зарезервировал", finalAccount.reservedSeconds === 0);

  // --- Файл озвучки ---
  const voiceAsset = await dataClient.assets.get(scene1.voiceoverAssetId!);
  check("ассет озвучки создан", voiceAsset !== null);
  check("у озвучки есть огибающая", (voiceAsset?.waveformPeaks?.length ?? 0) > 0);
  check(
    "длительность ассета совпадает с длительностью сцены",
    voiceAsset?.durationSec === scene1.durationSec,
  );

  const { getAssetBlob } = await import("../src/lib/data/uploads");
  const voiceBlob = await getAssetBlob(voiceAsset!.id);
  check("файл озвучки сохранён", voiceBlob !== null, `${voiceBlob?.size ?? 0} байт`);

  const header = new Uint8Array(await voiceBlob!.arrayBuffer());
  const riff = String.fromCharCode(...header.slice(0, 4));
  const wave = String.fromCharCode(...header.slice(8, 12));
  check("файл является корректным WAV", riff === "RIFF" && wave === "WAVE", `${riff}/${wave}`);

  const declared = new DataView(header.buffer).getUint32(40, true);
  check(
    "заголовок описывает реальный размер данных",
    declared === header.length - 44,
    `${declared} против ${header.length - 44}`,
  );

  // --- Жизненный цикл проекта ---
  const created = await dataClient.projects.create({
    title: "Проверочный проект",
    aspectRatio: "9:16",
    avatarId: "avt_demo",
    voiceId: "voi_demo",
  });
  const createdDoc = await dataClient.documents.get(created.id);
  check("вместе с проектом создан документ", createdDoc !== null);
  check("документ унаследовал кадр проекта", createdDoc?.aspectRatio === "9:16");
  check("созданы дорожки по умолчанию", (createdDoc?.trackOrder.length ?? 0) === 4);

  const copy = await dataClient.projects.duplicate(created.id);
  const copyDoc = await dataClient.documents.get(copy.id);
  check("копия получила новый идентификатор", copy.id !== created.id);
  check("копия получила собственный документ", copyDoc?.projectId === copy.id);
  check("ревизия копии сброшена", copyDoc?.revision === 0);

  await dataClient.projects.archive(created.id);
  const activeOnly = await dataClient.projects.list();
  check("архивный проект исчез из активных", !activeOnly.some((p) => p.id === created.id));
  const withArchived = await dataClient.projects.list({ includeArchived: true });
  check("архивный проект виден с флагом", withArchived.some((p) => p.id === created.id));

  await dataClient.projects.softDelete(created.id);
  const afterDelete = await dataClient.projects.list({ includeArchived: true });
  check("удалённый проект скрыт даже с флагом", !afterDelete.some((p) => p.id === created.id));

  await dataClient.projects.restore(created.id);
  const afterRestore = await dataClient.projects.list();
  check("восстановленный проект вернулся в активные", afterRestore.some((p) => p.id === created.id));

  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Непойманная ошибка:", error);
  process.exit(1);
});
