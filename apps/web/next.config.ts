import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Контракты подключены как исходники, без шага сборки: схемы меняются часто,
  // и промежуточный dist только добавлял бы рассинхрон между пакетом и приложением.
  transpilePackages: ["@avatar/contracts"],
  typedRoutes: true,
};

export default nextConfig;
