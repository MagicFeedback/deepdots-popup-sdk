import { describe, expect, it } from 'vitest';
import { POPUP_CHANNEL, SDK_IDENTIFIER, SDK_VERSION } from './version';
import pkg from '../package.json';

describe('SDK identity', () => {
  it('takes the version from package.json, not from a hand-kept constant', () => {
    expect(SDK_VERSION).toBe(pkg.version);
  });

  it('identifies the web bundle as web@<version>', () => {
    expect(SDK_IDENTIFIER).toBe(`web@${pkg.version}`);
  });

  it('marks popup responses with the popup channel', () => {
    expect(POPUP_CHANNEL).toBe('popup');
  });
});
