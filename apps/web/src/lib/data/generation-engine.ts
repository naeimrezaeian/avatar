import {
  Asset,
  CreditAccount,
  CreditHold,
  CreditTransaction,
  GenerationJob,
  JobEvent,
  ProjectDocument,
  RenderVersion,
  Scene,
  availableSeconds,
  estimateCostSeconds,
  estimateSpeechDurationSec,
  videoInputHash,
  voiceoverInputHash,
  type ExportSettings,
  type JobStage,
} from "@avatar/contracts";
import { getDb, newId, nowIso } from "./db";
import type { GenerationService } from "./ports";
import { createSyntheticSpeechWav, syntheticPeaks } from "./synthetic-audio";
import { abortQuietly } from "./tx";

/**
 * Имитация очереди генерации. Задачи проходят через те же состояния и этапы,
 * что и настоящие, и занимают заметное время — иначе интерфейс спроектируется
 * под мгновенные ответы, которых у моделей не будет.
 */

/** Во сколько раз мок быстрее реальной генерации. */
const SPEED_FACTOR = 40;

/** Маркер в тексте сцены, гарантированно роняющий задачу. Нужен, чтобы
 *  разрабатывать сценарий ошибки, не полагаясь на случайность. */
const FAILURE_MARKER = "#ошибка";

const STAGE_SEQUENCE: Record<GenerationJob["kind"], JobStage[]> = {
  tts: ["waiting", "synthesizing_speech", "done"],
  avatar_video: ["waiting", "generating_video", "done"],
  export: ["waiting", "assembling", "encoding", "uploading", "done"],
};

type Listener = (event: JobEvent) => void;

const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Вкладки одного браузера видят один и тот же прогресс. */
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("avatar-jobs") : null;

if (channel) {
  channel.onmessage = (message: MessageEvent<JobEvent>) => {
    for (const listener of listeners) listener(message.data);
  };
}

function emit(event: JobEvent): void {
  for (const listener of listeners) listener(event);
  channel?.postMessage(event);
}

function toEvent(job: GenerationJob): JobEvent {
  return JobEvent.parse({
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    progressPct: job.progressPct,
    queuePosition: job.queuePosition,
    error: job.error,
    at: nowIso(),
  });
}

async function putJob(job: GenerationJob): Promise<GenerationJob> {
  const db = await getDb();
  await db.put("jobs", job);
  emit(toEvent(job));
  return job;
}

async function readScene(projectId: string, sceneId: string): Promise<{
  document: ProjectDocument;
  scene: Scene;
}> {
  const db = await getDb();
  const document = await db.get("documents", projectId);
  if (!document) throw new Error(`Документ проекта ${projectId} не найден`);
  const scene = document.scenes[sceneId];
  if (!scene) throw new Error(`Сцена ${sceneId} не найдена`);
  return { document, scene };
}

async function patchScene(
  projectId: string,
  sceneId: string,
  patch: Partial<Scene>,
): Promise<void> {
  const db = await getDb();
  const document = await db.get("documents", projectId);
  if (!document) return;
  const scene = document.scenes[sceneId];
  if (!scene) return;

  await db.put(
    "documents",
    ProjectDocument.parse({
      ...document,
      scenes: { ...document.scenes, [sceneId]: Scene.parse({ ...scene, ...patch }) },
    }),
  );
}

/* ------------------------------- Кредиты -------------------------------- */

/**
 * Резервирование кредитов. Проверка баланса и удержание происходят в одной
 * транзакции: раздельные «проверить» и «списать» позволяют двум вкладкам
 * пройти проверку одновременно и увести баланс в минус.
 *
 * Синтез речи не тарифицируется — иначе пользователь платил бы за то, чтобы
 * услышать опечатку в собственном тексте.
 */
async function holdCredits(
  userId: string,
  jobId: string,
  costSeconds: number,
): Promise<CreditHold | null> {
  if (costSeconds <= 0) return null;

  const db = await getDb();
  const tx = db.transaction(["creditAccounts", "creditHolds"], "readwrite");
  const accounts = tx.objectStore("creditAccounts");
  const account = await accounts.get(userId);
  if (!account) {
    abortQuietly(tx);
    throw new Error("Счёт кредитов не найден");
  }

  if (availableSeconds(account) < costSeconds) {
    abortQuietly(tx);
    throw new InsufficientCreditsError(costSeconds, availableSeconds(account));
  }

  const hold = CreditHold.parse({
    id: newId("hld"),
    userId,
    jobId,
    seconds: costSeconds,
    status: "held",
    createdAt: nowIso(),
  });

  await Promise.all([
    accounts.put(
      CreditAccount.parse({
        ...account,
        reservedSeconds: account.reservedSeconds + costSeconds,
        updatedAt: nowIso(),
      }),
    ),
    tx.objectStore("creditHolds").put(hold),
    tx.done,
  ]);

  return hold;
}

