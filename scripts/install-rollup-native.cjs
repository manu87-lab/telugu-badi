#!/usr/bin/env node
// Postinstall helper to install the correct @rollup native package for the current platform.
// Uses SKIP_ROLLUP_POSTINSTALL=1 to avoid recursion when running npm install from this script.

const { execSync } = require('child_process');
const os = require('os');

if (process.env.SKIP_ROLLUP_POSTINSTALL === '1') {
  // Called from a nested npm install; skip to avoid recursion
  process.exit(0);
}

const platform = os.platform(); // 'win32' | 'linux' | 'darwin'
const arch = os.arch(); // 'x64' | 'arm64' | ...

function getNativeRollupPackage(platform, arch) {
  // Minimal map for common CI/dev platforms. Extend for other combos if needed.
  if (platform === 'win32' && arch === 'x64') return '@rollup/rollup-win32-x64-msvc';
  if (platform === 'linux' && arch === 'x64') return '@rollup/rollup-linux-x64-gnu';
  if (platform === 'linux' && arch === 'arm64') return '@rollup/rollup-linux-arm64-gnu';
  if (platform === 'darwin' && arch === 'arm64') return '@rollup/rollup-darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return '@rollup/rollup-darwin-x64';
  return null;
}

const pkg = getNativeRollupPackage(platform, arch);
if (!pkg) {
  console.log(`[postinstall] No native @rollup package mapping for platform=${platform} arch=${arch}. Skipping.`);
  process.exit(0);
}

const version = '4.52.3'; // align with the Rollup version used by the project
const full = `${pkg}@${version}`;

try {
  console.log(`[postinstall] Ensuring native rollup package is installed: ${full}`);
  execSync(`npm i -D ${full}`, {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { SKIP_ROLLUP_POSTINSTALL: '1' }),
  });
  console.log('[postinstall] Native rollup package installed (or already present).');
} catch (err) {
  console.warn('[postinstall] Failed to install native rollup package:', err && err.message ? err.message : err);
  // Don't fail the whole install; leave it to Rollup's own error messaging if required.
}
