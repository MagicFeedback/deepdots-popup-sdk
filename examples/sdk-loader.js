// Cambia este valor para probar la build local o la última versión publicada en npm.
const SDK_SOURCE = 'package_latest'; // 'local' | 'package_latest'

const SDK_SOURCE_URLS = {
  local: '../dist/index.mjs',
  package_latest: 'https://cdn.jsdelivr.net/npm/@magicfeedback/popup-sdk@latest/dist/index.mjs',
};

export function getSdkSource() {
  return SDK_SOURCE;
}

export function getSdkSourceUrl() {
  const url = SDK_SOURCE_URLS[SDK_SOURCE];
  if (!url) {
    throw new Error(`Unsupported SDK source "${SDK_SOURCE}"`);
  }
  return url;
}

export async function loadPopupSdk() {
  return import(getSdkSourceUrl());
}
