import { z } from 'zod';
import { Id, IsoDateTime } from './primitives';

/**
 * Требования к паролю. Живут в контрактах, потому что проверять их обязаны обе
 * стороны: клиент — чтобы сказать об ошибке сразу, сервер — потому что на
 * проверку клиента полагаться нельзя.
 *
 * Ограничения по составу символов намеренно мягкие: длина даёт стойкость
 * надёжнее, чем обязательная заглавная буква, а жёсткие правила состава
 * подталкивают к предсказуемым «Пароль1!».
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export const Password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Не короче ${PASSWORD_MIN_LENGTH} символов`)
  .max(PASSWORD_MAX_LENGTH)
  .refine((value) => /\p{L}/u.test(value), 'Должна быть хотя бы одна буква')
  .refine((value) => /\d/.test(value), 'Должна быть хотя бы одна цифра');

export const RegisterInput = z.object({
  firstName: z.string().min(1, 'Укажите имя').max(64),
  lastName: z.string().min(1, 'Укажите фамилию').max(64),
  email: z.email('Проверьте адрес электронной почты'),
  password: Password,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.email('Проверьте адрес электронной почты'),
  password: z.string().min(1, 'Введите пароль'),
});
export type LoginInput = z.infer<typeof LoginInput>;

/**
 * Правка собственного профиля. Почта сюда не входит: её смена — отдельный
 * поток с подтверждением нового адреса, иначе учётную запись можно увести
 * одним полем формы.
 */
export const UpdateProfileInput = z.object({
  firstName: z.string().min(1, 'Укажите имя').max(64),
  lastName: z.string().min(1, 'Укажите фамилию').max(64),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: Password,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

/**
 * Одноразовый токен для подтверждения почты и сброса пароля. Хранится только
 * его хэш: утечка таблицы токенов иначе равносильна возможности войти в любую
 * учётную запись.
 */
export const VerificationPurpose = z.enum(['email_verification', 'password_reset']);
export type VerificationPurpose = z.infer<typeof VerificationPurpose>;

export const VerificationToken = z.object({
  id: Id,
  userId: Id,
  purpose: VerificationPurpose,
  tokenHash: z.string(),
  expiresAt: IsoDateTime,
  usedAt: IsoDateTime.nullable().default(null),
  createdAt: IsoDateTime,
});
export type VerificationToken = z.infer<typeof VerificationToken>;

export const TOKEN_TTL_HOURS = {
  email_verification: 48,
  password_reset: 1,
} as const;

export const AuthErrorCode = z.enum([
  'invalid_credentials',
  'email_taken',
  'email_not_verified',
  'account_blocked',
  'token_invalid',
  'token_expired',
  'weak_password',
]);
export type AuthErrorCode = z.infer<typeof AuthErrorCode>;

/**
 * Сообщения намеренно не различают «нет такого адреса» и «неверный пароль»:
 * иначе форма входа превращается в способ проверить, зарегистрирован ли
 * человек на платформе.
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Неверный адрес электронной почты или пароль',
  email_taken: 'Учётная запись с таким адресом уже существует',
  email_not_verified: 'Подтвердите адрес электронной почты — мы отправили письмо',
  account_blocked: 'Учётная запись заблокирована. Обратитесь к администратору',
  token_invalid: 'Ссылка недействительна',
  token_expired: 'Срок действия ссылки истёк. Запросите новую',
  weak_password: 'Пароль слишком простой',
};
