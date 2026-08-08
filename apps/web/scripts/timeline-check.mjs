/**
 * Проверки шкалы в настоящем браузере.
 *
 * Перетаскивание, обрезка, притяжение и отмена держатся на событиях указателя и
 * на пересчёте пикселей в секунды — воспроизвести это вызовом функций нельзя,
 * а ломается оно молча: клип встаёт не туда, и заметно это только глазами.
 * Поэтому проверки гоняют настоящую мышь по настоящей странице.
 *
 * Запуск: npm run check:timeline (сервер должен быть поднят).
 */

import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";

let failures = 0;
function check(label, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Тон в WAV: настоящий файл нужен, чтобы клип получил длительность из него. */
function wav(seconds, freq = 220) {
  const rate = 22050;
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000), 44 + i * 2);
  }
  return buf;
}

/** Границы клипа из его подписи для чтения с экрана. */
function bounds(label) {
  const match = label.match(/с ([\d.]+) по ([\d.]+) секунду/);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "timeline-"));
  writeFileSync(join(dir, "a.wav"), wav(6));
  writeFileSync(join(dir, "b.wav"), wav(4, 440));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Подставить" }).click();
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });

  // Отдельный проект: демонстрационный уже смонтирован, и его состояние
  // зависело бы от предыдущих запусков.
  await page.goto(`${BASE}/projects/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByLabel("Название проекта").fill(`Проверка шкалы ${Date.now()}`);
  await page.getByRole("button", { name: "Создать проект" }).click();
  await page.waitForURL(/\/projects\/prj_/, { timeout: 20000 });
  await page.waitForTimeout(2000);

  const lane = page.locator(".overflow-x-auto").first();
  const musicInput = 'label[aria-label="Добавить файл на дорожку «Музыка»"] input';

  // --- Добавление ---
  await page.setInputFiles(musicInput, join(dir, "a.wav"));
  await page.waitForTimeout(2500);

  let clips = page.getByRole("button", { name: /по [\d.]+ секунду/ });
  check("клип появился на дорожке", (await clips.count()) === 1, `${await clips.count()}`);

  const first = clips.first();
  let box = await first.boundingBox();
  const pxPerSec = box.width / 6;
  check("длительность взята из файла", Math.abs(box.width / pxPerSec - 6) < 0.1);

  // --- Перетаскивание ---
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerSec * 5, box.y + box.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(600);

  let after = bounds(await first.getAttribute("aria-label"));
  check("клип переехал вправо", after.start > 4.5 && after.start < 5.5, `${after.start} с`);
  check("длительность при переносе не изменилась", Math.abs(after.end - after.start - 6) < 0.2);

  // --- Отмена и повтор ---
  await page.getByRole("button", { name: "Отменить" }).click();
  await page.waitForTimeout(500);
  after = bounds(await first.getAttribute("aria-label"));
  check("отмена вернула клип в начало", after.start === 0, `${after.start} с`);

  await page.getByRole("button", { name: "Повторить" }).click();
  await page.waitForTimeout(500);
  after = bounds(await first.getAttribute("aria-label"));
  check("повтор вернул клип на место", after.start > 4.5, `${after.start} с`);

  await page.getByRole("button", { name: "Отменить" }).click();
  await page.waitForTimeout(500);

  // --- Обрезка правого края ---
  box = await first.boundingBox();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3 - pxPerSec * 2, box.y + box.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(600);

  after = bounds(await first.getAttribute("aria-label"));
  check("правый край обрезан", Math.abs(after.end - 4) < 0.3, `конец ${after.end} с`);
  check("начало при обрезке справа не сдвинулось", after.start === 0);

  // --- Обрезка левого края ---
  box = await first.boundingBox();
  await page.mouse.move(box.x + 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 3 + pxPerSec, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  after = bounds(await first.getAttribute("aria-label"));
  check("левый край обрезан", after.start > 0.7 && after.start < 1.3, `начало ${after.start} с`);
  check("конец при обрезке слева не сдвинулся", Math.abs(after.end - 4) < 0.3);

  await page.getByRole("button", { name: "Отменить" }).click();
  await page.getByRole("button", { name: "Отменить" }).click();
  await page.waitForTimeout(600);
  after = bounds(await first.getAttribute("aria-label"));
  check("две отмены вернули исходные границы", after.start === 0 && Math.abs(after.end - 6) < 0.2);

  // --- Второй клип: перекрытие и притяжение ---
  await page.setInputFiles(musicInput, join(dir, "b.wav"));
  await page.waitForTimeout(2500);

  clips = page.getByRole("button", { name: /по [\d.]+ секунду/ });
  check("второй клип добавлен", (await clips.count()) === 2, `${await clips.count()}`);

  const second = clips.nth(1);
  let secondBounds = bounds(await second.getAttribute("aria-label"));
  check("второй встал за первым, без наложения", secondBounds.start >= 6, `${secondBounds.start} с`);

  // Тянем второй клип на занятое место — он не должен наехать на первый.
  box = await second.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - pxPerSec * 4, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(600);

  secondBounds = bounds(await second.getAttribute("aria-label"));
  const firstBounds = bounds(await first.getAttribute("aria-label"));
  check(
    "клип не наехал на соседа",
    secondBounds.start >= firstBounds.end - 0.05,
    `${secondBounds.start} против ${firstBounds.end}`,
  );
  check(
    "клип притянулся к границе соседа",
    Math.abs(secondBounds.start - firstBounds.end) < 0.1,
    `${secondBounds.start} с`,
  );

  // --- Клип аватара не обрезается ---
  await page.goto(`${BASE}/projects/prj_demo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const voice = page.getByRole("button", { name: "Озвучить реплику" });
  if ((await voice.count()) > 0) {
    await voice.first().click();
    await page.waitForTimeout(9000);
  }

  const avatarClip = page.getByRole("button", { name: /^Вступление, с/ }).first();
  if ((await avatarClip.count()) > 0) {
    const beforeAvatar = bounds(await avatarClip.getAttribute("aria-label"));
    const avatarBox = await avatarClip.boundingBox();
    await page.mouse.move(avatarBox.x + avatarBox.width - 3, avatarBox.y + avatarBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      avatarBox.x + avatarBox.width - 60,
      avatarBox.y + avatarBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForTimeout(600);

    const afterAvatar = bounds(await avatarClip.getAttribute("aria-label"));
    check(
      "клип аватара не обрезается",
      afterAvatar.end - afterAvatar.start === beforeAvatar.end - beforeAvatar.start,
      `${afterAvatar.end - afterAvatar.start} с`,
    );
  } else {
    check("клип аватара найден для проверки блокировки", false, "клипа нет");
  }

  // --- Копирование и удаление ---
  await avatarClip.click();
  await page.waitForTimeout(400);
  const before = await page.getByRole("button", { name: /по [\d.]+ секунду/ }).count();

  await page.getByRole("button", { name: "Копировать клип" }).click();
  await page.waitForTimeout(600);
  check(
    "копирование добавило клип",
    (await page.getByRole("button", { name: /по [\d.]+ секунду/ }).count()) === before + 1,
  );

  await page.getByRole("button", { name: "Удалить клип" }).click();
  await page.waitForTimeout(600);
  check(
    "удаление убрало клип",
    (await page.getByRole("button", { name: /по [\d.]+ секунду/ }).count()) === before,
  );

  await page.getByRole("button", { name: "Отменить" }).click();
  await page.waitForTimeout(600);
  check(
    "отмена вернула удалённый клип",
    (await page.getByRole("button", { name: /по [\d.]+ секунду/ }).count()) === before + 1,
  );

  await browser.close();
  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛЕНО: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`Сервер на ${BASE} недоступен или страница повела себя неожиданно.`);
  console.error(error);
  process.exit(1);
});
