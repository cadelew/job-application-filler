import { describe, expect, it } from 'vitest';
import { scanForm } from '../../src/core/scanner';
import { alwaysVisible } from './helpers';

describe('scanForm', () => {
  it('extracts label[for] and section from fieldset legend', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Contact</legend>
        <label for="fn">First Name</label>
        <input id="fn" name="first_name" type="text" />
      </fieldset>
    `;
    const { fields } = scanForm(document, alwaysVisible);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe('First Name');
    expect(fields[0]!.labelSource).toBe('label-for');
    expect(fields[0]!.section).toBe('Contact');
  });

  it('reads aria-label and aria-labelledby', () => {
    document.body.innerHTML = `
      <span id="em">Email Address</span>
      <input aria-labelledby="em" type="email" />
      <input aria-label="Phone Number" type="tel" />
    `;
    const { fields } = scanForm(document, alwaysVisible);
    expect(fields.map((f) => f.label)).toEqual(['Email Address', 'Phone Number']);
    expect(fields[0]!.labelSource).toBe('aria-labelledby');
    expect(fields[1]!.labelSource).toBe('aria-label');
  });

  it('treats placeholder select option as empty', () => {
    document.body.innerHTML = `
      <label for="st">State</label>
      <select id="st">
        <option value="">Select...</option>
        <option value="CA">California</option>
      </select>
    `;
    const { fields } = scanForm(document, alwaysVisible);
    expect(fields[0]!.isEmpty).toBe(true);
    expect(fields[0]!.options[0]!.isPlaceholder).toBe(true);
  });

  it('skips hidden/submit/file from fillable set appropriately', () => {
    document.body.innerHTML = `
      <input type="hidden" name="csrf" value="x" />
      <input type="submit" value="Apply" />
      <input type="file" name="resume" />
      <input type="text" aria-label="Name" />
    `;
    const { fields } = scanForm(document, alwaysVisible);
    const kinds = fields.map((f) => f.kind);
    expect(kinds).toContain('text');
    expect(kinds).toContain('file');
    expect(kinds).not.toContain('other');
    expect(fields.some((f) => f.inputType === 'submit')).toBe(false);
    expect(fields.some((f) => f.inputType === 'hidden')).toBe(false);
  });

  it('respects injectable visibility', () => {
    document.body.innerHTML = `<input aria-label="Secret" type="text" />`;
    const { fields } = scanForm(document, () => false);
    expect(fields).toHaveLength(0);
  });
});
