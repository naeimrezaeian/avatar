import { chromium } from 'playwright';

const ROUTES = [
  '/login', '/register', '/forgot-password',
  '/dashboard', '/projects', '/projects/new', '/avatars', '/voices',
  '/library', '/videos', '/billing', '/notifications', '/settings', '/history',
  '/podcast', '/podcast/new',
  '/admin', '/admin/users', '/admin/queue', '/admin/plans', '/admin/settings', '/admin/logs',
  '/projects/prj_demo', '/projects/prj_demo/studio',
];

function lum(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return null;
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Подставить' }).click();
await page.getByRole('button', { name: 'Войти' }).click();
await page.waitForURL('**/dashboard');
await page.waitForTimeout(2000);

let problems = 0;

for (const route of ROUTES) {
  const errs = [];
  const onErr = (e) => errs.push(e.message.slice(0, 100));
  page.on('pageerror', onErr);

  await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const found = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('main *, aside *')) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 8000) continue;
      if (el.tagName === 'CANVAS' || el.tagName === 'VIDEO') continue;
      const s = getComputedStyle(el);
      out.push({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 60),
        bg: s.backgroundColor,
        color: s.color,
        area: Math.round(r.width * r.height),
      });
    }
    return out;
  });

  const dark = found.filter((e) => {
    const l = lum(e.bg);
    return l !== null && l < 0.25 && !e.bg.includes('rgba(0, 0, 0, 0)');
  });
  const paleText = found.filter((e) => {
    const lc = lum(e.color);
    const lb = lum(e.bg);
    return lc !== null && lc > 0.85 && (lb === null || lb > 0.7);
  });

  const issues = [...dark.map((e) => `тёмный фон: ${e.tag}.${e.cls}`),
                  ...paleText.map((e) => `светлый текст на светлом: ${e.tag}.${e.cls}`)];

  if (issues.length || errs.length) {
    problems += issues.length + errs.length;
    console.log(`\n${route}`);
    issues.slice(0, 3).forEach((i) => console.log('  ⚠ ' + i));
    errs.slice(0, 2).forEach((e) => console.log('  ✖ ошибка: ' + e));
  } else {
    console.log(`ok  ${route}`);
  }

  page.off('pageerror', onErr);
}

console.log(problems === 0 ? '\nВСЕ СТРАНИЦЫ ЧИСТЫЕ' : `\nНАЙДЕНО ЗАМЕЧАНИЙ: ${problems}`);
await browser.close();
