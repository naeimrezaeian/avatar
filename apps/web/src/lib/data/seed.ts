import {
  Asset,
  Avatar,
  ConsentRecord,
  CreditAccount,
  CreditTransaction,
  Project,
  ProjectDocument,
  Plan,
  Scene,
  User,
  Track,
  Voice,
} from "@avatar/contracts";
import { getDb, nowIso } from "./db";
import { generateSalt, hashPassword } from "@/lib/auth/crypto";

/**
 * Демонстрационная учётная запись. Существует, чтобы платформу можно было
 * открыть и попробовать без регистрации, и живёт только в локальном хранилище
 * браузера. При появлении настоящего бэкенда её здесь быть не должно.
 */
export const DEMO_CREDENTIALS = {
  email: "naeimwtg@gmail.com",
  password: "avatar2026demo",
} as const;

/**
 * Демо-данные первого этапа. Посев идёт один раз: признаком служит наличие
 * счёта кредитов, а не отдельный флаг — счёт создаётся только здесь, и лишняя
 * сущность для этого не нужна.
 */

const USER_ID = "usr_demo";
const CONSENT_DOCUMENT_VERSION = "2026-08-01";

export async function seedIfEmpty(): Promise<void> {
  const db = await getDb();
  if (await db.get("creditAccounts", USER_ID)) return;

  const timestamp = nowIso();

  const likenessConsent = ConsentRecord.parse({
    id: "cns_likeness",
    userId: USER_ID,
    kind: "likeness",
    documentVersion: CONSENT_DOCUMENT_VERSION,
    grantedAt: timestamp,
  });
  const voiceConsent = ConsentRecord.parse({
    id: "cns_voice",
    userId: USER_ID,
    kind: "voice_clone",
    documentVersion: CONSENT_DOCUMENT_VERSION,
    grantedAt: timestamp,
  });

  const portrait = Asset.parse({
    id: "ast_portrait",
    userId: USER_ID,
    kind: "image",
    origin: "upload",
    name: "Портрет.jpg",
    url: "mock://uploads/portrait.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1_840_000,
    width: 1080,
    height: 1350,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const voiceSample = Asset.parse({
    id: "ast_voice_sample",
    userId: USER_ID,
    kind: "audio",
    origin: "upload",
    name: "Образец голоса.wav",
    url: "mock://uploads/voice-sample.wav",
    mimeType: "audio/wav",
    sizeBytes: 2_300_000,
    durationSec: 42,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const voice = Voice.parse({
    id: "voi_demo",
    userId: USER_ID,
    name: "Мой голос",
    language: "ru",
    style: "Спокойный, дикторский",
    source: "upload",
    sampleAssetId: voiceSample.id,
    sampleDurationSec: 42,
    status: "ready",
    consentId: voiceConsent.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const avatar = Avatar.parse({
    id: "avt_demo",
    userId: USER_ID,
    name: "Основной аватар",
    images: [{ id: "img_1", assetId: portrait.id, isPrimary: true, order: 0 }],
    voiceId: voice.id,
    language: "ru",
    status: "ready",
    consentId: likenessConsent.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Второй аватар в обработке — чтобы экраны сразу показывали не только
  // «счастливый» статус.
  const pendingAvatar = Avatar.parse({
    id: "avt_pending",
    userId: USER_ID,
    name: "Аватар для соцсетей",
    images: [{ id: "img_2", assetId: portrait.id, isPrimary: true, order: 0 }],
    voiceId: voice.id,
    language: "ru",
    status: "processing",
    statusMessage: "Подготовка референсных кадров",
    consentId: likenessConsent.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const project = Project.parse({
    id: "prj_demo",
    userId: USER_ID,
    title: "Приветственный ролик",
    description: "Короткое видео для главной страницы сайта",
    aspectRatio: "16:9",
    sceneCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const scene = Scene.parse({
    id: "scn_demo",
    title: "Вступление",
    avatarId: avatar.id,
    voiceId: voice.id,
    scriptText:
      "Здравствуйте! Это демонстрация платформы цифровых аватаров. Текст на этой панели превращается в озвучку, а затем в видео.",
    prompt: "Спокойная поза, лёгкие жесты руками, взгляд в камеру",
  });

  const tracks = [
    Track.parse({ id: "trk_avatar", kind: "avatar", name: "Аватар" }),
    Track.parse({ id: "trk_voice", kind: "voiceover", name: "Озвучивание" }),
    Track.parse({ id: "trk_video", kind: "video", name: "Видео и фон" }),
    Track.parse({ id: "trk_music", kind: "music", name: "Музыка" }),
  ];

  const document = ProjectDocument.parse({
    projectId: project.id,
    revision: 0,
    aspectRatio: project.aspectRatio,
    scenes: { [scene.id]: scene },
    sceneOrder: [scene.id],
    tracks: Object.fromEntries(tracks.map((track) => [track.id, track])),
    trackOrder: tracks.map((track) => track.id),
    clips: {},
  });

  const account = CreditAccount.parse({
    userId: USER_ID,
    balanceSeconds: 2700,
    reservedSeconds: 0,
    expiresAt: "2026-12-31T23:59:59.000Z",
    planId: "plan_pro",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const grant = CreditTransaction.parse({
    id: "ctx_seed",
    userId: USER_ID,
    kind: "grant",
    deltaSeconds: 2700,
    balanceAfterSeconds: 2700,
    note: "Стартовый пакет тарифа",
    createdAt: timestamp,
  });

  const demoUser = User.parse({
    id: USER_ID,
    firstName: "Наим",
    lastName: "Резаиан",
    email: DEMO_CREDENTIALS.email,
    emailVerifiedAt: timestamp,
    role: "admin",
    status: "active",
    interfaceLanguage: "ru",
    lastLoginAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const salt = generateSalt();
  const passwordHash = await hashPassword(DEMO_CREDENTIALS.password, salt);

  // Тарифы по умолчанию. Цены в копейках, чтобы не хранить дробные суммы.
  const plans = [
    Plan.parse({
      id: "plan_free",
      name: "Пробный",
      description: "Знакомство с платформой",
      monthlySeconds: 300,
      maxResolution: "720p",
      maxProjects: 3,
      maxAvatars: 1,
      watermark: true,
      priceMinor: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    Plan.parse({
      id: "plan_pro",
      name: "Профессиональный",
      description: "Для регулярной работы с видео",
      monthlySeconds: 2700,
      maxResolution: "1080p",
      maxProjects: 50,
      maxAvatars: 10,
      watermark: false,
      priceMinor: 490000,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    Plan.parse({
      id: "plan_studio",
      name: "Студия",
      description: "Без ограничений по числу проектов",
      monthlySeconds: 9000,
      maxResolution: "1080p",
      maxProjects: null,
      maxAvatars: null,
      watermark: false,
      priceMinor: 1490000,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  ];

  const tx = db.transaction(
    [
      "users",
      "credentials",
      "consents",
      "assets",
      "voices",
      "avatars",
      "projects",
      "documents",
      "creditAccounts",
      "creditTransactions",
      "plans",
    ],
    "readwrite",
  );

  await Promise.all([
    tx.objectStore("users").put(demoUser),
    tx.objectStore("credentials").put({ userId: USER_ID, salt, hash: passwordHash }),
    tx.objectStore("consents").put(likenessConsent),
    tx.objectStore("consents").put(voiceConsent),
    tx.objectStore("assets").put(portrait),
    tx.objectStore("assets").put(voiceSample),
    tx.objectStore("voices").put(voice),
    tx.objectStore("avatars").put(avatar),
    tx.objectStore("avatars").put(pendingAvatar),
    tx.objectStore("projects").put(project),
    tx.objectStore("documents").put(document),
    tx.objectStore("creditAccounts").put(account),
    tx.objectStore("creditTransactions").put(grant),
    ...plans.map((plan) => tx.objectStore("plans").put(plan)),
    tx.done,
  ]);
}
