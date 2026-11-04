import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * globalTeardown: junta lo que cada device apuntó (`<device>/device.json`) en `out/actual/meta.json`,
 * que check.mjs pone en el informe y approve.mjs en el registro de aprobación: versión del SDK
 * probada, plataforma y device/navegador de cada carpeta de capturas.
 */
export default function writeMeta() {
  const out = join(import.meta.dirname, 'out', 'actual');
  if (!existsSync(out)) return;
  const devices: Record<string, string> = {};
  let sdkVersion: string | null = null;
  for (const d of readdirSync(out, { withFileTypes: true })) {
    const f = join(out, d.name, 'device.json');
    if (!d.isDirectory() || !existsSync(f)) continue;
    const info = JSON.parse(readFileSync(f, 'utf8'));
    devices[d.name] = info.info;
    sdkVersion ??= info.sdkVersion;
  }
  const meta = {
    platform: 'web',
    sdk: process.env.SDK_VERSION ?? 'local',
    sdkVersion,
    devices,
    createdAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  };
  writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 2));
}
