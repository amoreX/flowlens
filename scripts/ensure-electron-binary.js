#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const distDir = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
const expectedApp = path.join(distDir, 'Electron.app');
const disabledApp = `${expectedApp}.disabled`;
const expectedBinary = path.join(expectedApp, 'Contents', 'MacOS', 'Electron');

if (fs.existsSync(expectedBinary)) {
  process.exit(0);
}

if (fs.existsSync(disabledApp)) {
  fs.renameSync(disabledApp, expectedApp);
  console.log('[flowlens] Restored Electron.app from Electron.app.disabled');
}

if (!fs.existsSync(expectedBinary)) {
  console.error('[flowlens] Electron binary not found at:', expectedBinary);
  console.error('[flowlens] Reinstall dependencies: rm -rf node_modules package-lock.json && npm install');
  process.exit(1);
}
