import { Asset, UPLOAD_LIMITS, type AssetKind } from "@avatar/contracts";
import { getDb, newId, nowIso } from "./db";

/**
 * Локальная загрузка файлов. Реальная будет идти напрямую в хранилище по
 * presigned-ссылке, минуя сервер приложения, — поэтому здесь такой же контракт:
 * функция возвращает готовый Asset, а не поток байтов.
 */

export type UploadKind = keyof typeof UPLOAD_LIMITS;

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

/**
 * Проверка до чтения файла. Ограничения продиктованы моделью генерации
 * (изображение и аудио — до 10 МБ), и нарушать их бессмысленно: задача всё
 * равно упадёт, но уже после ожидания в очереди.
 */
export function validateFile(file: File, kind: UploadKind): void {
  const limits = UPLOAD_LIMITS[kind];

  if (file.size > limits.maxBytes) {
    throw new UploadValidationError(
      `Файл больше ${formatMb(limits.maxBytes)}: ${file.name} весит ${formatMb(file.size)}`,
    );
  }

  const allowed: readonly string[] = limits.mimeTypes;
  if (!allowed.includes(file.type)) {
    throw new UploadValidationError(`Формат ${file.type || "неизвестен"} не поддерживается`);
  }
}

async function probeImage(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/**
 * Огибающая считается один раз при загрузке и кладётся в ассет: декодировать
 * аудио заново на каждую перерисовку дорожки таймлайна недопустимо.
 */
function buildPeaks(channel: Float32Array, buckets: number): number[] {
  const size = Math.floor(channel.length / buckets) || 1;
  const peaks: number[] = [];

  for (let index = 0; index < buckets; index += 1) {
    const start = index * size;
    let peak = 0;
    for (let offset = 0; offset < size && start + offset < channel.length; offset += 1) {
      const value = Math.abs(channel[start + offset] ?? 0);
      if (value > peak) peak = value;
    }
    peaks.push(Math.min(1, Math.round(peak * 1000) / 1000));
  }

  return peaks;
}

async function probeAudio(
  file: File,
): Promise<{ durationSec: number; waveformPeaks: number[] }> {
  const buffer = await file.arrayBuffer();
  const context = new OfflineAudioContext(1, 1, 44_100);
  const decoded = await context.decodeAudioData(buffer);
  return {
    durationSec: Math.round(decoded.duration * 10) / 10,
    waveformPeaks: buildPeaks(decoded.getChannelData(0), 400),
  };
}

const KIND_BY_UPLOAD: Record<UploadKind, AssetKind> = {
  avatarImage: "image",
  voiceSample: "audio",
  media: "video",
};

export async function uploadFile(input: {
  file: File;
  kind: UploadKind;
  projectId?: string | null;
}): Promise<Asset> {
  validateFile(input.file, input.kind);

  const assetKind: AssetKind = input.file.type.startsWith("image/")
    ? "image"
    : input.file.type.startsWith("audio/")
      ? "audio"
      : input.file.type.startsWith("video/")
        ? "video"
        : KIND_BY_UPLOAD[input.kind];

  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = null;
  let waveformPeaks: number[] | null = null;

  if (assetKind === "image") {
    const size = await probeImage(input.file);
    width = size.width;
    height = size.height;
  } else if (assetKind === "audio") {
    const probed = await probeAudio(input.file);
    durationSec = probed.durationSec;
    waveformPeaks = probed.waveformPeaks;

    if (input.kind === "voiceSample") {
      const limits = UPLOAD_LIMITS.voiceSample;
      if (durationSec < limits.minDurationSec) {
        throw new UploadValidationError(
          `Образец короче ${limits.minDurationSec} с — этого мало для клонирования голоса`,
        );
      }
      if (durationSec > limits.maxDurationSec) {
        throw new UploadValidationError(
          `Образец длиннее ${limits.maxDurationSec} с — обрежьте запись`,
        );
      }
    }
  }

  const id = newId("ast");
  const timestamp = nowIso();
  const asset = Asset.parse({
    id,
    userId: "usr_demo",
    projectId: input.projectId ?? null,
    kind: assetKind,
    origin: "upload",
    name: input.file.name,
    // Адрес, по которому файл будет лежать после переезда на бэкенд; локально
    // ссылка выдаётся из стора blobs через assetObjectUrl().
    url: `local://assets/${id}`,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    durationSec,
    width,
    height,
    waveformPeaks,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const db = await getDb();
  const tx = db.transaction(["assets", "blobs"], "readwrite");
  await Promise.all([
    tx.objectStore("assets").put(asset),
    tx.objectStore("blobs").put(input.file, id),
    tx.done,
  ]);

  return asset;
}

export async function getAssetBlob(assetId: string): Promise<Blob | null> {
  const db = await getDb();
  return (await db.get("blobs", assetId)) ?? null;
}

export async function deleteAssetBlob(assetId: string): Promise<void> {
  const db = await getDb();
  await db.delete("blobs", assetId);
}
