/**
 * Загрузка сценария из файла.
 *
 * Сценарий чаще всего уже написан — в заметках, в Word, в переписке. Заставлять
 * переносить его в браузер абзац за абзацем бессмысленно, поэтому текст берётся
 * из файла целиком и раскладывается по сценам тем же правилом, что и при
 * вставке: пустая строка разделяет реплики.
 *
 * Всё разбирается в браузере, без единой зависимости: .txt и .md — это просто
 * текст, а .docx — zip, из которого нужен один файл. Библиотека ради этого
 * весила бы больше, чем весь разбор.
 */

export class ScriptImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptImportError";
  }
}

export const SCRIPT_IMPORT_ACCEPT =
  ".txt,.md,.markdown,.docx,text/plain,text/markdown," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Больше мегабайта текста — это уже не сценарий ролика. */
const MAX_BYTES = 1024 * 1024;

/** Готовая сцена: реплика и, если файл её подсказал, название. */
export type ScriptPart = { title: string | null; text: string };

export async function parseScriptFile(file: File): Promise<ScriptPart[]> {
  if (file.size > MAX_BYTES) {
    throw new ScriptImportError("Файл больше 1 МБ — для сценария это слишком много");
  }

  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) return plainParts(cleanup(await readDocx(file)));
  if (name.endsWith(".md") || name.endsWith(".markdown")) return markdownParts(await file.text());
  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    return plainParts(cleanup(await file.text()));
  }

  if (name.endsWith(".doc")) {
    throw new ScriptImportError(
      "Старый формат .doc не читается. Пересохраните файл как .docx или .txt",
    );
  }
  if (name.endsWith(".pdf")) {
    throw new ScriptImportError(
      "PDF не читается: в нём хранится вёрстка, а не текст абзацами. Скопируйте текст вручную или сохраните как .docx",
    );
  }

  throw new ScriptImportError("Поддерживаются файлы .txt, .md и .docx");
}

/**
 * Разбивка на сцены. Правило то же, что при вставке текста в панель сценария:
 * пустая строка разделяет реплики. Один общий приём вместо двух разных —
 * иначе вставка и загрузка давали бы разный результат для одного текста.
 */
export function splitIntoScenes(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function plainParts(text: string): ScriptPart[] {
  return splitIntoScenes(text).map((part) => ({ title: null, text: part }));
}

/**
 * Markdown с заголовками.
 *
 * Заголовок — не реплика: озвучивать «Вступление» перед самим вступлением
 * никто не собирался. Поэтому он не превращается в сцену, а даёт имя тем
 * репликам, что идут под ним.
 */
function markdownParts(source: string): ScriptPart[] {
  const parts: ScriptPart[] = [];
  let title: string | null = null;
  let used = false;

  for (const block of cleanup(source.replace(/\r\n?/g, "\n")).split(/\n\s*\n/)) {
    const heading = block.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      title = heading[1]!.trim();
      used = false;
      continue;
    }

    const text = stripMarkdown(block).trim();
    if (text.length === 0) continue;

    // Имя достаётся первой реплике под заголовком: у следующих оно было бы
    // повтором, а различать сцены по одинаковым названиям невозможно.
    parts.push({ title: used ? null : title, text });
    used = true;
  }

  if (parts.length === 0) throw new ScriptImportError("В файле нет текста");
  return parts;
}

function cleanup(text: string): string {
  const result = text
    .replace(/\r\n?/g, "\n")
    // Три и больше переводов строки — тот же разделитель абзацев, что и два.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (result.length === 0) throw new ScriptImportError("В файле нет текста");
  return result;
}

/** Разметка убирается, а текст остаётся: озвучивать «## Заголовок» незачем. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^```[\s\S]*?```$/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1");
}

// --- .docx ---

/**
 * Минимальное чтение zip.
 *
 * Из всего архива нужен один файл — word/document.xml. Полноценный распаковщик
 * для этого не требуется: достаточно найти запись в оглавлении архива и
 * распаковать её потоком, который есть в самом браузере.
 */
async function readDocx(file: File): Promise<string> {
  const buffer = new DataView(await file.arrayBuffer());
  const bytes = new Uint8Array(buffer.buffer);

  const entry = findEntry(buffer, bytes, "word/document.xml");
  if (!entry) {
    throw new ScriptImportError("Это не документ Word: внутри нет word/document.xml");
  }

  const xml = new TextDecoder().decode(await inflate(bytes, entry));
  return docxToText(xml);
}

type ZipEntry = { offset: number; compressedSize: number; method: number };

function findEntry(view: DataView, bytes: Uint8Array, wanted: string): ZipEntry | null {
  // Оглавление архива описано с конца: подпись EOCD ищется в последних 64 КБ.
  const limit = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= limit; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ScriptImportError("Файл повреждён: это не zip-архив");

  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break;

    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));

    if (name === wanted) {
      // Длины имени и «лишнего поля» в локальном заголовке свои: брать их из
      // оглавления нельзя, они там могут отличаться.
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      return {
        offset: localOffset + 30 + localNameLength + localExtraLength,
        compressedSize,
        method,
      };
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

async function inflate(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const data = bytes.subarray(entry.offset, entry.offset + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) {
    throw new ScriptImportError("Внутри архива неизвестный способ сжатия");
  }

  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Текст документа Word. Абзац — это `<w:p>`, а сам текст лежит в `<w:t>`;
 * остальная разметка (стили, правки, нумерация) к сценарию отношения не имеет.
 */
function docxToText(xml: string): string {
  const paragraphs = xml.split(/<w:p[\s>]/).slice(1);

  return paragraphs
    .map((paragraph) => {
      const pieces = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(
        (match) => decodeXml(match[1]!),
      );
      // Разрыв строки внутри абзаца в Word — отдельный тег, а не символ.
      return pieces.join("").replace(/<w:br\s*\/?>/g, "\n").trim();
    })
    .join("\n\n");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}
