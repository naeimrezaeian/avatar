import "server-only";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Криптография сервера.
 *
 * Пароли хэшируются scrypt, а не PBKDF2, как во временной браузерной
 * реализации: scrypt требует памяти, а не только процессорного времени,
 * поэтому перебор на видеокартах даёт куда меньший выигрыш. В браузере его
 * взять было неоткуда — WebCrypto его не предоставляет; на сервере он есть в
 * стандартной библиотеке.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Параметры по рекомендации OWASP: N=2^16, r=8, p=1. */
const SCRYPT = { N: 65_536, r: 8, p: 1, maxmem: 128 * 65_536 * 8 * 2 };
const KEY_LENGTH = 32;

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const derived = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    KEY_LENGTH,
    SCRYPT,
  );
  return derived.toString("hex");
}

/**
 * Сравнение за постоянное время. Обычное === выходит на первом несовпавшем
 * байте, и разница во времени ответа подсказывает, насколько догадка близка.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Идентификатор сессии: угадать его — то же, что узнать пароль. */
export function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

/** Одноразовый токен для писем. В базе лежит только его хэш. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
