import { describe, expect, it } from 'vitest';
import { buildMessage, extractSection, MAX_BULLETS, summarizeNotes, toMrkdwn } from './slack-notify.mjs';

const notes = [
  '### Fixed',
  '',
  '- **A popup that is not drawn is no longer counted as shown.** The browser renderer shows one',
  '  popup at a time, but the SDK still emitted `popup_shown`.',
  '- The SDK recovers when the renderer fails. More text here.',
  '',
  '### Added',
  '',
  '- **Compatibility manifest (MF-3241).** Every release ships a manifest.',
  '  - nested detail that is not an entry',
].join('\n');

describe('summarizeNotes', () => {
  it('one item per top-level bullet, with its group; bold title or first sentence', () => {
    expect(summarizeNotes(notes)).toEqual([
      { group: 'Fixed', text: 'A popup that is not drawn is no longer counted as shown' },
      { group: 'Fixed', text: 'The SDK recovers when the renderer fails' },
      { group: 'Added', text: 'Compatibility manifest (MF-3241)' },
    ]);
  });

  it('drops emoji from group headings and shortens long entries', () => {
    const items = summarizeNotes(`### ✨ Features\n\n- ${'word '.repeat(60)}`);
    expect(items[0].group).toBe('Features');
    expect(items[0].text.length).toBeLessThanOrEqual(161);
    expect(items[0].text.endsWith('…')).toBe(true);
  });
});

describe('extractSection', () => {
  const changelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## 🚀 [2.2.36] - 2026-10-27',
    '- **New (`RADIO` in a row):** one row.',
    '',
    '## 🚀 [2.2.3] - 2026-01-01',
    '- Old.',
    '',
    '## 0.7.5 - 2026-10-29',
    '',
    '### Fixed',
    '',
    '- **iOS 16 fix.** Body.',
  ].join('\n');

  it('finds the three heading styles and stops at the next version', () => {
    expect(extractSection(changelog, '2.2.36')).toBe('- **New (`RADIO` in a row):** one row.');
    expect(extractSection(changelog, '2.2.3')).toBe('- Old.');
    expect(extractSection(changelog, '0.7.5')).toBe('### Fixed\n\n- **iOS 16 fix.** Body.');
    expect(extractSection('## [1.17.2] — 2026-10-29\n\n- A.', '1.17.2')).toBe('- A.');
  });

  it('returns an empty string for a missing version', () => {
    expect(extractSection(changelog, '9.9.9')).toBe('');
  });

  it('strips the colon of a bold title', () => {
    expect(summarizeNotes(extractSection(changelog, '2.2.36'))).toEqual([{ group: '', text: 'New (`RADIO` in a row)' }]);
  });
});

describe('toMrkdwn', () => {
  it('converts bold and links and escapes Slack control characters', () => {
    expect(toMrkdwn('**a** & [docs](https://x.dev/a) <b>')).toBe('*a* &amp; <https://x.dev/a|docs> &lt;b&gt;');
  });
});

describe('buildMessage', () => {
  it('header, links and bullets', () => {
    const { text } = buildMessage({
      title: '@magicfeedback/popup-sdk 1.17.2',
      platform: 'Web (npm)',
      actor: 'sarias980',
      links: [{ label: 'GitHub Release', url: 'https://github.com/o/r/releases/tag/v1.17.2' }],
      notes,
    });
    expect(text.split('\n')).toEqual([
      '📦 *@magicfeedback/popup-sdk 1.17.2* published · Web (npm) · by sarias980',
      '<https://github.com/o/r/releases/tag/v1.17.2|GitHub Release>',
      '• _Fixed_ · A popup that is not drawn is no longer counted as shown',
      '• _Fixed_ · The SDK recovers when the renderer fails',
      '• _Added_ · Compatibility manifest (MF-3241)',
    ]);
  });

  it('caps the bullets and labels test messages', () => {
    const many = Array.from({ length: MAX_BULLETS + 3 }, (_, i) => `- Entry ${i}.`).join('\n');
    const { text } = buildMessage({ title: 'pkg 1.0.0', notes: many, test: true });
    const lines = text.split('\n');
    expect(lines[0].startsWith('🧪 TEST — 📦')).toBe(true);
    expect(lines.filter((l) => l.startsWith('• '))).toHaveLength(MAX_BULLETS);
    expect(lines.at(-1)).toBe('…and 3 more');
  });
});
