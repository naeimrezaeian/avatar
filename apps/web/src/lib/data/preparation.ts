import type { PreparationStatus } from "@avatar/contracts";
import { getDb, nowIso } from "./db";
import { Avatar, Voice } from "@avatar/contracts";

/**
 * Имитация подготовки аватара и голоса. Отдельно от очереди генерации: она не
 * тарифицируется и не порождает задачу, но её статусы обязаны меняться со
 * временем — иначе экраны видели бы только состояние «материалы загружены» и
 * остальные ветки UI остались бы непроверенными.
 */

const STEPS: Array<{ status: PreparationStatus; message: string | null; delayMs: number }> = [
  { status: "processing", message: "Анализ материалов", delayMs: 900 },
  { status: "processing", message: "Подготовка модели", delayMs: 2200 },
  { status: "ready", message: null, delayMs: 2600 },
];

type Kind = "avatars" | "voices";

const listeners = new Set<(kind: Kind, id: string) => void>();

export function onPreparationChange(listener: (kind: Kind, id: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function applyStatus(
  kind: Kind,
  id: string,
  status: PreparationStatus,
  message: string | null,
): Promise<void> {
  const db = await getDb();
  const stored = await db.get(kind, id);
  if (!stored) return;

  const schema = kind === "avatars" ? Avatar : Voice;
  await db.put(
    kind,
    schema.parse({ ...stored, status, statusMessage: message, updatedAt: nowIso() }) as never,
  );

  for (const listener of listeners) listener(kind, id);
}

export function startPreparation(kind: Kind, id: string): void {
  for (const step of STEPS) {
    setTimeout(() => void applyStatus(kind, id, step.status, step.message), step.delayMs);
  }
}
