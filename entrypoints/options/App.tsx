import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  createEmptyProfile,
  parseProfile,
  type Answers,
  type EducationEntry,
  type ProfileFieldError,
} from '@/src/profile/schema';
import { loadProfile, saveProfile } from '@/src/profile/storage';

type Section = 'personal' | 'links';
type Draft = {
  version: 1;
  personal: Record<string, string>;
  links: Record<string, string>;
  education: Record<string, string>[];
  experience: unknown[];
  answers: Answers;
  meta: { updatedAt: string };
};

const PERSONAL_FIELDS: [key: string, label: string, type?: string][] = [
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['preferredName', 'Preferred name'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone', 'tel'],
  ['location', 'Current location (e.g. "Seattle, WA")'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State / province'],
  ['postalCode', 'Postal code'],
  ['country', 'Country'],
];

const LINK_FIELDS: [key: string, label: string][] = [
  ['linkedin', 'LinkedIn URL'],
  ['github', 'GitHub URL'],
  ['portfolio', 'Portfolio URL'],
  ['website', 'Personal website'],
];

const EDUCATION_FIELDS: [key: keyof EducationEntry, label: string][] = [
  ['school', 'School'],
  ['degree', 'Degree'],
  ['fieldOfStudy', 'Field of study'],
  ['startDate', 'Start date'],
  ['endDate', 'End date'],
  ['gpa', 'GPA'],
];

const ANSWER_FIELDS: [key: keyof Answers, label: string][] = [
  ['authorizedToWorkInUS', 'Authorized to work in the US'],
  ['requiresSponsorship', 'Requires visa sponsorship'],
  ['willingToRelocate', 'Willing to relocate'],
  ['over18', 'Over 18'],
];

const EMPTY_EDUCATION: Record<string, string> = Object.fromEntries(EDUCATION_FIELDS.map(([k]) => [k, '']));

/** Overlays arbitrary (possibly invalid) data onto an empty draft so the form can render it. */
function toDraft(raw: unknown): Draft {
  const base = createEmptyProfile() as Draft;
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Draft>;
  return {
    ...base,
    personal: { ...base.personal, ...(r.personal ?? {}) },
    links: { ...base.links, ...(r.links ?? {}) },
    education: Array.isArray(r.education) ? r.education : [],
    experience: Array.isArray(r.experience) ? r.experience : [],
    answers: { ...(r.answers ?? {}) },
    meta: r.meta ?? base.meta,
  };
}

/** Drops the first education entry if the user left it entirely blank. */
function toSubmission(draft: Draft): Draft {
  const [first, ...rest] = draft.education;
  const firstBlank = !first || Object.values(first).every((v) => String(v ?? '').trim() === '');
  return { ...draft, education: firstBlank ? rest : draft.education };
}

function errorMap(errors: ProfileFieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of errors) map[e.path] ??= e.message;
  return map;
}

type Status = { kind: 'info' | 'success' | 'error'; text: string } | null;

export default function App() {
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [errors, setErrors] = useState<ProfileFieldError[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile().then((result) => {
      if (result.status === 'ok') setDraft(toDraft(result.profile));
      if (result.status === 'invalid') {
        setDraft(toDraft(result.raw));
        setErrors(result.errors);
        setStatus({ kind: 'error', text: 'The saved profile is invalid. Fix the highlighted fields and save.' });
      }
      if (result.status === 'none') setStatus({ kind: 'info', text: 'No profile saved yet.' });
      setLoading(false);
    });
  }, []);

  const fieldErrors = errorMap(errors);

  function setSectionField(section: Section, key: string, value: string) {
    setDraft((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
  }

  function setEducationField(key: string, value: string) {
    setDraft((d) => {
      const [first = EMPTY_EDUCATION, ...rest] = d.education;
      return { ...d, education: [{ ...EMPTY_EDUCATION, ...first, [key]: value }, ...rest] };
    });
  }

  function setAnswer(key: keyof Answers, value: string) {
    setDraft((d) => {
      const answers = { ...d.answers };
      if (value === '') delete answers[key];
      else answers[key] = value === 'yes';
      return { ...d, answers };
    });
  }

  async function onSave() {
    const result = await saveProfile(toSubmission(draft));
    if (result.ok) {
      setDraft(toDraft(result.profile));
      setErrors([]);
      setStatus({ kind: 'success', text: `Saved at ${new Date(result.profile.meta.updatedAt).toLocaleString()}.` });
    } else {
      setErrors(result.errors);
      setStatus({ kind: 'error', text: 'Not saved. Fix the highlighted fields.' });
    }
  }

  function onExport() {
    const parsed = parseProfile(toSubmission(draft));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setStatus({ kind: 'error', text: 'Fix the highlighted fields before exporting.' });
      return;
    }
    const blob = new Blob([JSON.stringify(parsed.profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setStatus({ kind: 'error', text: `${file.name} is not valid JSON.` });
      return;
    }
    setDraft(toDraft(raw));
    const parsed = parseProfile(raw);
    setErrors(parsed.ok ? [] : parsed.errors);
    setStatus(
      parsed.ok
        ? { kind: 'info', text: `Imported ${file.name}. Review and click Save to keep it.` }
        : { kind: 'error', text: `Imported ${file.name}, but it has errors. Fix them and save.` },
    );
  }

  if (loading) return <main className="page">Loading…</main>;

  const education = { ...EMPTY_EDUCATION, ...(draft.education[0] ?? {}) };
  const rootErrors = errors.filter((e) => !isRenderedPath(e.path));

  return (
    <main className="page">
      <header>
        <h1>Your profile</h1>
        <p className="muted">Stored only in this browser (chrome.storage.local). Never uploaded.</p>
      </header>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
      {rootErrors.length > 0 && (
        <ul className="status error">
          {rootErrors.map((e) => (
            <li key={e.path + e.message}>
              {e.path || 'profile'}: {e.message}
            </li>
          ))}
        </ul>
      )}

      <fieldset>
        <legend>Personal</legend>
        {PERSONAL_FIELDS.map(([key, label, type]) => (
          <TextField
            key={key}
            id={`personal.${key}`}
            label={label}
            type={type}
            value={draft.personal[key] ?? ''}
            error={fieldErrors[`personal.${key}`]}
            onChange={(v) => setSectionField('personal', key, v)}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>Links</legend>
        {LINK_FIELDS.map(([key, label]) => (
          <TextField
            key={key}
            id={`links.${key}`}
            label={label}
            type="url"
            value={draft.links[key] ?? ''}
            error={fieldErrors[`links.${key}`]}
            onChange={(v) => setSectionField('links', key, v)}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>Education (most recent)</legend>
        <p className="muted">Leave blank to skip. Only this entry is autofilled for now.</p>
        {EDUCATION_FIELDS.map(([key, label]) => (
          <TextField
            key={key}
            id={`education.0.${key}`}
            label={label}
            value={education[key] ?? ''}
            error={fieldErrors[`education.0.${key}`]}
            onChange={(v) => setEducationField(key, v)}
          />
        ))}
        {draft.education.length > 1 && (
          <p className="muted">{draft.education.length - 1} more education entries are kept from import.</p>
        )}
        {draft.experience.length > 0 && (
          <p className="muted">{draft.experience.length} experience entries are kept from import.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Answers</legend>
        <p className="muted">Saved for later. These questions are never autofilled yet.</p>
        {ANSWER_FIELDS.map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={`answers.${key}`}>{label}</label>
            <select
              id={`answers.${key}`}
              value={draft.answers[key] === undefined ? '' : draft.answers[key] ? 'yes' : 'no'}
              onChange={(e) => setAnswer(key, e.target.value)}
            >
              <option value="">Not set</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            {fieldErrors[`answers.${key}`] && <span className="error-text">{fieldErrors[`answers.${key}`]}</span>}
          </div>
        ))}
      </fieldset>

      <div className="actions">
        <button type="button" className="primary" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onExport}>
          Export JSON
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import JSON
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} />
      </div>
    </main>
  );
}

const RENDERED_PATHS = new Set([
  ...PERSONAL_FIELDS.map(([k]) => `personal.${k}`),
  ...LINK_FIELDS.map(([k]) => `links.${k}`),
  ...EDUCATION_FIELDS.map(([k]) => `education.0.${k}`),
  ...ANSWER_FIELDS.map(([k]) => `answers.${k}`),
]);

function isRenderedPath(path: string) {
  return RENDERED_PATHS.has(path);
}

function TextField(props: {
  id: string;
  label: string;
  type?: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && (
        <span id={errorId} className="error-text">
          {props.error}
        </span>
      )}
    </div>
  );
}
