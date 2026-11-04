// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { comparePng, maskPng } from './compare.mjs';
import { evaluate, markdownSummary, passed, settingsFor, sha256 } from './check.mjs';
import { planApproval } from './approve.mjs';

/** PNG de `w×h` blanco con un rectángulo negro opcional. */
function png(w, h, rect = null) {
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inRect = rect && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
      img.data.fill(inRect ? 0 : 255, i, i + 3);
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

const button = { x: 20, y: 20, width: 10, height: 6 };
const moved = { x: 20, y: 24, width: 10, height: 6 };

describe('comparePng', () => {
  it('identical images match with 0 px', () => {
    const r = comparePng(png(60, 40, button), png(60, 40, button));
    expect(r).toMatchObject({ match: true, diffPixels: 0, region: null, diff: null });
  });

  it('a button moved 4 px is a difference, with its region and a diff image', () => {
    const r = comparePng(png(60, 40, button), png(60, 40, moved));
    expect(r.match).toBe(false);
    expect(r.diffPixels).toBeGreaterThan(0);
    expect(r.region).toEqual({ x: 20, y: 20, width: 10, height: 10 });
    expect(PNG.sync.read(r.diff).width).toBe(60);
  });

  it('maxDiffPixels lets a small difference through', () => {
    const r = comparePng(png(60, 40, button), png(60, 40, moved), { threshold: 0.01, maxDiffPixels: 100 });
    expect(r.match).toBe(true);
  });

  it('a size change never matches, whatever the tolerance', () => {
    const r = comparePng(png(60, 40), png(60, 44), { threshold: 0.01, maxDiffPixels: 1e9 });
    expect(r).toMatchObject({ match: false, sizeChanged: true });
    expect(r.diffPixels).toBe(60 * 4);
  });

  it('masked regions are ignored', () => {
    const mask = [{ x: 0, y: 0, width: 60, height: 32 }];
    const r = comparePng(maskPng(png(60, 40, button), mask), maskPng(png(60, 40, moved), mask));
    expect(r.match).toBe(true);
  });
});

describe('evaluate', () => {
  const A = png(60, 40, button);
  const B = png(60, 40, moved);
  const approvals = { baselines: { 'desktop/open.png': { sha256: sha256(A), approvalId: 'x1' } }, approvals: [] };
  const config = { compare: { threshold: 0.01, maxDiffPixels: 0 } };

  it('pass when the screenshot matches its approved baseline', () => {
    const rows = evaluate({ config, approvals, baselines: new Map([['desktop/open.png', A]]), actuals: new Map([['desktop/open.png', A]]) });
    expect(rows).toMatchObject([{ key: 'desktop/open.png', device: 'desktop', state: 'open', status: 'pass', approval: 'x1' }]);
    expect(passed(rows)).toBe(true);
  });

  it('diff when it changed', () => {
    const rows = evaluate({ config, approvals, baselines: new Map([['desktop/open.png', A]]), actuals: new Map([['desktop/open.png', B]]) });
    expect(rows[0].status).toBe('diff');
    expect(passed(rows)).toBe(false);
  });

  it('a new state without baseline fails (it is not approved automatically)', () => {
    const rows = evaluate({ config, approvals, baselines: new Map([['desktop/open.png', A]]), actuals: new Map([['desktop/open.png', A], ['desktop/new.png', A]]) });
    expect(rows.find((r) => r.key === 'desktop/new.png').status).toBe('missing_baseline');
    expect(passed(rows)).toBe(false);
  });

  it('a baseline without screenshot fails (a state cannot disappear silently)', () => {
    const rows = evaluate({ config, approvals, baselines: new Map([['desktop/open.png', A]]), actuals: new Map() });
    expect(rows[0].status).toBe('missing_actual');
  });

  it('a baseline replaced without approval fails even if the screenshot matches it', () => {
    const rows = evaluate({ config, approvals, baselines: new Map([['desktop/open.png', B]]), actuals: new Map([['desktop/open.png', B]]) });
    expect(rows[0]).toMatchObject({ status: 'unapproved_baseline' });
  });

  it('--captured-only ignores baselines without a screenshot, but still compares the captured ones', () => {
    const baselines = new Map([['desktop/open.png', A], ['desktop/other.png', A]]);
    const both = { baselines: { ...approvals.baselines, 'desktop/other.png': { sha256: sha256(A), approvalId: 'x1' } } };
    expect(evaluate({ config, approvals: both, baselines, actuals: new Map([['desktop/open.png', A]]), capturedOnly: true })).toMatchObject([{ key: 'desktop/open.png', status: 'pass' }]);
    expect(evaluate({ config, approvals: both, baselines, actuals: new Map([['desktop/open.png', B]]), capturedOnly: true })[0].status).toBe('diff');
  });

  it('a mask can be limited to some states or exclude some', () => {
    const cfg = { devices: { ios: { masks: [{ x: 0, y: 0, width: 1, height: 1, except: ['top'] }, { x: 1, y: 1, width: 1, height: 1, states: ['top'] }] } } };
    expect(settingsFor(cfg, 'ios', 'open').masks).toEqual([cfg.devices.ios.masks[0]]);
    expect(settingsFor(cfg, 'ios', 'top').masks).toEqual([cfg.devices.ios.masks[1]]);
  });

  it('nothing to compare is not a pass', () => {
    expect(passed([])).toBe(false);
  });

  it('the summary names SDK version, platform, devices and each failure', () => {
    const rows = evaluate({ config, approvals, baselines: new Map([['desktop/open.png', A]]), actuals: new Map([['desktop/open.png', B]]) });
    const md = markdownSummary(rows, { sdk: 'local', sdkVersion: '1.18.0-local', platform: 'web', devices: { desktop: 'Chromium 1280×860' } });
    expect(md).toContain('FAILED');
    expect(md).toContain('1.18.0-local');
    expect(md).toContain('`desktop`: Chromium 1280×860');
    expect(md).toContain('`desktop/open.png`');
  });
});

describe('planApproval', () => {
  const A = png(60, 40, button);
  const B = png(60, 40, moved);
  const base = { by: 'sarias980', reason: 'new button spacing', source: { runId: '123' }, now: new Date('2026-11-04T10:00:00Z') };

  it('approves only what changed, records who/when/why/source and the sha256', () => {
    const plan = planApproval({
      ...base,
      approvals: { baselines: { 'desktop/a.png': { sha256: sha256(A), approvalId: 'old' } }, approvals: [{ id: 'old' }] },
      baselines: new Map([['desktop/a.png', A]]),
      candidates: new Map([['desktop/a.png', A], ['desktop/b.png', B]]),
    });
    expect(plan.copy).toEqual(['desktop/b.png']);
    expect(plan.id).toBe('20261104T100000Z-123');
    expect(plan.approvals.baselines['desktop/b.png']).toEqual({ sha256: sha256(B), approvalId: plan.id });
    expect(plan.approvals.baselines['desktop/a.png'].approvalId).toBe('old');
    expect(plan.approvals.approvals).toHaveLength(2);
    expect(plan.approvals.approvals[1]).toMatchObject({ approvedBy: 'sarias980', reason: 'new button spacing', source: { runId: '123' } });
  });

  it('records the previous sha256 when a baseline is replaced', () => {
    const plan = planApproval({ ...base, approvals: { baselines: {}, approvals: [] }, baselines: new Map([['desktop/a.png', A]]), candidates: new Map([['desktop/a.png', B]]) });
    expect(plan.approvals.approvals[0].files).toEqual([{ key: 'desktop/a.png', sha256: sha256(B), previousSha256: sha256(A) }]);
  });

  it('--only limits the approval; --remove drops a baseline', () => {
    const plan = planApproval({
      ...base,
      only: ['desktop/b'],
      remove: ['desktop/a'],
      approvals: { baselines: { 'desktop/a.png': { sha256: sha256(A), approvalId: 'old' } }, approvals: [] },
      baselines: new Map([['desktop/a.png', A]]),
      candidates: new Map([['desktop/b.png', B], ['desktop/c.png', B]]),
    });
    expect(plan.copy).toEqual(['desktop/b.png']);
    expect(plan.remove).toEqual(['desktop/a.png']);
    expect(plan.approvals.baselines['desktop/a.png']).toBeUndefined();
  });

  it('nothing changed: no approval', () => {
    expect(planApproval({ ...base, approvals: {}, baselines: new Map([['d/a.png', A]]), candidates: new Map([['d/a.png', A]]) })).toBeNull();
  });

  it('a reason is mandatory', () => {
    expect(() => planApproval({ ...base, reason: ' ', approvals: {}, baselines: new Map(), candidates: new Map([['d/a.png', A]]) })).toThrow(/reason/);
  });
});