async function settleHold(holdId: string, outcome: "committed" | "released"): Promise<void> {
  const db = await getDb();
  const hold = await db.get("creditHolds", holdId);
  if (!hold || hold.status !== "held") return;

  const account = await db.get("creditAccounts", hold.userId);
  if (!account) return;

  const committed = outcome === "committed";
  const nextAccount = CreditAccount.parse({
    ...account,
    // Резерв снимается в обоих случаях; баланс уменьшается только при успехе —
    // за упавшую генерацию пользователь платить не должен.
    balanceSeconds: committed ? account.balanceSeconds - hold.seconds : account.balanceSeconds,
    reservedSeconds: Math.max(0, account.reservedSeconds - hold.seconds),
    updatedAt: nowIso(),
  });

  const transaction = CreditTransaction.parse({
    id: newId("ctx"),
    userId: hold.userId,
    kind: committed ? "spend" : "refund",
    deltaSeconds: committed ? -hold.seconds : 0,
    balanceAfterSeconds: nextAccount.balanceSeconds,
    jobId: hold.jobId,
    note: committed ? "Списание за генерацию" : "Возврат резерва: задача не выполнена",
    createdAt: nowIso(),
  });

  const tx = db.transaction(
    ["creditAccounts", "creditHolds", "creditTransactions"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("creditAccounts").put(nextAccount),
    tx
      .objectStore("creditHolds")
      .put(CreditHold.parse({ ...hold, status: outcome, settledAt: nowIso() })),
    tx.objectStore("creditTransactions").put(transaction),
    tx.done,
  ]);
}

export class InsufficientCreditsError extends Error {
  constructor(
    readonly requiredSeconds: number,
    readonly availableSeconds: number,
  ) {
    super("Недостаточно кредитов для запуска генерации");
    this.name = "InsufficientCreditsError";
  }
}

/* ------------------------------ Выполнение ------------------------------ */

