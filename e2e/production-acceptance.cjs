/**
 * Read-only authenticated production acceptance for Hermes Investment OS.
 *
 * Required:
 *   HERMES_E2E_PASSWORD=<owner password>
 * Optional:
 *   HERMES_E2E_URL=https://hermestradingosian.vercel.app
 *   HERMES_E2E_ARTIFACT_DIR=/tmp/hermes-production-acceptance
 *
 * This test performs one login and GET-only observations. It never calls chat,
 * trading, research-run or other mutating endpoints.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { chromium } = require('playwright');

const origin = new URL(process.env.HERMES_E2E_URL || 'https://hermestradingosian.vercel.app');
const password = process.env.HERMES_E2E_PASSWORD || '';
const artifacts = process.env.HERMES_E2E_ARTIFACT_DIR || '/tmp/hermes-production-acceptance';
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.vercel.app'))
  throw new Error('An explicit HTTPS Vercel production origin is required');
if (password.length < 12) throw new Error('HERMES_E2E_PASSWORD is required');

async function measuredJson(page, pathname) {
  return page.evaluate(async target => {
    const started = performance.now();
    const response = await fetch(target, { cache: 'no-store', credentials: 'same-origin' });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const row = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const list = value => Array.isArray(value) ? value : [];
    const summary = target === '/api/os/snapshot'
      ? { runtime: row(data?.runtime).state, state_feed: row(data?.telemetry).stateFeed }
      : target === '/api/os/g11-shadow'
        ? { fixture: data?.fixture, generated_at: data?.generated_at, scan_rows: list(row(data?.scan).rows).length,
            research_rows: list(data?.research).length, paper_days: list(data?.history).length }
        : { fixture: data?.fixture, live_orders_enabled: data?.live_orders_enabled,
            generated_at: data?.generated_at, cases: list(data?.cases).length,
            paper_days: row(data?.counts).paper_days, research: row(data?.counts).research,
            messages: list(data?.messages).length, ranking: list(row(data?.overnight).ranking).length };
    return { pathname: target, status: response.status, duration_ms: Math.round(performance.now() - started),
      bytes: new TextEncoder().encode(text).length, summary };
  }, pathname);
}

function captureErrors(page, label, sink) {
  page.on('pageerror', error => sink.push(`${label}:page:${error.message}`));
  page.on('console', message => { if (message.type() === 'error') sink.push(`${label}:console:${message.text()}`); });
  page.on('requestfailed', request => sink.push(`${label}:request:${new URL(request.url()).pathname}:${request.failure()?.errorText || 'failed'}`));
}

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox'] });
  const errors = [];
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktop.newPage();
    captureErrors(page, 'desktop', errors);
    await page.goto(new URL('/login', origin).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByLabel('Wachtwoord').fill(password);
    const snapshotResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/os/snapshot');
    const researchResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/os/g11-shadow');
    const initialStarted = performance.now();
    await Promise.all([
      page.waitForURL(new URL('/', origin).href, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
      page.getByRole('button', { name: 'Open Hermes' }).click(),
    ]);
    await page.getByRole('heading', { name: 'Wat gebeurt er vandaag?' }).waitFor({ timeout: 30_000 });
    const [snapshotInitial, researchInitial] = await Promise.all([snapshotResponse, researchResponse]);
    await Promise.all([snapshotInitial.body(), researchInitial.body()]);
    const initial_dashboard_ms = Math.round(performance.now() - initialStarted);
    assert.equal(snapshotInitial.status(), 200, 'initial status feed failed');
    assert.equal(researchInitial.status(), 200, 'initial research feed failed');

    const endpoints = [];
    for (const pathname of ['/api/os/snapshot', '/api/os/council', '/api/os/g11-shadow'])
      endpoints.push(await measuredJson(page, pathname));
    for (const endpoint of endpoints) assert.equal(endpoint.status, 200, `${endpoint.pathname} failed`);
    const councilApi = endpoints.find(item => item.pathname === '/api/os/council');
    assert.equal(councilApi.summary.fixture, false, 'Council fixture data reached production');
    assert.equal(councilApi.summary.live_orders_enabled, false, 'live orders are enabled');
    assert.equal(councilApi.summary.messages, 0, 'unused bulk Council messages reached the browser');

    let archiveRequests = 0;
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/os/council/archive') archiveRequests++;
    });
    const councilStarted = performance.now();
    const councilSnapshot = page.waitForResponse(r => new URL(r.url()).pathname === '/api/os/council');
    const selectedArchive = page.waitForResponse(r => new URL(r.url()).pathname === '/api/os/council/archive');
    await page.goto(new URL('/onderzoeksraad', origin).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'De onderzoeksraad' }).waitFor({ timeout: 30_000 });
    await Promise.all([(await councilSnapshot).body(), (await selectedArchive).body()]);
    await page.waitForTimeout(300);
    const council_render_ms = Math.round(performance.now() - councilStarted);
    assert.equal(archiveRequests, 1, 'Council loaded more than the selected archive initially');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'desktop Council overflow');

    const tradingStarted = performance.now();
    await page.goto(new URL('/trading', origin).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Portefeuille & handel' }).waitFor({ timeout: 30_000 });
    await page.getByText('Paper · geen echte orders', { exact: true }).waitFor({ timeout: 30_000 });
    const trading_render_ms = Math.round(performance.now() - tradingStarted);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'desktop trading overflow');
    await page.screenshot({ path: path.join(artifacts, 'desktop-trading.png'), fullPage: true });

    const storageState = await desktop.storageState();
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState });
    const mobilePage = await mobile.newPage();
    captureErrors(mobilePage, 'mobile', errors);
    const mobileStarted = performance.now();
    await mobilePage.goto(new URL('/onderzoeksraad', origin).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const conversation = mobilePage.locator('button[aria-current="true"]').first();
    await conversation.waitFor({ timeout: 30_000 });
    assert.equal(await mobilePage.getByRole('region', { name: 'Groepsgesprek' }).isVisible(), false);
    await conversation.click();
    await mobilePage.getByRole('region', { name: 'Groepsgesprek' }).waitFor({ timeout: 30_000 });
    const back = mobilePage.getByRole('button', { name: '← Terug naar overzicht' });
    const backBox = await back.boundingBox();
    assert(backBox && backBox.height >= 44, 'mobile back target is smaller than 44px');
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile Council overflow');
    const mobile_council_ms = Math.round(performance.now() - mobileStarted);
    await mobilePage.screenshot({ path: path.join(artifacts, 'mobile-council.png'), fullPage: true });
    assert.deepEqual(errors, [], 'browser errors detected');

    console.log(JSON.stringify({
      origin: origin.origin,
      initial_dashboard_ms,
      council_render_ms,
      trading_render_ms,
      mobile_council_ms,
      initial_archive_requests: archiveRequests,
      endpoints,
      rendering: { desktop_overflow: false, mobile_overflow: false, mobile_back_min_44: true },
      live_trading: false,
      screenshots: [path.join(artifacts, 'desktop-trading.png'), path.join(artifacts, 'mobile-council.png')],
    }, null, 2));
    await mobile.close();
    await desktop.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
