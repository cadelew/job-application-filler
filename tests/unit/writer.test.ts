import { describe, expect, it } from 'vitest';
import { fillField, isEffectivelyEmpty } from '../../src/core/writer';
import type { FieldDescriptor } from '../../src/shared/types';

function desc(partial: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id: 'f0',
    kind: 'text',
    inputType: 'text',
    label: 'First Name',
    labelSource: 'label-for',
    hints: [],
    name: null,
    htmlId: null,
    placeholder: null,
    autocomplete: null,
    section: null,
    required: false,
    disabled: false,
    readOnly: false,
    visible: true,
    currentValue: '',
    isEmpty: true,
    options: [],
    ...partial,
  };
}

describe('fillField', () => {
  it('fills text with native setter and events', () => {
    document.body.innerHTML = `<input id="fn" type="text" />`;
    const el = document.querySelector('#fn') as HTMLInputElement;
    let inputFired = false;
    el.addEventListener('input', () => {
      inputFired = true;
    });
    const result = fillField({
      element: el,
      value: 'Ada',
      field: desc(),
      profileKey: 'personal.firstName',
      confidence: 1,
    });
    expect(result.status).toBe('filled');
    expect(el.value).toBe('Ada');
    expect(inputFired).toBe(true);
  });

  it('does not overwrite nonempty values', () => {
    document.body.innerHTML = `<input id="fn" type="text" value="Existing" />`;
    const el = document.querySelector('#fn') as HTMLInputElement;
    const result = fillField({
      element: el,
      value: 'Ada',
      field: desc({ isEmpty: false, currentValue: 'Existing' }),
      profileKey: 'personal.firstName',
      confidence: 1,
    });
    expect(result.status).toBe('skipped');
    expect(result.code).toBe('prefilled');
    expect(el.value).toBe('Existing');
  });

  it('treats placeholder select as empty and fills', () => {
    document.body.innerHTML = `
      <select id="st">
        <option value="">Select...</option>
        <option value="CA">California</option>
      </select>
    `;
    const el = document.querySelector('#st') as HTMLSelectElement;
    expect(isEffectivelyEmpty(el)).toBe(true);
    const result = fillField({
      element: el,
      value: 'California',
      field: desc({ kind: 'select', inputType: 'select', isEmpty: true }),
      profileKey: 'personal.state',
      confidence: 1,
    });
    expect(result.status).toBe('filled');
    expect(el.value).toBe('CA');
  });

  it('never activates a submit button', () => {
    document.body.innerHTML = `
      <form>
        <input id="fn" type="text" />
        <button type="submit" id="go">Submit</button>
      </form>
    `;
    let submitted = false;
    document.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      submitted = true;
    });
    const el = document.querySelector('#fn') as HTMLInputElement;
    fillField({
      element: el,
      value: 'Ada',
      field: desc(),
      profileKey: 'personal.firstName',
      confidence: 1,
    });
    expect(submitted).toBe(false);
  });
});
