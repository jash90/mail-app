/**
 * Fixes uniwind compatibility with Metro 0.80+ (Expo SDK 54).
 * Metro 0.80 moved internal modules from `private/` to `src/`.
 * Uniwind still requires the old paths — this creates shim modules.
 */
const fs = require('fs');
const path = require('path');

const shims = [
  {
    dir: 'node_modules/metro-cache/private/stores',
    file: 'FileStore.js',
    content: 'module.exports = require("../../src/stores/FileStore");',
  },
  {
    dir: 'node_modules/metro/private/DeltaBundler',
    file: 'Graph.js',
    content: 'module.exports = require("../../src/DeltaBundler/Graph");',
  },
];

for (const shim of shims) {
  const shimDir = path.resolve(__dirname, '..', shim.dir);
  const shimFile = path.join(shimDir, shim.file);
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(shimFile, shim.content);
}

console.log('[metro-compat] Created shims for uniwind + Metro 0.80');
