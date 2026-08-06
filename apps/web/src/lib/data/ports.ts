import type {
  Asset,
  Avatar,
  ConsentRecord,
  CostEstimate,
  CreditAccount,
  CreditTransaction,
  GenerationJob,
  JobEvent,
  ExportSettings,
  Project,
  ProjectDocument,
  RenderVersion,
  Resolution,
  User,
  Voice,
} from "@avatar/contracts";

/**
 * Порты слоя данных. Приложение работает только с этими интерфейсами, а не с
 * IndexedDB напрямую: на первом этапе за ними стоит локальная реализация, на
 * втором — HTTP, и код экранов при этом не меняется.
 *
 * Сигнатуры намеренно асинхронные даже там, где локальная реализация могла бы
 * ответить синхронно, — иначе UI спроектируется под мгновенные ответы, которых
 * у настоящего API не будет.
 */

export type Patch<T> = Partial<T>;

export interface AvatarRepository {
  list(): Promise<Avatar[]>;
  get(id: string): Promise<Avatar | null>;
  create(input: {
    name: string;
    language: Avatar["language"];
    imageAssetIds: string[];
    voiceId: string | null;
    consentId: string;
  }): Promise<Avatar>;
  update(id: string, patch: Patch<Avatar>): Promise<Avatar>;
  archive(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface VoiceRepository {
  list(): Promise<Voice[]>;
  get(id: string): Promise<Voice | null>;
  create(input: {
    name: string;
    language: Voice["language"];
    source: Voice["source"];
    sampleAssetId: string;
    consentId: string;
  }): Promise<Voice>;
  update(id: string, patch: Patch<Voice>): Promise<Voice>;
  remove(id: string): Promise<void>;
}

export interface ProjectRepository {
  list(options?: { includeArchived?: boolean }): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  create(input: {
    title: string;
    aspectRatio: Project["aspectRatio"];
    avatarId: string | null;
    voiceId: string | null;
  }): Promise<Project>;
  update(id: string, patch: Patch<Project>): Promise<Project>;
  duplicate(id: string): Promise<Project>;
  archive(id: string): Promise<void>;
  /** Мягкое удаление: проект можно восстановить (п.7 ТЗ). */
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/**
 * Конфликт версий документа. Возникает, когда тот же проект отредактировали в
 * другой вкладке: revision на сервере ушёл вперёд.
 */
export class DocumentConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Документ изменён в другом месте: ожидалась версия ${expectedRevision}, актуальная ${actualRevision}`,
    );
    this.name = "DocumentConflictError";
  }
}

export interface DocumentRepository {
  get(projectId: string): Promise<ProjectDocument | null>;
  /**
   * Сохраняет документ, если его revision совпадает с ожидаемым, и возвращает
   * версию с увеличенным номером. Иначе бросает DocumentConflictError —
   * молча перезаписывать чужие правки нельзя.
   */
  save(document: ProjectDocument, expectedRevision: number): Promise<ProjectDocument>;
}

export interface AssetRepository {
  list(filter?: { projectId?: string; kind?: Asset["kind"] }): Promise<Asset[]>;
  get(id: string): Promise<Asset | null>;
  create(input: Omit<Asset, "createdAt" | "updatedAt">): Promise<Asset>;
  remove(id: string): Promise<void>;
}

export interface ConsentRepository {
  listActive(userId: string): Promise<ConsentRecord[]>;
  grant(input: {
    userId: string;
    kind: ConsentRecord["kind"];
    documentVersion: string;
  }): Promise<ConsentRecord>;
  revoke(id: string): Promise<void>;
}

export interface CreditRepository {
  getAccount(userId: string): Promise<CreditAccount>;
  listTransactions(userId: string): Promise<CreditTransaction[]>;
  estimate(input: { durationSec: number; resolution: Resolution }): Promise<CostEstimate>;
}

export interface JobRepository {
  list(filter?: { projectId?: string; active?: boolean }): Promise<GenerationJob[]>;
  get(id: string): Promise<GenerationJob | null>;
}

export interface GenerationService {
  /** Синтез речи по тексту сцены. Дёшево, идёт первым. */
  startVoiceover(input: { projectId: string; sceneId: string }): Promise<GenerationJob>;
  /** Генерация видео из готовой озвучки. Дорого, требует успешного первого этапа. */
  startVideo(input: { projectId: string; sceneId: string }): Promise<GenerationJob>;
  startExport(input: { projectId: string; settings: ExportSettings }): Promise<GenerationJob>;
  cancel(jobId: string): Promise<void>;
  retry(jobId: string): Promise<GenerationJob>;
  /**
   * Единый поток статусов. Его слушают и тосты, и центр уведомлений, и списки —
   * поэтому подписка одна, а не по одной на каждый экран.
   */
  subscribe(listener: (event: JobEvent) => void): () => void;
}

export interface RenderVersionRepository {
  list(projectId?: string): Promise<RenderVersion[]>;
  get(id: string): Promise<RenderVersion | null>;
  /** Публичная ссылка с ограниченным сроком (п.10 ТЗ). */
  share(id: string, expiresInDays: number): Promise<RenderVersion>;
  revokeShare(id: string): Promise<RenderVersion>;
  remove(id: string): Promise<void>;
}

/** Сводка для панели администратора (п.11 ТЗ). */
export type AdminStats = {
  usersTotal: number;
  usersActive: number;
  usersBlocked: number;
  avatarsTotal: number;
  avatarsReady: number;
  projectsTotal: number;
  rendersTotal: number;
  jobsActive: number;
  jobsFailed: number;
  generatedSeconds: number;
  spentSeconds: number;
  grantedSeconds: number;
};

export type AdminUserRow = {
  user: User;
  account: CreditAccount | null;
  projectCount: number;
  avatarCount: number;
  spentSeconds: number;
};

export interface AdminRepository {
  stats(): Promise<AdminStats>;
  listUsers(): Promise<AdminUserRow[]>;
  setRole(userId: string, role: User["role"]): Promise<User>;
  setStatus(userId: string, status: User["status"]): Promise<User>;
  /**
   * Ручная корректировка баланса. Положительное значение начисляет,
   * отрицательное списывает. Пишется транзакция с автором операции — история
   * начислений без указания, кто их сделал, бесполезна при разборе спорных
   * случаев.
   */
  adjustCredits(input: {
    userId: string;
    deltaSeconds: number;
    note: string;
    actorUserId: string;
  }): Promise<CreditAccount>;
  /** Очередь генерации по всем пользователям. */
  listJobs(filter?: { active?: boolean }): Promise<GenerationJob[]>;
}

export interface DataClient {
  avatars: AvatarRepository;
  voices: VoiceRepository;
  projects: ProjectRepository;
  documents: DocumentRepository;
  assets: AssetRepository;
  consents: ConsentRepository;
  credits: CreditRepository;
  jobs: JobRepository;
  renderVersions: RenderVersionRepository;
  admin: AdminRepository;
  notifications: typeof import("./system-repository").notificationRepository;
  logs: typeof import("./system-repository").logRepository;
  plans: typeof import("./system-repository").planRepository;
  settings: typeof import("./system-repository").settingsRepository;
  generation: GenerationService;
}
