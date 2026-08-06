import type {
  Asset,
  Avatar,
  ConsentRecord,
  CostEstimate,
  CreditAccount,
  CreditTransaction,
  GenerationJob,
  JobEvent,
  Project,
  ProjectDocument,
  Resolution,
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
  startExport(input: { projectId: string; resolution: Resolution }): Promise<GenerationJob>;
  cancel(jobId: string): Promise<void>;
  retry(jobId: string): Promise<GenerationJob>;
  /**
   * Единый поток статусов. Его слушают и тосты, и центр уведомлений, и списки —
   * поэтому подписка одна, а не по одной на каждый экран.
   */
  subscribe(listener: (event: JobEvent) => void): () => void;
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
  generation: GenerationService;
}
