/**
 * Reglas de release de @magicfeedback/popup-sdk (MF-3241). Partes puras, sin git ni
 * sistema de ficheros, para poder testearlas; check.mjs las alimenta.
 *
 * Flujo (decidido 28-oct, "opcion A"): cada PR que cambia el paquete anade sus notas a
 * `## [Unreleased]`; la version solo sube en la PR de release (`npm run release:prepare`),
 * que convierte [Unreleased] en `## [X.Y.Z] — YYYY-MM-DD`. Una PR a `main` con cambios en
 * el paquete es un hotfix y tiene que subir la version ella misma.
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

export function isSemver(version) {
  return SEMVER.test(String(version ?? ''));
}

/** Negativo si a < b, 0 si iguales, positivo si a > b. Una prerelease va por detras de su final. */
export function compareVersions(a, b) {
  const [pa, pb] = [SEMVER.exec(a), SEMVER.exec(b)];
  if (!pa || !pb) throw new Error(`Version no valida: ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

// ---------- que cuenta como cambio del paquete ----------

/**
 * Rutas que acaban en el tarball publicado (o deciden como se construye). Docs, CI, demos,
 * e2e y los propios scripts de release pueden cambiar sin release.
 *
 * package.json y package-lock.json no estan: cambian siempre con el bump, asi que se
 * comparan por contenido en manifestChanged().
 */
const PACKAGE_PATHS = [/^src\//, /^tsup(\.[a-z]+)?\.config\.ts$/, /^tsconfig\.json$/];

const NOT_PACKAGE = [/\.test\.[cm]?[jt]sx?$/, /(^|\/)__snapshots__\//, /^src\/core\/test-helpers\.ts$/];

export function isPackagePath(path) {
  return PACKAGE_PATHS.some((re) => re.test(path)) && !NOT_PACKAGE.some((re) => re.test(path));
}

/** Dependencias de desarrollo que tsup mete en el bundle (`noExternal` en tsup.config.ts). */
export const BUNDLED = ['@magicfeedback/native'];

/**
 * package.json sin lo que no llega al tarball: la version (cambia con el bump), los scripts
 * y las devDependencies que no se empaquetan (test, lint, release).
 */
function publishedManifest(pkg) {
  if (!pkg) return null;
  const { version, scripts, devDependencies = {}, ...rest } = pkg;
  const bundled = Object.fromEntries(Object.entries(devDependencies).filter(([name]) => BUNDLED.includes(name)));
  return { ...rest, bundled };
}

/** Ruta en el lock de `name` visto desde `from` (resolucion de node_modules hacia arriba). */
function resolveInLock(packages, from, name) {
  let dir = from;
  while (true) {
    const candidate = `${dir ? `${dir}/` : ''}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!dir) return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i >= 0 ? dir.slice(0, i) : '';
  }
}

/**
 * Entradas del lock que acaban en el paquete: las de produccion y el arbol de lo que se
 * empaqueta. Las de desarrollo (vitest, eslint, playwright...) no cuentan.
 */
function publishedLock(lock) {
  if (!lock) return null;
  const packages = lock.packages ?? {};
  const keep = new Set(Object.keys(packages).filter((path) => path && !packages[path].dev));
  const queue = BUNDLED.map((name) => resolveInLock(packages, '', name)).filter(Boolean);
  while (queue.length) {
    const path = queue.pop();
    keep.add(path);
    for (const name of Object.keys(packages[path].dependencies ?? {})) {
      const dep = resolveInLock(packages, path, name);
      if (dep && !keep.has(dep)) queue.push(dep);
    }
  }
  return Object.fromEntries([...keep].sort().map((path) => [path, packages[path].version ?? packages[path].resolved ?? null]));
}

/** Stringify estable: el orden de las claves no cuenta como cambio. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Si package.json / package-lock.json cambian en algo que llega al tarball: dependencias,
 * peers, exports, `files`... y la version de lo que se empaqueta (@magicfeedback/native y
 * su arbol). Subir vitest o anadir una herramienta de release no pide release notes.
 */
export function manifestChanged({ basePkg, headPkg, baseLock, headLock }) {
  return (
    canonical(publishedManifest(basePkg)) !== canonical(publishedManifest(headPkg)) ||
    canonical(publishedLock(baseLock)) !== canonical(publishedLock(headLock))
  );
}

