import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Inter вместо Geist: интерфейс русскоязычный, нужен кириллический сабсет.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Платформа цифровых аватаров",
    template: "%s · Платформа цифровых аватаров",
  },
  description:
    "Создание видео с цифровым аватаром: клонирование голоса, генерация сцен и монтаж на временной шкале.",
};

export const viewport: Viewport = {
  themeColor: "#0b1712",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      // Класс dark закреплён: тема одна, и правила компонентов с префиксом
      // dark: рассчитаны именно на тёмный фон.
      className={`dark ${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      {/* Высота задана единицами вьюпорта, а не процентами: процент считается от
          высоты родителя, а она здесь auto — цепочка не разрешается, и блоки
          схлопываются до высоты содержимого. */}
      <body className="flex min-h-dvh flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
