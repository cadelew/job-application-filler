import { describe, expect, it } from 'vitest';
import { runFill } from '../../src/core/engine';
import { alwaysVisible, sampleProfile } from './helpers';

describe('runFill engine', () => {
  it('fills high-confidence contact fields and skips sensitive ones', () => {
    document.body.innerHTML = `
      <label for="fn">First Name</label><input id="fn" />
      <label for="em">Email</label><input id="em" type="email" />
      <label for="auth">Are you legally authorized to work?</label><input id="auth" />
      <label for="pref">Preferred Location</label><input id="pref" />
    `;
    const report = runFill(sampleProfile, {
      root: document,
      isVisible: alwaysVisible,
      url: 'http://localhost/test',
    });
    expect(report.filled.map((f) => f.label).sort()).toEqual(['Email', 'First Name'].sort());
    expect(report.skipped.some((s) => /authorized|Sensitive/i.test(s.reason))).toBe(true);
    expect(report.skipped.some((s) => /Preferred|desired/i.test(s.reason))).toBe(true);
    expect((document.querySelector('#fn') as HTMLInputElement).value).toBe('Ada');
    expect((document.querySelector('#em') as HTMLInputElement).value).toBe('ada@example.com');
    expect((document.querySelector('#auth') as HTMLInputElement).value).toBe('');
    expect((document.querySelector('#pref') as HTMLInputElement).value).toBe('');
  });
});
