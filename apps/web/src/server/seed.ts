import "server-only";
import { User } from "@avatar/contracts";
import { authService } from "./auth-service";
import { nowIso, userRepository } from "./repositories";

/**
 * Демонстрационная учётная запись.
 *
 * Существует, чтобы платформу можно было открыть и попробовать без регистрации
 * и почтового сервиса: подтверждать адрес письмом пока нечем. Пароль задаётся
 * переменными окружения, а значения по умолчанию годятся только для показа —
 * в рабочей установке их обязательно нужно переопределить.
 *
 * Идентификатор закреплён (`usr_demo`), потому что тем же ключом подписаны
 * демо-проекты, аватары и счёт кредитов в браузерном хранилище. Разъедься
 * идентификаторы — вошедший пользователь увидел бы пустой кабинет.
 */
export const DEMO_USER_ID = "usr_demo";

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "naeimwtg@gmail.com";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "avatar2026demo";

export async function seedIfEmpty(): Promise<void> {
  if (userRepository.findById(DEMO_USER_ID)) return;
  if (userRepository.findByEmail(DEMO_EMAIL)) return;

  const timestamp = nowIso();
  userRepository.insert(
    User.parse({
      id: DEMO_USER_ID,
      firstName: "Наим",
      lastName: "Резаиан",
      email: DEMO_EMAIL,
      // Почта считается подтверждённой: письмо отправить нечем, а требовать
      // подтверждения без возможности его получить — тупик для того, кто
      // открыл платформу впервые.
      emailVerifiedAt: timestamp,
      avatarUrl: null,
      role: "admin",
      status: "active",
      interfaceLanguage: "ru",
      lastLoginAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );

  await authService.setPassword(DEMO_USER_ID, DEMO_PASSWORD);
}
