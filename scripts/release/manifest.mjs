/**
 * Validacion del manifiesto de compatibilidad (release/compatibility.json) y de lo que
 * referencia: el schema de configuracion generado desde los tipos y los fixtures de popups.
 * Lee del disco; las reglas sin E/S estan en rules.mjs.
 *
 *   validateManifest({ root }) -> { manifest, errors }
 *   generateConfigSchema({ root }) -> el JSON Schema de la configuracion
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { createGenerator } from 'ts-json-schema-generator';
import { checkManifestConsistency } from './rules.mjs';

export const MANIFEST_PATH = 'release/compatibility.json';
export const MANIFEST_SCHEMA_PATH = 'release/compatibility.schema.json';
export const CONFIG_SCHEMA_TYPES = 'release/config-schema.types.ts';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** JSON Schema de `{ init: DeepdotsInitParams, popups: PopupDefinition[] }`, desde src/types. */
export function generateConfigSchema({ root = '.' } = {}) {
  const schema = createGenerator({
    path: join(root, CONFIG_SCHEMA_TYPES),
    tsconfig: join(root, 'tsconfig.json'),
    type: 'PopupSdkConfig',
    skipTypeCheck: true,
    functions: 'hide',
  }).createSchema('PopupSdkConfig');
  return `${JSON.stringify(schema, null, 2)}\n`;
}

function ajvErrors(validate, label) {
  return (validate.errors ?? []).map((e) => `${label}${e.instancePath || ''} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`);
}

/** Version del renderer de surveys que carga el WebView de RN (surveyHtml.ts). */
function cdnVersionOf(root) {
  const path = join(root, 'src/ui/surveyHtml.ts');
  if (!existsSync(path)) return null;
  return /opts\.version \?\? '([^']+)'/.exec(readFileSync(path, 'utf8'))?.[1] ?? null;
}

export function validateManifest({ root = '.', checkGenerated = true } = {}) {
  const errors = [];
  const at = (p) => join(root, p);

  if (!existsSync(at(MANIFEST_PATH))) return { manifest: null, errors: [`Falta ${MANIFEST_PATH}.`] };
  let manifest;
  try {
    manifest = readJson(at(MANIFEST_PATH));
  } catch (e) {
    return { manifest: null, errors: [`${MANIFEST_PATH} no es JSON valido: ${e.message}`] };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(readJson(at(MANIFEST_SCHEMA_PATH)));
  if (!validate(manifest)) {
    errors.push(...ajvErrors(validate, MANIFEST_PATH));
    // Con la forma rota, lo demas daria errores en cascada.
    return { manifest, errors };
  }

  const pkg = readJson(at('package.json'));
  const lock = readJson(at('package-lock.json'));
  errors.push(
    ...checkManifestConsistency({
      manifest,
      pkg,
      nativeVersion: lock.packages?.['node_modules/@magicfeedback/native']?.version ?? null,
      cdnVersion: cdnVersionOf(root),
    }),
  );

  if (!existsSync(at(manifest.supportPolicy))) errors.push(`supportPolicy apunta a ${manifest.supportPolicy}, que no existe.`);

  // Schema de configuracion: existe y es exactamente el que salen de los tipos actuales.
  const schemaPath = at(manifest.configSchema.path);
  let configSchema = null;
  if (!existsSync(schemaPath)) {
    errors.push(`Falta ${manifest.configSchema.path}. Generalo con: npm run release:schema`);
  } else {
    const committed = readFileSync(schemaPath, 'utf8');
    configSchema = JSON.parse(committed);
    if (checkGenerated && committed !== generateConfigSchema({ root })) {
      errors.push(`${manifest.configSchema.path} no corresponde a src/types: los tipos de configuracion han cambiado. Regeneralo con: npm run release:schema`);
    }
  }

  // Fixtures: cada uno existe y es una respuesta valida de GET /sdk/{publicKey}/popups.
  if (configSchema) {
    const { $ref, ...definitions } = configSchema;
    const popupsSchema = { ...definitions, type: 'array', items: { $ref: '#/definitions/PopupDefinition' } };
    const validatePopups = ajv.compile(popupsSchema);
    for (const fixture of manifest.fixtures) {
      if (!existsSync(at(fixture.path))) {
        errors.push(`El fixture ${fixture.id} apunta a ${fixture.path}, que no existe.`);
        continue;
      }
      let data;
      try {
        data = readJson(at(fixture.path));
      } catch (e) {
        errors.push(`${fixture.path} no es JSON valido: ${e.message}`);
        continue;
      }
      if (!validatePopups(data)) errors.push(...ajvErrors(validatePopups, fixture.path));
    }
  }

  return { manifest, errors };
}
