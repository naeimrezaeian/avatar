/**
 * Хэширование паролей. PBKDF2-SHA256 из WebCrypto — доступен и в браузере, и в
 * Node, дополнительных зависимостей не требует.
 *
 * Пароли не хранятся в открытом виде даже в этой временной локальной
 * реализации. Люди повторяют пароли между сервисами, и утечка открытого
 * пароля вредит человеку далеко за пределами этого приложения. Соль своя у
 * каждой записи, иначе одинаковые пароли давали бы одинаковые хэши.
 */

const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;

export class InsecureContextError extends Error {
  constructor() {
    super(
      "Страница открыта не в защищённом контексте, поэтому браузер не даёт доступ к криптографии. " +
        "Откройте приложение по адресу localhost или 127.0.0.1 — либо запустите сервер по HTTPS, " +
        "если нужен доступ с другого устройства.",
    );
    this.name = "InsecureContextError";
  }
}

/**
 * WebCrypto доступен только в защищённом контексте: по обычному HTTP браузер
 * считает доверенными лишь localhost и 127.0.0.1. При открытии по адресу в
 * локальной сети crypto.subtle отсутствует, и попытка им воспользоваться даёт
 * невнятное «Cannot read properties of undefined». Проверяем явно, чтобы
 * причина и способ исправления были названы сразу.
 */
function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new InsecureContextError();
  return crypto.subtle;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function generateSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await subtle().deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(saltHex) as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_LENGTH_BITS,
  );

  return toHex(bits);
}

/**
 * Сравнение за постоянное время. Обычное === выходит на первом несовпавшем
 * байте, и разница во времени ответа подсказывает, насколько догадка близка.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/** Одноразовый токен для писем. Хранится только его хэш. */
export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", new TextEncoder().encode(token));
  return toHex(digest);
}
