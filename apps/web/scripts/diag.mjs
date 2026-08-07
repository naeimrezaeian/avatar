import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`failed: ${r.url().slice(0, 80)}`));

await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
console.log('1. Редирект на вход:', page.url().includes('/login') ? 'да' : `нет (${page.url()})`);

await page.getByRole('button', { name: 'Подставить' }).click();
await page.getByRole('button', { name: 'Войти' }).click();
await page.waitForURL('**/dashboard', { timeout: 30000 });
await page.waitForTimeout(3000);
console.log('2. Вход выполнен:', page.url().includes('/dashboard') ? 'да' : 'нет');

const shell = await page.locator('aside').isVisible().catch(() => false);
console.log('3. Боковая навигация видна:', shell ? 'да' : 'нет');

const text = await page.locator('main').innerText();
console.log('4. Содержимое обзора:', text.slice(0, 120).replace(/\n+/g, ' | '));

for (const [label, path] of [['Проекты', '/projects'], ['Аватары', '/avatars'], ['Голоса', '/voices'], ['Тариф', '/billing'], ['Админка', '/admin']]) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const body = await page.locator('main').innerText();
  console.log(`5. ${label}: ${body.trim().length > 20 ? 'отрисовано' : 'ПУСТО'}`);
}

await page.goto(`${base}/projects/prj_demo`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const hasTimeline = await page.getByRole('button', { name: 'Отменить' }).isVisible().catch(() => false);
console.log('6. Шкала с undo:', hasTimeline ? 'да' : 'нет');

console.log('=== ОШИБКИ КОНСОЛИ ===');
console.log(errors.length ? errors.slice(0, 8).join('\n') : '(нет)');

await browser.close();
