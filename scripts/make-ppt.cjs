#!/usr/bin/env node
// Automated screenshot -> PPTX generator for the app
// Usage: node ./scripts/make-ppt.cjs

const fs = require('fs');
const path = require('path');
const child = require('child_process');

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = child.spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(cmd + ' ' + args.join(' ') + ' exited ' + code))));
  });
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('[make-ppt] Building the app (production)...');
  await run('npm', ['run', 'build']);

  // Start vite preview on a random port
  const port = 5174; // fixed preview port to avoid needing discovery
  console.log('[make-ppt] Starting preview server on port', port);
  const preview = child.spawn('npx', ['vite', 'preview', '--port', String(port)], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

  preview.stdout.on('data', (d) => process.stdout.write('[preview] ' + d));
  preview.stderr.on('data', (d) => process.stderr.write('[preview] ' + d));

  // wait for server to be ready by probing the URL
  const base = `http://localhost:${port}`;
  await waitForUrl(base, 20000);

  // Use Playwright to open pages and capture full-page screenshots
  const { chromium } = require('playwright');
  const PptxGenJS = require('pptxgenjs');

  const routes = [
    { name: 'Enrollment', path: '/?view=admin' },
    { name: 'Check In', path: '/?view=checkin' },
    { name: 'Check Out', path: '/?view=checkout' },
    { name: 'Selected Student', path: '/?view=checkin&select=sample' },
    { name: 'Recent Logs', path: '/' },
  ];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const images = [];
  for (const r of routes) {
    const url = base + r.path;
    console.log('[make-ppt] Opening', url);
    await page.goto(url, { waitUntil: 'networkidle' });
    // small wait to allow HMR/JS to render
    await page.waitForTimeout(600);
    const file = path.join(outDir, `${r.name.replace(/[^a-z0-9_-]/gi, '_')}.png`);
    await page.screenshot({ path: file, fullPage: true });
    images.push({ name: r.name, file });
  }

  await browser.close();

  console.log('[make-ppt] Generating PPTX...');
  const pptx = new PptxGenJS();
  for (const img of images) {
    const slide = pptx.addSlide();
    slide.addImage({ path: img.file, x: 0, y: 0, w: '100%', h: '100%' });
    slide.addText(img.name, { x: 0.2, y: 0.2, fontSize: 18, color: 'FFFFFF', fill: { color: '000000', transparency: 70 } });
  }
  const outPath = path.join(outDir, 'screenshots.pptx');
  await pptx.writeFile({ fileName: outPath });
  console.log('[make-ppt] PPTX saved to', outPath);

  // shutdown preview
  preview.kill();
}

function waitForUrl(url, timeout = 15000) {
  const http = require('http');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function check() {
      http.get(url, (res) => {
        resolve();
      }).on('error', (e) => {
        if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for ' + url));
        setTimeout(check, 300);
      });
    })();
  });
}

main().catch((err) => {
  console.error('[make-ppt] Failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
