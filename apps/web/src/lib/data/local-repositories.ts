import {
  Asset,
  Avatar,
  ConsentRecord,
  CreditAccount,
  Project,
  ProjectDocument,
  RenderVersion,
  Track,
  Voice,
  availableSeconds,
  documentDurationSec,
  estimateCostSeconds,
  type Resolution,
  type TrackKind,
} from "@avatar/contracts";
import { getDb, newId, nowIso } from "./db";
import {
  DocumentConflictError,
  type AssetRepository,
  type AvatarRepository,
  type ConsentRepository,
  type CreditRepository,
  type DocumentRepository,
  type JobRepository,
  type Patch,
  type ProjectRepository,
  type RenderVersionRepository,
  type VoiceRepository,
} from "./ports";
import { abortQuietly } from "./tx";

/**
 * Дорожки, создаваемые вместе с проектом. Остальные (текст, изображения,
 * звуковые эффекты, субтитры) добавляются по мере надобности: восемь пустых
 * дорожек в новом проекте — это шум, а не удобство.
 */
const DEFAULT_TRACKS: Array<{ kind: TrackKind; name: string }> = [
  { kind: "avatar", name: "Аватар" },
  { kind: "voiceover", name: "Озвучивание" },
  { kind: "video", name: "Видео и фон" },
  { kind: "music", name: "Музыка" },
];

function createDefaultDocument(projectId: string, aspectRatio: Project["aspectRatio"]) {
  const tracks: Record<string, Track> = {};
  const trackOrder: string[] = [];

  for (const preset of DEFAULT_TRACKS) {
    const track = Track.parse({
      id: newId("trk"),
      kind: preset.kind,
      name: preset.name,
    });
    tracks[track.id] = track;
    trackOrder.push(track.id);
  }

  return ProjectDocument.parse({
    projectId,
    revision: 0,
    aspectRatio,
    scenes: {},
    sceneOrder: [],
    tracks,
    trackOrder,
    clips: {},
  });
}

