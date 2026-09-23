import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distIndex = path.join(__dirname, 'dist', 'index.html');
const rootIndex = path.join(__dirname, 'index.html');
const distAssets = path.join(__dirname, 'dist', 'assets');
const rootAssets = path.join(__dirname, 'assets');
const distBackgrounds = path.join(__dirname, 'dist', 'backgrounds');
const rootBackgrounds = path.join(__dirname, 'backgrounds');
const distIcons = path.join(__dirname, 'dist', 'icons');
const rootIcons = path.join(__dirname, 'icons');

if (fs.existsSync(distAssets)) {
  fs.rmSync(rootAssets, { recursive: true, force: true });
  fs.cpSync(distAssets, rootAssets, { recursive: true, force: true });
  console.log('✓ Synced dist/assets/ -> photo-journey/assets/');
}

if (fs.existsSync(distBackgrounds)) {
  fs.rmSync(rootBackgrounds, { recursive: true, force: true });
  fs.cpSync(distBackgrounds, rootBackgrounds, { recursive: true, force: true });
  console.log('✓ Synced dist/backgrounds/ -> photo-journey/backgrounds/');
}

if (fs.existsSync(distIcons)) {
  fs.cpSync(distIcons, rootIcons, { recursive: true, force: true });
  console.log('✓ Synced dist/icons/ -> photo-journey/icons/');
}

// PWA files Vite copies straight through from public/ — keep the root copies in sync too.
for (const name of ['manifest.json', 'sw.js', 'register-sw.js']) {
  const distFile = path.join(__dirname, 'dist', name);
  const rootFile = path.join(__dirname, name);
  if (fs.existsSync(distFile)) {
    fs.copyFileSync(distFile, rootFile);
    console.log(`✓ Synced dist/${name} -> photo-journey/${name}`);
  }
}

if (fs.existsSync(distIndex)) {
  fs.copyFileSync(distIndex, rootIndex);
  console.log('✓ Synced dist/index.html -> photo-journey/index.html');
}

const swPath = path.join(__dirname, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  const newCacheVersion = `pj-v${Date.now()}`;
  swContent = swContent.replace(/const CACHE_VERSION = ['"].*?['"];/, `const CACHE_VERSION = '${newCacheVersion}';`);
  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log(`✓ Updated sw.js CACHE_VERSION -> ${newCacheVersion}`);
}
