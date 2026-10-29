// Carga el SDK que se quiere probar: el artefacto PUBLICADO en npm (vía jsDelivr) o la build
// local de este repo. Nunca un bundle reconstruido: lo que se prueba es lo que instala un cliente.
//
//   ?sdk=latest  → la `latest` de npm, resuelta a versión exacta antes de importar
//   ?sdk=1.16.1  → esa versión publicada
//   ?sdk=local   → /dist/index.mjs (npm run build)

const PACKAGE = '@magicfeedback/popup-sdk';
const CDN = 'https://cdn.jsdelivr.net/npm';

async function resolveVersion(spec) {
  if (spec === 'local') {
    const pkg = await fetch('/package.json', { cache: 'no-store' }).then((r) => r.json());
    return `${pkg.version}-local`;
  }
  if (/^\d+\.\d+\.\d+/.test(spec)) return spec;
  // dist-tag (latest, next…): se fija a una versión concreta para que el run diga qué probó.
  const meta = await fetch(`https://registry.npmjs.org/${PACKAGE}/${encodeURIComponent(spec)}`).then((r) => {
    if (!r.ok) throw new Error(`npm registry ${r.status} resolving ${spec}`);
    return r.json();
  });
  return meta.version;
}

export async function loadSdk(spec) {
  const version = await resolveVersion(spec);
  const url = spec === 'local' ? '/dist/index.mjs' : `${CDN}/${PACKAGE}@${version}/dist/index.mjs`;
  const mod = await import(/* @vite-ignore */ url);
  if (typeof mod.DeepdotsPopups !== 'function') {
    throw new Error(`${url} does not export DeepdotsPopups`);
  }
  return { mod, version, url };
}