/** Ficheros (y diff de manifiestos) que hacen de esta PR un cambio del paquete publicado. */
export function packageChanges({ changedFiles, basePkg, headPkg, baseLock, headLock }) {
  const reasons = changedFiles.filter(isPackagePath);
  if (manifestChanged({ basePkg, headPkg, baseLock, headLock })) {
    reasons.push('package.json / package-lock.json (dependencias, exports o scripts)');
  }
  return reasons;
}

// ---------- CHANGELOG ----------

// `## [1.17.0] — 2026-10-26`. Se acepta tambien `-` como separador (Keep a Changelog).
const HEADING = /^## \[([^\]]+)\](?:\s+[—-]\s+(\S+))?\s*$/;

/** Secciones del CHANGELOG en orden: {version, date, body}. [Unreleased] incluida. */
export function parseChangelog(text) {
  const sections = [];
  let current = null;
  for (const line of String(text ?? '').split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      current = { version: heading[1].trim(), date: heading[2] ?? null, lines: [] };
      sections.push(current);
      continue;
    }
    // Enlaces de referencia al final (`[1.9.0]: https://...`) o cualquier otro `## `.
    if (/^## /.test(line) || /^\[[^\]]+\]:\s/.test(line)) {
      current = null;
      continue;
    }
    current?.lines.push(line);
  }
  return sections.map(({ lines, ...s }) => ({ ...s, body: lines.join('\n').trim() }));
}

