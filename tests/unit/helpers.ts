import type { Profile } from '../../src/profile/schema';

export const sampleProfile: Profile = {
  version: 1,
  personal: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    preferredName: 'Ada',
    email: 'ada@example.com',
    phone: '555-0100',
    location: 'London, UK',
    addressLine1: '1 Analytical Engine Rd',
    addressLine2: '',
    city: 'London',
    state: 'England',
    postalCode: 'EC1A 1BB',
    country: 'UK',
  },
  links: {
    linkedin: 'https://linkedin.com/in/ada',
    github: 'https://github.com/ada',
    portfolio: 'https://ada.dev',
    website: 'https://ada.dev',
  },
  education: [
    {
      school: 'University of London',
      degree: 'BSc',
      fieldOfStudy: 'Mathematics',
      startDate: '2018-09',
      endDate: '2022-06',
      gpa: '3.9',
    },
  ],
  experience: [],
  answers: {
    authorizedToWorkInUS: true,
    requiresSponsorship: false,
    willingToRelocate: true,
    over18: true,
  },
  meta: { updatedAt: '2026-01-01T00:00:00.000Z' },
};

/** Always-visible stub for jsdom (no layout). */
export const alwaysVisible = () => true;
