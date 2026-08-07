import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Адреса, по которым приложение открывают в разработке.
 *
 * Сервер разработки принимает запросы только с того имени, с которым запущен
 * (localhost), а остальным отдаёт 403 на статические бандлы. HTML при этом
 * возвращается нормально, поэтому страница открывается, но остаётся без
 * скриптов — и выглядит пустой, без единой ошибки на сервере.
 *
 * Список собирается из сетевых интерфейсов машины: диапазоны в формате CIDR
 * здесь не работают, а вписывать адрес руками пришлось бы после каждой смены
 * сети.
 */
function localOrigins(): string[] {
  const addresses = new Set<string>(["127.0.0.1", "[::1]"]);

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.add(entry.address);
    }
  }

  return [...addresses];
}

const nextConfig: NextConfig = {
  // Контракты подключены как исходники, без шага сборки: схемы меняются часто,
  // и промежуточный dist только добавлял бы рассинхрон между пакетом и приложением.
  transpilePackages: ["@avatar/contracts"],
  typedRoutes: true,
  allowedDevOrigins: localOrigins(),
  experimental: {
    /**
     * Склейка областей видимости в Turbopack переставляет инициализацию модулей
     * местами, когда пакет подключён исходниками (`transpilePackages`) и попадает
     * в общий серверный кусок сразу нескольких обработчиков API. Сборка падает на
     * `Cannot access 'am' before initialization` в contracts/primitives — zod там
     * ещё не инициализирован. Ошибка появляется ровно с двух маршрутов; каждый по
     * отдельности собирается.
     *
     * Отключение стоит немного размера бандла и снимает проблему целиком.
     * Настоящее решение — собирать контракты в отдельный пакет с dist, но тогда
     * между схемами и приложением появляется шаг сборки, который мы намеренно
     * убирали.
     */
    turbopackScopeHoisting: false,
  },
};

export default nextConfig;