/** Notas con contenido real: sin cabeceras `###` ni bullets vacios. */
export function hasNotes(body) {
  return Boolean(
    String(body ?? '')
      .replace(/^#+.*$/gm, '')
      .replace(/^\s*[-*]\s*$/gm, '')
      .trim(),
  );
}

export function unreleasedNotes(changelog) {
  return parseChangelog(changelog).find((s) => s.version.toLowerCase() === 'unreleased')?.body ?? '';
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

/** La seccion de `version`: existe, es la primera release, tiene fecha y dice algo. */
export function checkReleaseEntry(changelog, version) {
  const releases = parseChangelog(changelog).filter((s) => s.version.toLowerCase() !== 'unreleased');
  const entry = releases.find((s) => s.version === version) ?? null;
  const errors = [];
  if (!entry) {
    errors.push(`CHANGELOG.md no tiene seccion "## [${version}] — YYYY-MM-DD" (release notes).`);
    return { entry, errors };
  }
  if (releases[0] !== entry) {
    errors.push(`La seccion [${version}] tiene que ser la primera release del CHANGELOG (encima esta [${releases[0].version}]).`);
  }
  if (!isValidDate(entry.date)) errors.push(`La seccion [${version}] necesita fecha: "## [${version}] — YYYY-MM-DD".`);
  if (!hasNotes(entry.body)) errors.push(`La seccion [${version}] del CHANGELOG esta vacia: faltan las release notes.`);
  return { entry, errors };
}

// ---------- regla de PR ----------

/**
 * Regla de las PRs a dev y main. Devuelve {kind, reasons, errors}:
 *  - kind 'release': la PR sube la version (PR de release o hotfix);
 *  - kind 'change': cambia el paquete sin subir version (solo valido hacia dev);
 *  - kind 'none': no toca el paquete.
 */
export function checkPullRequest({
  baseBranch,
  changedFiles,
  basePkg,
  headPkg,
  baseLock,
  headLock,
  baseChangelog,
  headChangelog,
  tagExists = false,
  tagMatchesHead = false,
}) {
  const reasons = packageChanges({ changedFiles, basePkg, headPkg, baseLock, headLock });
  const errors = [];
  const [base, head] = [basePkg?.version, headPkg?.version];

  if (!isSemver(head)) {
    errors.push(`La version de package.json ("${head}") no es semver X.Y.Z.`);
    return { kind: 'release', reasons, errors };
  }

  if (base !== head) {
    if (isSemver(base) && compareVersions(head, base) <= 0) {
      errors.push(`La version baja o se repite: ${base} en ${baseBranch}, ${head} en esta rama.`);
    }
    errors.push(...checkReleaseEntry(headChangelog, head).errors);
    if (parseChangelog(baseChangelog).some((s) => s.version === head)) {
      errors.push(`${baseBranch} ya tiene la seccion [${head}] en el CHANGELOG: esa version esta cogida.`);
    }
    if (hasNotes(unreleasedNotes(headChangelog))) {
      errors.push('Queda contenido en [Unreleased]: la PR de release tiene que moverlo a la seccion de la version (npm run release:prepare).');
    }
    if (tagExists && !tagMatchesHead) errors.push(`v${head} ya esta publicada con otro codigo. Usa una version nueva.`);
    return { kind: 'release', reasons, errors };
  }

  if (!reasons.length) return { kind: 'none', reasons, errors };

  // Mismo numero de version: hacia main es publicar codigo distinto bajo una version que ya
  // existe, salvo que sea exactamente lo etiquetado (promocion de una release de dev a main).
  if (baseBranch === 'main') {
    if (!(tagExists && tagMatchesHead)) {
      errors.push(
        `Cambia el paquete sin subir la version (${head}). Hacia main eso es un hotfix: sube la version ` +
          `y anade su seccion al CHANGELOG.`,
      );
    }
    return { kind: 'change', reasons, errors };
  }

  const before = unreleasedNotes(baseChangelog);
  const after = unreleasedNotes(headChangelog);
  if (!hasNotes(after) || after === before) {
    errors.push('Cambia el paquete pero no anade release notes en "## [Unreleased]" de CHANGELOG.md.');
  }
  return { kind: 'change', reasons, errors };
}

// ---------- manifiesto de compatibilidad ----------

/**
 * Comprobaciones del manifiesto que no expresa el JSON Schema: que diga la misma version
 * que package.json y el mismo renderer que lleva el bundle.
 */
export function checkManifestConsistency({ manifest, pkg, nativeVersion, cdnVersion }) {
  const errors = [];
  if (manifest.version !== pkg.version) {
    errors.push(`release/compatibility.json dice ${manifest.version} y package.json ${pkg.version}.`);
  }
  if (manifest.package !== pkg.name) errors.push(`release/compatibility.json es de ${manifest.package}, no de ${pkg.name}.`);
  if (nativeVersion && manifest.surveyRenderer?.version !== nativeVersion) {
    errors.push(
      `surveyRenderer.version es ${manifest.surveyRenderer?.version} pero el bundle lleva @magicfeedback/native ${nativeVersion} (package-lock.json).`,
    );
  }
  if (cdnVersion && manifest.surveyRenderer?.cdnVersion && manifest.surveyRenderer.cdnVersion !== cdnVersion) {
    errors.push(`surveyRenderer.cdnVersion es ${manifest.surveyRenderer.cdnVersion} pero surveyHtml.ts carga ${cdnVersion}.`);
  }
  const ids = manifest.fixtures?.map((f) => f.id) ?? [];
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) errors.push(`Fixture repetido en release/compatibility.json: ${dup}.`);
  return errors;
}

// ---------- regla de publicacion ----------

/**
 * Antes de `npm publish`: el tag es la version, la version sube respecto a lo ya publicado
 * en su linea X.Y (asi cabe un parche de una minor anterior, ver docs/VERSIONING.md) y el
 * CHANGELOG tiene sus notas. Devuelve {errors, distTag}: un parche de una linea antigua no
 * mueve `latest` en npm, va a `release-X.Y`; una prerelease va a `next`.
 */
export function checkRelease({ tag, pkg, changelog, previousTags = [] }) {
  const errors = [];
  const version = pkg?.version;
  if (!isSemver(version)) {
    errors.push(`La version de package.json ("${version}") no es semver.`);
    return { errors, distTag: null };
  }
  if (tag !== `v${version}`) errors.push(`El tag ${tag} no coincide con package.json (${version}).`);

  const released = previousTags
    .map((t) => t.replace(/^v/, ''))
    .filter((v) => isSemver(v) && v !== version)
    .sort(compareVersions);
  const line = (v) => v.split('.').slice(0, 2).join('.');
  const latestInLine = released.filter((v) => line(v) === line(version)).at(-1);
  if (latestInLine && compareVersions(version, latestInLine) <= 0) {
    errors.push(`Sin bump: ${version} no es mayor que la ultima release de la linea ${line(version)} (v${latestInLine}).`);
  }
  errors.push(...checkReleaseEntry(changelog, version).errors);

  const latest = released.filter((v) => !v.includes('-')).at(-1);
  let distTag = 'latest';
  if (version.includes('-')) distTag = 'next';
  else if (latest && compareVersions(version, latest) < 0) distTag = `release-${line(version)}`;
  return { errors, distTag };
}
