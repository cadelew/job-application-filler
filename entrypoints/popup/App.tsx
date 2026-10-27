import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { loadProfile, type LoadProfileResult } from '@/src/profile/storage';

export default function App() {
  const [profile, setProfile] = useState<LoadProfileResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  function onFill() {
    setMessage('Filling is not implemented yet.');
  }

  return (
    <main className="popup">
      <h1>Job Application Autofill</h1>

      {profile?.status === 'none' && <p className="muted">No profile yet. Set one up first.</p>}
      {profile?.status === 'invalid' && <p className="error">Your saved profile is invalid. Fix it in settings.</p>}

      <button type="button" className="primary" disabled={profile?.status !== 'ok'} onClick={onFill}>
        Fill high-confidence fields
      </button>

      {message && <p className="muted">{message}</p>}

      <button type="button" className="link" onClick={() => browser.runtime.openOptionsPage()}>
        Edit profile
      </button>
    </main>
  );
}