async function createAsset(input: {
  projectId: string;
  kind: Asset["kind"];
  name: string;
  durationSec: number;
}): Promise<Asset> {
  const db = await getDb();
  const timestamp = nowIso();
  const id = newId("ast");

  // Для аудио создаётся настоящий файл: без него нечего рисовать на дорожке,
  // нечего обрезать и нечем проверять синхронизацию в превью. Видео остаётся
  // без содержимого — правдоподобно подделать его нельзя, и превью честно
  // показывает на его месте заглушку.
  const blob = input.kind === "audio" ? createSyntheticSpeechWav(input.durationSec) : null;

  const asset = Asset.parse({
    id,
    userId: "usr_demo",
    projectId: input.projectId,
    kind: input.kind,
    origin: "generated",
    name: input.name,
    url: blob ? `local://assets/${id}` : `mock://generated/${id}`,
    mimeType: input.kind === "audio" ? "audio/wav" : "video/mp4",
    sizeBytes: blob?.size ?? Math.round(input.durationSec * 900_000),
    durationSec: input.durationSec,
    waveformPeaks: blob ? syntheticPeaks(input.durationSec) : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const tx = db.transaction(["assets", "blobs"], "readwrite");
  const writes: Promise<unknown>[] = [tx.objectStore("assets").put(asset), tx.done];
  if (blob) writes.push(tx.objectStore("blobs").put(blob, id));
  await Promise.all(writes);

  return asset;
}

function scheduleAdvance(jobId: string, delayMs: number, step: () => Promise<void>): void {
  const timer = setTimeout(() => {
    timers.delete(jobId);
    void step();
  }, delayMs);
  timers.set(jobId, timer);
}

async function run(jobId: string, options: { shouldFail: boolean; durationSec: number }) {
  const db = await getDb();
  const job = await db.get("jobs", jobId);
  if (!job || job.status === "canceled") return;

  const stages = STAGE_SEQUENCE[job.kind];
  const workStages = stages.slice(1, -1);
  const totalMs = (options.durationSec / SPEED_FACTOR) * 1000 + 600;
  const stepMs = Math.max(120, totalMs / (workStages.length * 5));

  let stageIndex = 0;
  let progress = 0;

  const advance = async () => {
    const current = await db.get("jobs", jobId);
    if (!current || current.status === "canceled") return;

    progress = Math.min(100, progress + 20);
    const stage = workStages[Math.min(stageIndex, workStages.length - 1)] ?? "waiting";

    if (progress >= 100) {
      stageIndex += 1;
      progress = stageIndex < workStages.length ? 0 : 100;
    }

    const finished = stageIndex >= workStages.length;

    if (!finished) {
      await putJob(
        GenerationJob.parse({
          ...current,
          status: "running",
          stage,
          progressPct: Math.round(
            ((stageIndex * 100 + progress) / (workStages.length * 100)) * 100,
          ),
          queuePosition: null,
        }),
      );
      scheduleAdvance(jobId, stepMs, advance);
      return;
    }

    if (options.shouldFail) {
      await failJob(current.id);
      return;
    }

    await completeJob(current.id, options.durationSec);
  };

  await putJob(
    GenerationJob.parse({
      ...job,
      status: "running",
      stage: workStages[0] ?? "waiting",
      progressPct: 0,
      queuePosition: null,
      startedAt: nowIso(),
    }),
  );

  scheduleAdvance(jobId, stepMs, advance);
}

async function completeJob(jobId: string, durationSec: number): Promise<void> {
  const db = await getDb();
  const job = await db.get("jobs", jobId);
  if (!job || job.projectId === null) return;

  const asset =
    job.kind === "tts"
      ? await createAsset({
          projectId: job.projectId,
          kind: "audio",
          name: "Озвучивание сцены",
          durationSec,
        })
      : await createAsset({
          projectId: job.projectId,
          kind: "video",
          name: job.kind === "export" ? "Экспорт проекта" : "Видео сцены",
          durationSec,
        });

  if (job.sceneId !== null) {
    const { scene } = await readScene(job.projectId, job.sceneId);

    if (job.kind === "tts") {
      await patchScene(job.projectId, job.sceneId, {
        voiceoverAssetId: asset.id,
        durationSec,
        voiceoverInputHash: voiceoverInputHash({
          voiceId: scene.voiceId,
          scriptText: scene.scriptText,
          speech: scene.speech,
        }),
      });
    } else if (job.kind === "avatar_video") {
      await patchScene(job.projectId, job.sceneId, {
        videoAssetId: asset.id,
        videoInputHash: videoInputHash({
          avatarId: scene.avatarId,
          referenceAssetId: scene.avatarId,
          prompt: scene.prompt,
          voiceoverAssetId: scene.voiceoverAssetId ?? "",
        }),
      });
    }
  }

  if (job.kind === "export" && job.exportSettings !== null) {
    await createRenderVersion(job, asset, durationSec);
  }

  if (job.creditHoldId !== null) await settleHold(job.creditHoldId, "committed");

  await putJob(
    GenerationJob.parse({
      ...job,
      status: "succeeded",
      stage: "done",
      progressPct: 100,
      resultAssetId: asset.id,
      finishedAt: nowIso(),
    }),
  );
}

/**
 * Готовая версия ролика. Номер считается по уже существующим версиям проекта,
 * а ревизия документа сохраняется вместе с настройками: без неё «создать новую
 * версию» и «вернуться к предыдущей» не имеют определённого смысла — непонятно,
 * из какого состояния проекта собран каждый файл.
 */
async function createRenderVersion(
  job: GenerationJob,
  asset: Asset,
  durationSec: number,
): Promise<void> {
  if (job.projectId === null || job.exportSettings === null) return;

  const db = await getDb();
  const existing = await db.getAllFromIndex("renderVersions", "by-project", job.projectId);
  const document = await db.get("documents", job.projectId);

  const timestamp = nowIso();
  await db.put(
    "renderVersions",
    RenderVersion.parse({
      id: newId("ver"),
      projectId: job.projectId,
      jobId: job.id,
      versionNumber: existing.length + 1,
      documentRevision: document?.revision ?? 0,
      settings: job.exportSettings,
      assetId: asset.id,
      durationSec,
      sizeBytes: asset.sizeBytes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
}

async function failJob(jobId: string): Promise<void> {
  const db = await getDb();
  const job = await db.get("jobs", jobId);
  if (!job) return;

  if (job.creditHoldId !== null) await settleHold(job.creditHoldId, "released");

  await putJob(
    GenerationJob.parse({
      ...job,
      status: "failed",
      progressPct: 0,
      error: {
        code: "internal_error",
        message: "Модель вернула ошибку. Кредиты возвращены на счёт.",
        retryable: true,
      },
      finishedAt: nowIso(),
    }),
  );
}

/* -------------------------------- Сервис -------------------------------- */

async function enqueue(input: {
  kind: GenerationJob["kind"];
  projectId: string;
  sceneId: string | null;
  durationSec: number;
  costSeconds: number;
  shouldFail: boolean;
  exportSettings?: ExportSettings;
}): Promise<GenerationJob> {
  const jobId = newId("job");
  const hold = await holdCredits("usr_demo", jobId, input.costSeconds);

  const timestamp = nowIso();
  const job = await putJob(
    GenerationJob.parse({
      id: jobId,
      userId: "usr_demo",
      kind: input.kind,
      status: "queued",
      stage: "waiting",
      progressPct: 0,
      projectId: input.projectId,
      sceneId: input.sceneId,
      creditHoldId: hold?.id ?? null,
      estimatedCostSeconds: input.costSeconds,
      exportSettings: input.exportSettings ?? null,
      queuePosition: 1,
      estimatedWaitSec: Math.round(input.durationSec / SPEED_FACTOR),
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );

  scheduleAdvance(jobId, 400, () =>
    run(jobId, { shouldFail: input.shouldFail, durationSec: input.durationSec }),
  );

  return job;
}

export const generationService: GenerationService = {
  async startVoiceover({ projectId, sceneId }) {
    const { scene } = await readScene(projectId, sceneId);
    if (scene.scriptText.trim().length === 0) {
      throw new Error("Нельзя озвучить пустой текст");
    }

    const durationSec = estimateSpeechDurationSec(scene.scriptText, scene.speech);
    return enqueue({
      kind: "tts",
      projectId,
      sceneId,
      durationSec,
      // Синтез речи бесплатен: он предшествует дорогой генерации видео и
      // нужен, чтобы пользователь проверил текст до траты кредитов.
      costSeconds: 0,
      shouldFail: scene.scriptText.includes(FAILURE_MARKER),
    });
  },

  async startVideo({ projectId, sceneId }) {
    const { scene } = await readScene(projectId, sceneId);
    if (scene.voiceoverAssetId === null) {
      throw new Error("Сначала нужно синтезировать озвучку: она является входом для видео");
    }

    const durationSec = scene.durationSec ?? 0;
    return enqueue({
      kind: "avatar_video",
      projectId,
      sceneId,
      durationSec,
      costSeconds: estimateCostSeconds(durationSec, "720p"),
      shouldFail: scene.prompt.includes(FAILURE_MARKER),
    });
  },

  async startExport({ projectId, settings }) {
    const db = await getDb();
    const document = await db.get("documents", projectId);
    if (!document) throw new Error(`Документ проекта ${projectId} не найден`);

    const durationSec = Object.values(document.clips).reduce(
      (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
      0,
    );
    if (durationSec === 0) throw new Error("В проекте нет ни одного клипа");

    return enqueue({
      kind: "export",
      projectId,
      sceneId: null,
      durationSec,
      costSeconds: estimateCostSeconds(durationSec, settings.resolution),
      shouldFail: false,
      exportSettings: settings,
    });
  },

  async cancel(jobId) {
    const timer = timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(jobId);
    }

    const db = await getDb();
    const job = await db.get("jobs", jobId);
    if (!job || job.status === "succeeded" || job.status === "failed") return;

    if (job.creditHoldId !== null) await settleHold(job.creditHoldId, "released");

    await putJob(
      GenerationJob.parse({
        ...job,
        status: "canceled",
        error: {
          code: "canceled_by_user",
          message: "Задача отменена. Кредиты возвращены на счёт.",
          retryable: true,
        },
        finishedAt: nowIso(),
      }),
    );
  },

  async retry(jobId) {
    const db = await getDb();
    const job = await db.get("jobs", jobId);
    if (!job) throw new Error(`Задача ${jobId} не найдена`);
    if (job.projectId === null) throw new Error("Задача не привязана к проекту");

    if (job.kind === "tts" && job.sceneId !== null) {
      return generationService.startVoiceover({ projectId: job.projectId, sceneId: job.sceneId });
    }
    if (job.kind === "avatar_video" && job.sceneId !== null) {
      return generationService.startVideo({ projectId: job.projectId, sceneId: job.sceneId });
    }
    if (job.exportSettings === null) throw new Error("У задачи экспорта не сохранены настройки");
    // Повтор собирает ролик ровно теми же параметрами, что и упавшая попытка.
    return generationService.startExport({
      projectId: job.projectId,
      settings: job.exportSettings,
    });
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
