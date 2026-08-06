import { generationService } from "./generation-engine";
import {
  assetRepository,
  avatarRepository,
  consentRepository,
  creditRepository,
  documentRepository,
  jobRepository,
  projectRepository,
  voiceRepository,
} from "./local-repositories";
import type { DataClient } from "./ports";

/**
 * Единственная точка, где приложение узнаёт, какая реализация портов активна.
 * Переход на HTTP-бэкенд — замена объекта здесь.
 */
export const dataClient: DataClient = {
  avatars: avatarRepository,
  voices: voiceRepository,
  projects: projectRepository,
  documents: documentRepository,
  assets: assetRepository,
  consents: consentRepository,
  credits: creditRepository,
  jobs: jobRepository,
  generation: generationService,
};

export { DocumentConflictError } from "./ports";
export { InsufficientCreditsError } from "./generation-engine";
export type * from "./ports";

/** Ключи кэша запросов. Собраны в одном месте, чтобы инвалидация после мутаций
 *  не расходилась со строками, по которым данные читались. */
export const queryKeys = {
  avatars: ["avatars"] as const,
  avatar: (id: string) => ["avatars", id] as const,
  voices: ["voices"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  document: (projectId: string) => ["documents", projectId] as const,
  assets: (projectId?: string) => ["assets", projectId ?? "all"] as const,
  creditAccount: ["credits", "account"] as const,
  creditTransactions: ["credits", "transactions"] as const,
  jobs: (projectId?: string) => ["jobs", projectId ?? "all"] as const,
};
