import { describe, it, expect } from 'vitest';
import { parseDeviceType, collectDeviceInfo } from './device-info';

describe('parseDeviceType', () => {
  it('detects mobile (iPhone)', () => {
    expect(
      parseDeviceType(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ),
    ).toBe('mobile');
  });

  it('detects tablet (iPad)', () => {
    expect(parseDeviceType('Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15')).toBe('tablet');
  });

  it('detects mobile (Android phone)', () => {
    expect(parseDeviceType('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36')).toBe(
      'mobile',
    );
  });

  it('detects tablet (Android without Mobile token)', () => {
    expect(parseDeviceType('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Safari/537.36')).toBe('tablet');
  });

  it('detects desktop', () => {
    expect(parseDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Safari/537.36')).toBe(
      'desktop',
    );
  });
});

describe('collectDeviceInfo', () => {
  it('includes device_type, user_agent and the client-provided app_version', () => {
    const info = collectDeviceInfo('1.2.3');
    expect(info.device_type).toBeTruthy();
    expect(typeof info.user_agent).toBe('string');
    expect(info.app_version).toBe('1.2.3');
  });

  it('omits app_version when not provided', () => {
    expect(collectDeviceInfo().app_version).toBeUndefined();
  });
});
