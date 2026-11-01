// Browser end-to-end test: drives the real UI in headless Chromium against a running stack.
// Screenshots are written to e2e/screenshots/.
import path from 'node:path';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const DIR = import.meta.dirname;
const DATA = path.join(DIR, '..', 'server', 'prisma', 'seed-data');
const RESUMES = path.join(DATA, 'resumes');
const SHOTS = path.join(DIR, 'screenshots');
mkdirSync(SHOTS, { recursive: true });
let failures = 0;

function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

const toast = (text) => page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: text }).first();

try {
  // ---- Protected route redirect ----
  await page.goto(`${BASE}/jobs/new`);
  await page.waitForURL('**/login');
  check('protected route redirects to /login', page.url().endsWith('/login'));

  // ---- Register: server-side validation shown under fields ----
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Full name').fill('Asha Recruiter');
  await page.getByLabel('Work email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Enter a valid email address').waitFor();
  check('register shows field errors', await page.getByText('Password must be at least 8 characters').isVisible());

  const email = `asha${Date.now()}@example.com`;
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Your jobs' }).waitFor();
  check('register lands on dashboard', await page.getByText('No jobs yet').isVisible());
  await page.screenshot({ path: path.join(SHOTS, '1-dashboard-empty.png') });

  // ---- Create job ----
  await page.getByRole('link', { name: 'Create your first job' }).click();
  await page.getByLabel('Job title').fill('Senior Full-Stack Engineer');
  await page.getByLabel('Job description').fill('Too short');
  await page.getByRole('button', { name: 'Create job' }).click();
  check('client validation on short description', await page.getByText('at least 20 characters').isVisible());

  await page.getByLabel('Job description').fill(readFileSync(path.join(DATA, 'job-description.txt'), 'utf8'));
  const skills = page.getByLabel('Required skills');
  for (const s of ['Python', 'React', 'TypeScript']) {
    await skills.fill(s);
    await skills.press('Enter');
  }
  await skills.fill('PostgreSQL, Docker, AWS, FastAPI, python');
  await skills.press('Enter');
  const tagCount = await page.getByRole('button', { name: /^Remove / }).count();
  check('tag input: 7 unique tags', tagCount === 7, `got ${tagCount}`);
  await page.getByRole('button', { name: 'Remove TypeScript' }).click();
  await skills.fill('TypeScript');
  await skills.press('Enter');
  await page.screenshot({ path: path.join(SHOTS, '2-job-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create job' }).click();
  await page.getByRole('heading', { name: 'Senior Full-Stack Engineer' }).waitFor();
  check('job created, on detail page', /\/jobs\/[0-9a-f-]{36}$/.test(page.url()));
  check('toast after create', await toast('Job created').isVisible());
  check('empty candidates state', await page.getByText('No candidates yet').isVisible());

  // ---- Upload ----
  // Playwright can't mix file paths and in-memory files, so pass everything as buffers.
  await page.getByLabel('Choose resume files').setInputFiles([
    ...readdirSync(RESUMES).sort().map((name) => ({
      name,
      mimeType: name.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: readFileSync(path.join(RESUMES, name)),
    })),
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a resume') },
  ]);
  check('txt rejected in browser', await page.getByText('Only PDF and DOCX files are supported').isVisible());
  await page.getByRole('button', { name: 'Upload and score 5 files' }).click();
  await toast('5 resumes uploaded and scored').waitFor({ timeout: 60_000 });
  check('upload toast', true);
  check('per-file result shows parsed name', await page.getByText('Parsed as Priya Sharma').isVisible());

  const rows = page.locator('tbody tr');
  await rows.first().waitFor();
  check('5 candidate rows', (await rows.count()) === 5);
  const firstRow = await rows.first().innerText();
  check('Priya ranked #1 with 87.2', firstRow.includes('#1') && firstRow.includes('Priya Sharma') && firstRow.includes('87.2'));
  await page.screenshot({ path: path.join(SHOTS, '3-job-detail.png'), fullPage: true });

  // ---- Status change ----
  await page.getByLabel('Status for Priya Sharma').selectOption('SHORTLISTED');
  await toast('Priya Sharma marked as shortlisted').waitFor();
  check('status change toast', true);

  // ---- Filters ----
  await page.getByLabel('Status', { exact: true }).selectOption('SHORTLISTED');
  await page.waitForURL(/status=SHORTLISTED/);
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  check('status filter (URL + 1 row)', (await rows.count()) === 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  check('filter survives reload', (await page.getByLabel('Status', { exact: true }).inputValue()) === 'SHORTLISTED');
  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 5);

  const slider = page.getByLabel(/Minimum score/);
  await slider.focus();
  for (let i = 0; i < 8; i++) await slider.press('ArrowRight'); // 8 steps of 5 = 40
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2, null, { timeout: 5000 });
  check('min score 40 filter -> 2 rows', (await rows.count()) === 2);
  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 5);

  // ---- View resume (new tab with presigned URL) ----
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    rows.first().getByRole('button', { name: 'View resume' }).click(),
  ]);
  // Headless Chromium has no PDF viewer, so the signed URL arrives as a download.
  const download = await popup.waitForEvent('download', { timeout: 10_000 });
  check('view resume opens presigned URL', download.url().startsWith('http://localhost:9000/') && download.url().includes('X-Amz-Signature'));
  check('downloaded file is the PDF', readFileSync(await download.path()).subarray(0, 4).toString() === '%PDF');
  await popup.close().catch(() => {});

  // ---- Edit + automatic rescore ----
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByText('Saving will re-score all 5 existing candidates').waitFor();
  for (const s of ['Python', 'React', 'PostgreSQL', 'Docker', 'AWS', 'FastAPI', 'TypeScript']) {
    await page.getByRole('button', { name: `Remove ${s}` }).click();
  }
  await page.getByLabel('Job title').fill('Java Backend Engineer');
  await page.getByLabel('Job description').fill('Backend engineer building Java and Spring Boot microservices with MySQL, Docker and Jenkins.');
  await skills.fill('Java, Spring Boot, MySQL');
  await skills.press('Enter');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await toast('re-scored').waitFor({ timeout: 60_000 });
  await page.getByRole('heading', { name: 'Java Backend Engineer' }).waitFor();
  await page.waitForFunction(() => document.querySelector('tbody tr')?.innerText.includes('Rahul Verma'));
  check('after edit, Rahul ranked #1', (await rows.first().innerText()).includes('#1'));

  // ---- Dashboard card ----
  await page.getByRole('link', { name: '← All jobs' }).click();
  const card = page.getByRole('link', { name: /Java Backend Engineer/ });
  await card.waitFor();
  const cardText = await card.innerText();
  check('dashboard card shows count + top score', cardText.includes('5') && cardText.includes('candidates'), cardText.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(SHOTS, '4-dashboard.png') });

  // ---- Mobile layout ----
  await page.setViewportSize({ width: 390, height: 844 });
  await card.click();
  await page.locator('tbody tr').first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, '5-mobile-detail.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal page overflow on mobile', overflow <= 0, `overflow=${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---- Expired token -> logout ----
  await page.evaluate(() => localStorage.setItem('resume-screener.token', 'garbage.token.value'));
  await page.goto(`${BASE}/`);
  await page.waitForURL('**/login');
  check('invalid stored token -> login page', true);
  check('session expired toast', await toast('session has expired').isVisible());

  // ---- Login + redirect back + delete ----
  await page.goto(`${BASE}/`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('Invalid email or password').waitFor();
  check('wrong password banner', true);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('heading', { name: 'Your jobs' }).waitFor();
  await page.getByRole('link', { name: /Java Backend Engineer/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: path.join(SHOTS, '6-delete-dialog.png') });
  await page.getByRole('button', { name: 'Delete job' }).click();
  await page.getByText('No jobs yet').waitFor();
  check('delete returns to empty dashboard', true);

  // ---- Logout ----
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL('**/login');
  check('logout', true);

  // ---- 404 ----
  await page.goto(`${BASE}/nope`);
  check('404 page', await page.getByText('Page not found').isVisible());
} catch (err) {
  failures++;
  console.log(`FAIL  crashed: ${err.message.split('\n')[0]}`);
  await page.screenshot({ path: path.join(SHOTS, 'crash.png'), fullPage: true });
} finally {
  const relevant = consoleErrors.filter((e) => !/status of (400|401|404)/.test(e));
  check('no unexpected console errors', relevant.length === 0, relevant.join(' | ').slice(0, 300));
  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
  process.exit(failures ? 1 : 0);
}
