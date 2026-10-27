import { useCallback, useEffect, useState } from 'react';
import { loadProfile } from '../../src/profile/storage';
import type { Profile } from '../../src/profile/schema';
import type {
  FillResponse,
  ScanResponse,
} from '../../src/shared/messages';
import type { FieldDescriptor, FillReport } from '../../src/shared/types';

/** WXT emits runtime content scripts under content-scripts/<name>.js */
const CONTENT_SCRIPT_FILE = '/content-scripts/autofill.js';

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab.id;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'ping' });
    return;
  } catch {
    // not injected yet
  }
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE],
  });
}

async function sendToTab<T>(tabId: number, message: unknown): Promise<T> {
  await ensureContentScript(tabId);
  try {
    return (await browser.tabs.sendMessage(tabId, message)) as T;
  } catch {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
    return (await browser.tabs.sendMessage(tabId, message)) as T;
  }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDescriptor[]>([]);
  const [report, setReport] = useState<FillReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Ready');

  useEffect(() => {
    void (async () => {
      const result = await loadProfile();
      if (result.status === 'ok') {
        setProfile(result.profile);
        setProfileError(null);
      } else if (result.status === 'invalid') {
        setProfile(null);
        setProfileError('Saved profile is invalid. Open Options to fix it.');
      } else {
        setProfile(null);
        setProfileError('No profile saved yet. Open Options to add one.');
      }
    })();
  }, []);

  const openOptions = useCallback(() => {
    void browser.runtime.openOptionsPage();
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setReport(null);
    setStatus('Scanning…');
    try {
      const tabId = await getActiveTabId();
      const res = await sendToTab<ScanResponse>(tabId, { type: 'scan' });
      if (!res.ok) throw new Error(res.error);
      setFields(res.fields);
      setStatus(`Detected ${res.fields.length} field${res.fields.length === 1 ? '' : 's'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setStatus('Scan failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const fill = useCallback(async () => {
    if (!profile) {
      setError('Save a profile in Options first.');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus('Filling high-confidence fields…');
    try {
      const tabId = await getActiveTabId();
      const res = await sendToTab<FillResponse>(tabId, {
        type: 'fill',
        profile,
      });
      if (!res.ok) throw new Error(res.error);
      setReport(res.report);
      setStatus(
        `Filled ${res.report.filled.length} · review ${res.report.review.length} · skipped ${res.report.skipped.length}`,
      );
      // Refresh field list from a scan for the labels panel
      const scanned = await sendToTab<ScanResponse>(tabId, { type: 'scan' });
      if (scanned.ok) setFields(scanned.fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fill failed');
      setStatus('Fill failed');
    } finally {
      setBusy(false);
    }
  }, [profile]);

  return (
    <div className="app">
      <div>
        <h1>Job Application Autofill</h1>
        <p className="sub">
          Local-only. High-confidence fields only — you review and submit.
        </p>
      </div>

      {profileError && <p className="error">{profileError}</p>}
      {error && <p className="error">{error}</p>}

      <div className="row">
        <button type="button" className="primary" disabled={busy || !profile} onClick={() => void fill()}>
          Fill high-confidence fields
        </button>
        <button type="button" disabled={busy} onClick={() => void scan()}>
          Scan
        </button>
        <button type="button" className="btn-link" onClick={openOptions}>
          Options
        </button>
      </div>

      <p className="status">{status}</p>

      {fields.length > 0 && (
        <div className="report">
          <h2>Detected fields ({fields.length})</h2>
          <ul className="field-list">
            {fields.slice(0, 40).map((f) => (
              <li key={f.id}>
                {f.label || f.name || f.htmlId || f.id}
                {f.section ? <span className="reason"> · {f.section}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <div className="report">
          <h2>Fill report</h2>
          <div className="counts">
            <span data-k="filled">Filled {report.filled.length}</span>
            <span data-k="review">Review {report.review.length}</span>
            <span data-k="skipped">Skipped {report.skipped.length}</span>
            <span data-k="failed">Failed {report.failed.length}</span>
          </div>
          <ul className="field-list">
            {[...report.filled, ...report.review, ...report.failed, ...report.skipped]
              .slice(0, 50)
              .map((item) => (
                <li key={`${item.code}-${item.fieldId}`}>
                  <strong>{item.code}</strong> · {item.label || item.fieldId}
                  <div className="reason">{item.reason}</div>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
