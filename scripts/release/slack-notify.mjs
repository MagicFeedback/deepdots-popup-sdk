#!/usr/bin/env node
/**
 * Aviso de release en Slack (#sdk-releases, MF-3266). Lo llama release.yml cuando la version
 * YA esta publicada; los dry-run no lo llaman.
 *
 *   slack-notify.mjs --title "@magicfeedback/popup-sdk 1.17.2" --platform "Web (npm)" \
 *     --notes notes.md [--link "GitHub Release=https://..."]... [--actor login] [--test] [--print]
 *
 * En vez de --notes, `--changelog CHANGELOG.md --version X.Y.Z` saca la seccion `## ... X.Y.Z`.
 *
 * El webhook sale de SLACK_WEBHOOK_URL (secret SDK_RELEASES_SLACK_WEBHOOK_URL). Sin webhook
 * avisa con ::warning y sale con 0: un aviso que no llega no puede romper una release ya hecha.
 * --print escribe el payload en vez de enviarlo. --test antepone "🧪 TEST —".
 *
 * Mismo fichero en deepdots-popup-sdk, deepdots-popup-mobile-native-sdk, magicfeedback-sdk y
 * MagicSurvey: cambiarlo en los cuatro.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MAX_BULLETS = 6;
const MAX_BULLET_CHARS = 160;

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown de una linea -> mrkdwn de Slack (negrita, enlaces; el codigo se queda igual). */
export function toMrkdwn(md) {
  return escape(md)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<$2|$1>')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/__([^_]+)__/g, '*$1*');
}

function shorten(text) {
  if (text.length <= MAX_BULLET_CHARS) return text;
  const cut = text.slice(0, MAX_BULLET_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_BULLET_CHARS - 20)).trimEnd()}…`;
}

/**
 * Las entradas de una seccion del CHANGELOG: un item por bullet de primer nivel, con el grupo
 * (`### Fixed`) delante. Si el bullet empieza con un titulo en negrita, solo el titulo.
 */
export function summarizeNotes(md) {
  const items = [];
  let group = '';
  let current = null;
  const flush = () => {
    if (!current) return;
    const text = current.join(' ').replace(/\s+/g, ' ').trim();
    const title = text.match(/^\*\*(.+?)\*\*/);
    const body = title ? title[1] : text.split(/(?<=[.!?])\s/)[0];
    if (body) items.push({ group, text: shorten(body.replace(/[.:]$/, '')) });
    current = null;
  };
  for (const line of md.split('\n')) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      group = heading[1].replace(/^[^\p{L}]+/u, '');
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flush();
      current = [bullet[1]];
    } else if (current && /^\s+\S/.test(line) && !/^\s+[-*]\s/.test(line)) {
      current.push(line.trim());
    } else if (!line.trim()) {
      flush();
    }
  }
  flush();
  return items;
}

/** La seccion de una version (`## [1.2.3] - fecha`, `## 1.2.3 - fecha`, `## 🚀 [1.2.3]`) sin su titulo. */
export function extractSection(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s.*(?<![\\w.-])\\[?v?${escaped}\\]?(?![\\w.-])`);
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return '';
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
}

export function buildMessage({ title, platform, notes = '', links = [], actor, test = false }) {
  const header = [`📦 *${escape(title)}* published`, platform && escape(platform), actor && `by ${escape(actor)}`]
    .filter(Boolean)
    .join(' · ');
  const lines = [`${test ? '🧪 TEST — ' : ''}${header}`];
  if (links.length) lines.push(links.map(({ label, url }) => `<${url}|${escape(label)}>`).join(' · '));
  const items = summarizeNotes(notes);
  for (const { group, text } of items.slice(0, MAX_BULLETS)) {
    lines.push(`• ${group ? `_${escape(group)}_ · ` : ''}${toMrkdwn(text)}`);
  }
  if (items.length > MAX_BULLETS) lines.push(`…and ${items.length - MAX_BULLETS} more`);
  return { text: lines.join('\n'), unfurl_links: false, unfurl_media: false };
}

function parseArgs(argv) {
  const opts = { links: [], test: false, print: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`Falta el valor de ${arg}`);
      return argv[++i];
    };
    if (arg === '--title') opts.title = value();
    else if (arg === '--platform') opts.platform = value();
    else if (arg === '--notes') opts.notesFile = value();
    else if (arg === '--changelog') opts.changelogFile = value();
    else if (arg === '--version') opts.version = value();
    else if (arg === '--actor') opts.actor = value();
    else if (arg === '--link') {
      const raw = value();
      const at = raw.indexOf('=');
      if (at < 1) throw new Error(`--link espera "etiqueta=url": ${raw}`);
      opts.links.push({ label: raw.slice(0, at), url: raw.slice(at + 1) });
    } else if (arg === '--test') opts.test = true;
    else if (arg === '--print') opts.print = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (!opts.title) throw new Error('Falta --title');
  if (opts.changelogFile && !opts.version) throw new Error('--changelog necesita --version');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let notes = opts.notesFile ? readFileSync(opts.notesFile, 'utf8') : '';
  if (opts.changelogFile) {
    notes = extractSection(readFileSync(opts.changelogFile, 'utf8'), opts.version);
    if (!notes) console.log(`::warning::El CHANGELOG no tiene seccion para ${opts.version}: el aviso sale sin notas.`);
  }
  const payload = buildMessage({ ...opts, notes });
  if (opts.print) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('::warning::Sin SLACK_WEBHOOK_URL (secret SDK_RELEASES_SLACK_WEBHOOK_URL): no se avisa en Slack.');
    console.log(payload.text);
    return;
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // No se imprime la URL: es el secret.
    console.log(`::warning::Slack respondio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  console.log(`Aviso enviado a Slack:\n${payload.text}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    // Con --print (CI de la PR) un error tiene que verse; en una release, solo avisar.
    if (process.argv.includes('--print')) {
      console.log(`::error::${err.message}`);
      process.exitCode = 1;
    } else {
      console.log(`::warning::No se pudo avisar en Slack: ${err.message}`);
    }
  });
}