export const avatarRepository: AvatarRepository = {
  async list() {
    const db = await getDb();
    const all = await db.getAll("avatars");
    return all.filter((avatar) => avatar.deletedAt === null);
  },

  async get(id) {
    const db = await getDb();
    return (await db.get("avatars", id)) ?? null;
  },

  async create(input) {
    const db = await getDb();
    const timestamp = nowIso();
    const avatar = Avatar.parse({
      id: newId("avt"),
      userId: "usr_demo",
      name: input.name,
      language: input.language,
      images: input.imageAssetIds.map((assetId, index) => ({
        id: newId("img"),
        assetId,
        isPrimary: index === 0,
        order: index,
      })),
      voiceId: input.voiceId,
      // Материалы загружены, но обработка ещё не запускалась.
      status: "materials_uploaded",
      consentId: input.consentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.put("avatars", avatar);
    return avatar;
  },

  async update(id, patch) {
    return updateRecord("avatars", id, patch, Avatar);
  },

  async archive(id) {
    await updateRecord("avatars", id, { archivedAt: nowIso() } as Patch<Avatar>, Avatar);
  },

  async remove(id) {
    await updateRecord("avatars", id, { deletedAt: nowIso() } as Patch<Avatar>, Avatar);
  },
};

export const voiceRepository: VoiceRepository = {
  async list() {
    const db = await getDb();
    const all = await db.getAll("voices");
    return all.filter((voice) => voice.deletedAt === null);
  },

  async get(id) {
    const db = await getDb();
    return (await db.get("voices", id)) ?? null;
  },

  async create(input) {
    const db = await getDb();
    const timestamp = nowIso();
    const voice = Voice.parse({
      id: newId("voi"),
      userId: "usr_demo",
      name: input.name,
      language: input.language,
      source: input.source,
      sampleAssetId: input.sampleAssetId,
      status: "materials_uploaded",
      consentId: input.consentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.put("voices", voice);
    return voice;
  },

  async update(id, patch) {
    return updateRecord("voices", id, patch, Voice);
  },

  async remove(id) {
    await updateRecord("voices", id, { deletedAt: nowIso() } as Patch<Voice>, Voice);
  },
};

export const projectRepository: ProjectRepository = {
  async list(options) {
    const db = await getDb();
    const all = await db.getAll("projects");
    return all
      .filter((project) => project.deletedAt === null)
      .filter((project) => options?.includeArchived === true || project.archivedAt === null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id) {
    const db = await getDb();
    return (await db.get("projects", id)) ?? null;
  },

  async create(input) {
    const db = await getDb();
    const timestamp = nowIso();
    const project = Project.parse({
      id: newId("prj"),
      userId: "usr_demo",
      title: input.title,
      aspectRatio: input.aspectRatio,
      format: input.format ?? "standard",
      defaultAvatarId: input.avatarId,
      defaultVoiceId: input.voiceId,
      participantAvatarIds:
        input.participantAvatarIds ?? (input.avatarId ? [input.avatarId] : []),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Проект и его документ создаются одной транзакцией: проект без документа
    // открывался бы в редакторе как пустой экран без дорожек.
    const tx = db.transaction(["projects", "documents"], "readwrite");
    await Promise.all([
      tx.objectStore("projects").put(project),
      tx.objectStore("documents").put(createDefaultDocument(project.id, project.aspectRatio)),
      tx.done,
    ]);

    return project;
  },

  async update(id, patch) {
    return updateRecord("projects", id, patch, Project);
  },

  async duplicate(id) {
    const db = await getDb();
    const source = await db.get("projects", id);
    if (!source) throw new Error(`Проект ${id} не найден`);
    const sourceDocument = await db.get("documents", id);

    const timestamp = nowIso();
    const copy = Project.parse({
      ...source,
      id: newId("prj"),
      title: `${source.title} — копия`,
      archivedAt: null,
      deletedAt: null,
      lastOpenedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const document = sourceDocument
      ? ProjectDocument.parse({ ...sourceDocument, projectId: copy.id, revision: 0 })
      : createDefaultDocument(copy.id, copy.aspectRatio);

    const tx = db.transaction(["projects", "documents"], "readwrite");
    await Promise.all([
      tx.objectStore("projects").put(copy),
      tx.objectStore("documents").put(document),
      tx.done,
    ]);

    return copy;
  },

  async archive(id) {
    await updateRecord("projects", id, { archivedAt: nowIso() } as Patch<Project>, Project);
  },

  async softDelete(id) {
    await updateRecord("projects", id, { deletedAt: nowIso() } as Patch<Project>, Project);
  },

  async restore(id) {
    await updateRecord(
      "projects",
      id,
      { deletedAt: null, archivedAt: null } as Patch<Project>,
      Project,
    );
  },
};

export const documentRepository: DocumentRepository = {
  async get(projectId) {
    const db = await getDb();
    return (await db.get("documents", projectId)) ?? null;
  },

  async save(document, expectedRevision) {
    const db = await getDb();
    const tx = db.transaction(["documents", "projects"], "readwrite");
    const documents = tx.objectStore("documents");
    const stored = await documents.get(document.projectId);

    if (stored && stored.revision !== expectedRevision) {
      abortQuietly(tx);
      throw new DocumentConflictError(expectedRevision, stored.revision);
    }

    const next = ProjectDocument.parse({ ...document, revision: expectedRevision + 1 });
    await documents.put(next);

    // Кэш длительности и числа сцен в карточке проекта обновляется здесь же:
    // иначе список проектов показывал бы устаревшие цифры до перезагрузки.
    const projects = tx.objectStore("projects");
    const project = await projects.get(document.projectId);
    if (project) {
      await projects.put(
        Project.parse({
          ...project,
          durationSec: documentDurationSec(next),
          sceneCount: next.sceneOrder.length,
          updatedAt: nowIso(),
        }),
      );
    }

    await tx.done;
    return next;
  },
};

export const assetRepository: AssetRepository = {
  async list(filter) {
    const db = await getDb();
    const all =
      filter?.projectId !== undefined
        ? await db.getAllFromIndex("assets", "by-project", filter.projectId)
        : await db.getAll("assets");
    return filter?.kind ? all.filter((asset) => asset.kind === filter.kind) : all;
  },

  async get(id) {
    const db = await getDb();
    return (await db.get("assets", id)) ?? null;
  },

  async create(input) {
    const db = await getDb();
    const timestamp = nowIso();
    const asset = Asset.parse({ ...input, createdAt: timestamp, updatedAt: timestamp });
    await db.put("assets", asset);
    return asset;
  },

  async remove(id) {
    const db = await getDb();
    await db.delete("assets", id);
  },
};

export const consentRepository: ConsentRepository = {
  async listActive(userId) {
    const db = await getDb();
    const all = await db.getAll("consents");
    return all.filter((record) => record.userId === userId && record.revokedAt === null);
  },

  async grant(input) {
    const db = await getDb();
    const record = ConsentRecord.parse({
      id: newId("cns"),
      userId: input.userId,
      kind: input.kind,
      documentVersion: input.documentVersion,
      grantedAt: nowIso(),
    });
    await db.put("consents", record);
    return record;
  },

  async revoke(id) {
    const db = await getDb();
    const record = await db.get("consents", id);
    if (!record) return;
    await db.put("consents", ConsentRecord.parse({ ...record, revokedAt: nowIso() }));
  },
};

export const creditRepository: CreditRepository = {
  async getAccount(userId) {
    const db = await getDb();
    const account = await db.get("creditAccounts", userId);
    if (account) return account;

    const timestamp = nowIso();
    const fresh = CreditAccount.parse({
      userId,
      balanceSeconds: 0,
      reservedSeconds: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.put("creditAccounts", fresh);
    return fresh;
  },

  async listTransactions(userId) {
    const db = await getDb();
    const all = await db.getAllFromIndex("creditTransactions", "by-user", userId);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async estimate({ durationSec, resolution }) {
    const account = await creditRepository.getAccount("usr_demo");
    const costSeconds = estimateCostSeconds(durationSec, resolution);
    const available = availableSeconds(account);
    return {
      durationSec,
      resolution,
      costSeconds,
      availableSeconds: available,
      sufficient: available >= costSeconds,
    };
  },
};

export const jobRepository: JobRepository = {
  async list(filter) {
    const db = await getDb();
    const all =
      filter?.projectId !== undefined
        ? await db.getAllFromIndex("jobs", "by-project", filter.projectId)
        : await db.getAll("jobs");
    const filtered =
      filter?.active === true
        ? all.filter((job) => job.status === "queued" || job.status === "running")
        : all;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id) {
    const db = await getDb();
    return (await db.get("jobs", id)) ?? null;
  },
};

export const renderVersionRepository: RenderVersionRepository = {
  async list(projectId) {
    const db = await getDb();
    const all =
      projectId !== undefined
        ? await db.getAllFromIndex("renderVersions", "by-project", projectId)
        : await db.getAll("renderVersions");
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id) {
    const db = await getDb();
    return (await db.get("renderVersions", id)) ?? null;
  },

  async share(id, expiresInDays) {
    const db = await getDb();
    const version = await db.get("renderVersions", id);
    if (!version) throw new Error(`Версия ${id} не найдена`);

    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
    // Токен непредсказуемый: ссылка на готовое видео с лицом и голосом
    // пользователя не должна подбираться перебором.
    const next = RenderVersion.parse({
      ...version,
      shareToken: crypto.randomUUID().replaceAll("-", ""),
      shareExpiresAt: expiresAt,
      updatedAt: nowIso(),
    });
    await db.put("renderVersions", next);
    return next;
  },

  async revokeShare(id) {
    const db = await getDb();
    const version = await db.get("renderVersions", id);
    if (!version) throw new Error(`Версия ${id} не найдена`);

    const next = RenderVersion.parse({
      ...version,
      shareToken: null,
      shareExpiresAt: null,
      updatedAt: nowIso(),
    });
    await db.put("renderVersions", next);
    return next;
  },

  async remove(id) {
    const db = await getDb();
    const version = await db.get("renderVersions", id);
    if (!version) return;

    // Вместе с версией удаляется её файл: иначе хранилище растёт от роликов,
    // на которые уже ничто не ссылается.
    const tx = db.transaction(["renderVersions", "assets", "blobs"], "readwrite");
    const writes: Promise<unknown>[] = [tx.objectStore("renderVersions").delete(id), tx.done];
    if (version.assetId) {
      writes.push(tx.objectStore("assets").delete(version.assetId));
      writes.push(tx.objectStore("blobs").delete(version.assetId));
    }
    await Promise.all(writes);
  },
};

/** Общая для всех репозиториев запись патча с ревалидацией схемой. */
async function updateRecord<
  Name extends "avatars" | "voices" | "projects",
  Value extends { id: string },
>(
  storeName: Name,
  id: string,
  patch: Patch<Value>,
  schema: { parse: (value: unknown) => Value },
): Promise<Value> {
  const db = await getDb();
  const stored = await db.get(storeName, id);
  if (!stored) throw new Error(`Запись ${id} не найдена в ${storeName}`);

  // Патч проходит через схему, а не пишется напрямую: невалидное частичное
  // обновление иначе осело бы в базе и упало позже, вдали от причины.
  const next = schema.parse({ ...stored, ...patch, updatedAt: nowIso() });
  await db.put(storeName, next as never);
  return next;
}

export function estimateResolutionCost(durationSec: number, resolution: Resolution): number {
  return estimateCostSeconds(durationSec, resolution);
}
