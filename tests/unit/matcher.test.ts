import { describe, expect, it } from 'vitest';
import { matchField, normalize, FIELD_ALIASES } from '../../src/core/matcher';
import type { FieldDescriptor } from '../../src/shared/types';
import { sampleProfile } from './helpers';

function field(partial: Partial<FieldDescriptor> & { label: string }): FieldDescriptor {
  return {
    id: partial.id ?? 'f0',
    kind: partial.kind ?? 'text',
    inputType: partial.inputType ?? 'text',
    label: partial.label,
    labelSource: partial.labelSource ?? 'label-for',
    hints: partial.hints ?? [],
    name: partial.name ?? null,
    htmlId: partial.htmlId ?? null,
    placeholder: partial.placeholder ?? null,
    autocomplete: partial.autocomplete ?? null,
    section: partial.section ?? null,
    required: partial.required ?? false,
    disabled: partial.disabled ?? false,
    readOnly: partial.readOnly ?? false,
    visible: partial.visible ?? true,
    currentValue: partial.currentValue ?? '',
    isEmpty: partial.isEmpty ?? true,
    options: partial.options ?? [],
  };
}

describe('normalize', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalize('First_Name!!')).toBe('first name');
    expect(normalize("Candidate's E-Mail")).toBe('candidates e mail');
  });
});

describe('roadmap 10-case table', () => {
  it('first_name label → personal.firstName', () => {
    const m = matchField(field({ label: 'First Name', name: 'first_name' }), sampleProfile);
    expect(m.profileKey).toBe('personal.firstName');
    expect(m.decision).toBe('fill');
  });

  it('Given Name → personal.firstName', () => {
    const m = matchField(field({ label: 'Given Name' }), sampleProfile);
    expect(m.profileKey).toBe('personal.firstName');
    expect(m.decision).toBe('fill');
  });

  it('Email Address → personal.email', () => {
    const m = matchField(field({ label: 'Email Address' }), sampleProfile);
    expect(m.profileKey).toBe('personal.email');
    expect(m.decision).toBe('fill');
  });

  it('Current Location → personal.location', () => {
    const m = matchField(field({ label: 'Current Location' }), sampleProfile);
    expect(m.profileKey).toBe('personal.location');
    expect(m.decision).toBe('fill');
  });

  it('Preferred Location does not use current location', () => {
    const m = matchField(field({ label: 'Preferred Location' }), sampleProfile);
    expect(m.profileKey).toBeNull();
    expect(m.decision).toBe('skip');
  });

  it('Unknown question is skipped', () => {
    const m = matchField(field({ label: 'Favorite programming paradigm' }), sampleProfile);
    expect(m.decision).toBe('skip');
    expect(m.profileKey).toBeNull();
  });

  it('Existing user value is a writer concern; matcher still returns a match', () => {
    const m = matchField(
      field({ label: 'Email', currentValue: 'other@x.com', isEmpty: false }),
      sampleProfile,
    );
    expect(m.profileKey).toBe('personal.email');
    expect(m.decision).toBe('fill');
  });

  it('Disabled field still matches; writer skips', () => {
    const m = matchField(field({ label: 'Phone', disabled: true }), sampleProfile);
    expect(m.profileKey).toBe('personal.phone');
  });

  it('Duplicate ambiguous labels require review', () => {
    const fields = [
      field({ id: 'f0', label: 'Start Date', section: 'Education' }),
      field({ id: 'f1', label: 'Start Date', section: 'Experience' }),
    ];
    const m = matchField(fields[1]!, sampleProfile, { allFields: fields });
    expect(m.decision).toBe('review');
  });

  it('Empty profile value is skipped', () => {
    const emptyPhone = {
      ...sampleProfile,
      personal: { ...sampleProfile.personal, phone: '' },
    };
    const m = matchField(field({ label: 'Phone Number' }), emptyPhone);
    expect(m.decision).toBe('skip');
    expect(m.reason).toMatch(/empty/i);
  });
});

describe('~20 common application questions', () => {
  const cases: [string, string | null][] = [
    ['First Name', 'personal.firstName'],
    ['Last Name', 'personal.lastName'],
    ['Full Name', 'personal.fullName'],
    ['Email', 'personal.email'],
    ['Phone Number', 'personal.phone'],
    ['Mobile', 'personal.phone'],
    ['Current Location', 'personal.location'],
    ['City', 'personal.city'],
    ['State', 'personal.state'],
    ['Country', 'personal.country'],
    ['LinkedIn Profile', 'links.linkedin'],
    ['GitHub URL', 'links.github'],
    ['Portfolio', 'links.portfolio'],
    ['Website', 'links.website'],
    ['University', 'education.0.school'],
    ['School Name', 'education.0.school'],
    ['Degree', 'education.0.degree'],
    ['Field of Study', 'education.0.fieldOfStudy'],
    ['GPA', 'education.0.gpa'],
    ['Desired Work Location', null],
    ['Are you legally authorized to work in the US?', null],
    ['Will you now or in the future require sponsorship?', null],
    ['Gender', null],
    ['Race / Ethnicity', null],
    ['Veteran Status', null],
    ['Do you have a disability?', null],
    ['Expected Salary', null],
    ['How did you hear about us?', null],
  ];

  for (const [label, key] of cases) {
    it(`"${label}" → ${key ?? 'skip'}`, () => {
      const m = matchField(field({ label }), sampleProfile);
      if (key == null) {
        expect(m.profileKey).toBeNull();
        expect(m.decision === 'skip' || m.sensitive).toBe(true);
      } else {
        expect(m.profileKey).toBe(key);
        expect(m.decision).toBe('fill');
      }
    });
  }
});

describe('FIELD_ALIASES coverage', () => {
  it('defines aliases for every profile field key', () => {
    expect(Object.keys(FIELD_ALIASES).length).toBeGreaterThan(10);
  });
});
