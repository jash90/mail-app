const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PKG_DIR = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-sherpa-onnx-offline-tts',
);
const BUILD_IOS = path.join(PKG_DIR, 'build-ios');
const MARKER = path.join(BUILD_IOS, 'sherpa-onnx.xcframework');

if (!fs.existsSync(PKG_DIR)) {
  // Package not installed, skip
  process.exit(0);
}

if (fs.existsSync(MARKER)) {
  console.log('[sherpa-onnx] xcframeworks already present, skipping download.');
  process.exit(0);
}

const URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.10.26/sherpa-onnx-v1.10.26-ios.tar.bz2';
const TMP = path.join(PKG_DIR, '_sherpa-ios.tar.bz2');

console.log('[sherpa-onnx] Downloading iOS xcframeworks...');
try {
  execSync(`curl -L -o "${TMP}" "${URL}"`, { stdio: 'inherit' });
  execSync(`tar xjf "${TMP}" -C "${PKG_DIR}"`, { stdio: 'inherit' });
  fs.unlinkSync(TMP);
  console.log('[sherpa-onnx] xcframeworks installed successfully.');
} catch (err) {
  console.error('[sherpa-onnx] Failed to download xcframeworks:', err.message);
  try { fs.unlinkSync(TMP); } catch {}
  process.exit(1);
}
