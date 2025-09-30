const os = require('os');
const { execSync } = require('child_process');

const platform = os.platform();
const arch = os.arch();

// Map to rollup native package name patterns
function pkgNameFor(platform, arch) {
  if (platform === 'win32' && arch === 'x64') return '@rollup/rollup-win32-x64-msvc';
  if (platform === 'linux' && arch === 'x64') return '@rollup/rollup-linux-x64-gnu';
  if (platform === 'darwin' && arch === 'arm64') return '@rollup/rollup-darwin-arm64';
  // Not exhaustive; best-effort only.
  return null;
}

const pkg = pkgNameFor(platform, arch);
if (!pkg) {
  console.log('[postinstall] No rollup native package mapping for', platform, arch);
  process.exit(0);
}

try {
  console.log('[postinstall] Installing', pkg);
  execSync(`npm i -D ${pkg}@4.52.3`, { stdio: 'inherit' });
  console.log('[postinstall] Installed', pkg);
} catch (err) {
  console.warn('[postinstall] Failed to install native rollup binary:', err.message);
  // don't fail install
}
