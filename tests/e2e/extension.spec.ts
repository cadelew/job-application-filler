import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const fixturesDir = path.join(root, 'tests/fixtures');

/** Paths for chrome.scripting.executeScript — relative to extension root (no leading slash at runtime). */
const CONTENT_SCRIPT_FILE = 'content-scripts/autofill.js';

/**
 * Production manifest uses only activeTab (user gesture). Playwright cannot click
 * the toolbar action reliably, so e2e temporarily adds localhost host permissions
 * to the *built* output before loading the extension. `pnpm build` stays clean.
 */
async function grantLocalhostHostPermission(): Promise<void> {
  const manifestPath = path.join(extensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    host_permissions?: string[];
  };
  const needed = ['http://127.0.0.1/*', 'http://localhost/*'];
  const existing = new Set(manifest.host_permissions ?? []);
  for (const p of needed) existing.add(p);
  manifest.host_permissions = [...existing];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

const SAMPLE_PROFILE = {
  version: 1 as const,
  personal: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    preferredName: 'Ada',
    email: 'ada@example.com',
    phone: '555-0100',
    location: 'London, UK',
    addressLine1: '1 Analytical Engine Rd',
    addressLine2: '',
    city: 'London',
    state: 'England',
    postalCode: 'EC1A 1BB',
    country: 'UK',
  },
  links: {
    linkedin: 'https://linkedin.com/in/ada',
    github: 'https://github.com/ada',
    portfolio: 'https://ada.dev',
    website: 'https://ada.dev',
  },
  education: [
    {
      school: 'University of London',
      degree: 'BSc',
      fieldOfStudy: 'Mathematics',
      startDate: '2018-09',
      endDate: '2022-06',
      gpa: '3.9',
    },
  ],
  experience: [],
  answers: {
    authorizedToWorkInUS: true,
    requiresSponsorship: false,
    willingToRelocate: true,
    over18: true,
  },
  meta: { updatedAt: '2026-01-01T00:00:00.000Z' },
};

async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] || '/';
    const filePath = path.join(fixturesDir, urlPath === '/' ? 'basic-form.html' : urlPath);
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      const type =
        ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No server address');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

test.describe.configure({ mode: 'serial' });

test.describe('extension autofill e2e', () => {
  let context: BrowserContext;
  let extensionId: string;
  let serviceWorker: Worker;
  let baseUrl: string;
  let server: Server;

  test.beforeAll(async () => {
    const started = await startFixtureServer();
    server = started.server;
    baseUrl = started.baseUrl;

    await grantLocalhostHostPermission();

    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    }
    serviceWorker = sw;
    extensionId = new URL(sw.url()).host;

    // Seed profile via extension page (storage available there)
    const seed = await context.newPage();
    await seed.goto(`chrome-extension://${extensionId}/popup.html`);
    await seed.evaluate(async (profile) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (globalThis as any).chrome.storage.local.set({ profile });
    }, SAMPLE_PROFILE);
    await seed.close();
  });

  test.afterAll(async () => {
    await context?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  /**
   * Drive fill from the extension service worker while the fixture page is the
   * focused/active tab. Without host permissions, tab.url is often blank in
   * tabs.query, so we must not look up by URL — use activeTab instead.
   */
  async function fillActiveFixture(fixturePage: Page) {
    await fixturePage.bringToFront();
    // Give Chromium a beat to update the active tab after focus
    await fixturePage.waitForTimeout(200);

    const result = await serviceWorker.evaluate(
      async ({ profile, contentScript }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        const [tab] = await chromeApi.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (!tab?.id) {
          const all = await chromeApi.tabs.query({ lastFocusedWindow: true });
          throw new Error(
            `No active tab. tabs=${JSON.stringify(all.map((t: { id?: number; url?: string; title?: string; active?: boolean }) => ({ id: t.id, url: t.url, title: t.title, active: t.active })))}`,
          );
        }

        try {
          await chromeApi.tabs.sendMessage(tab.id, { type: 'ping' });
        } catch {
          await chromeApi.scripting.executeScript({
            target: { tabId: tab.id },
            files: [contentScript],
          });
        }

        return chromeApi.tabs.sendMessage(tab.id, { type: 'fill', profile });
      },
      { profile: SAMPLE_PROFILE, contentScript: CONTENT_SCRIPT_FILE },
    );

    return result as {
      ok: boolean;
      report?: { filled: unknown[]; skipped: unknown[]; review: unknown[]; failed: unknown[] };
      error?: string;
    };
  }

  test('fills basic-form contact fields and never submits', async () => {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/basic-form.html`);
    const res = await fillActiveFixture(page);
    expect(res.ok, res.error).toBe(true);
    expect(await page.locator('#first_name').inputValue()).toBe('Ada');
    expect(await page.locator('#last_name').inputValue()).toBe('Lovelace');
    expect(await page.locator('#email').inputValue()).toBe('ada@example.com');
    expect(await page.locator('#phone').inputValue()).toBe('555-0100');
    expect(await page.locator('#linkedin').inputValue()).toBe('https://linkedin.com/in/ada');
    expect(await page.locator('#github').inputValue()).toBe('https://github.com/ada');
    expect(await page.locator('#location').inputValue()).toBe('London, UK');
    expect(await page.locator('#school').inputValue()).toBe('University of London');
    expect(
      await page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks),
    ).toBe(0);
    await page.close();
  });

  test('fills aria-form labels', async () => {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/aria-form.html`);
    const res = await fillActiveFixture(page);
    expect(res.ok, res.error).toBe(true);
    expect(await page.locator('#fn').inputValue()).toBe('Ada');
    expect(await page.locator('#em').inputValue()).toBe('ada@example.com');
    expect(
      await page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks),
    ).toBe(0);
    await page.close();
  });

  test('fills react-like controlled inputs', async () => {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/react-form.html`);
    const res = await fillActiveFixture(page);
    expect(res.ok, res.error).toBe(true);
    expect(await page.locator('#first_name').inputValue()).toBe('Ada');
    expect(await page.locator('#email').inputValue()).toBe('ada@example.com');
    expect(await page.locator('#school').inputValue()).toBe('University of London');
    await page.close();
  });

  test('preserves prefilled values and skips disabled; never submits', async () => {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/tricky-form.html`);
    const res = await fillActiveFixture(page);
    expect(res.ok, res.error).toBe(true);
    expect(await page.locator('#first_name').inputValue()).toBe('Ada');
    expect(await page.locator('#email').inputValue()).toBe('prefilled@example.com');
    expect(await page.locator('#phone').inputValue()).toBe('');
    expect(await page.locator('#auth').inputValue()).toBe('');
    expect(
      await page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks),
    ).toBe(0);
    await page.close();
  });
});
