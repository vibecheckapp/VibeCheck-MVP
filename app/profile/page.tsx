'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Profile = {
  id: string;
  username: string;
  display_name: string;
  spotify_user_id?: string | null;
  last_music_import_at?: string | null;
};

type LibrarySummary = {
  amount: number;
  period: 'short_term' | 'medium_term' | 'long_term';
  count: number;
};

function formatLibraryPeriod(period: LibrarySummary['period']) {
  if (period === 'short_term') return 'Last 4 weeks';
  if (period === 'medium_term') return 'Last 6 months';
  return 'All time';
}

export default function ProfilePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'login' | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [magicCode, setMagicCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState('');
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [showLibrariesModal, setShowLibrariesModal] = useState(false);

  const loadProfile = async (userId: string) => {
    const response = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) {
      throw new Error('Could not load profile.');
    }
    const data = await response.json();
    if (data?.user) {
      setProfile(data.user);
      setEditedDisplayName(data.user.display_name ?? '');
    }
    setLibraries(data?.libraries ?? []);
  };

  const handleDisplayNameUpdate = async () => {
    if (!profile || !editedDisplayName.trim()) return;
    setError('');
    const response = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.id, displayName: editedDisplayName.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not update display name.');
      return;
    }
    setProfile(data.user);
    setEditedDisplayName(data.user.display_name);
    setIsEditingName(false);
  };

  useEffect(() => {
    const savedUserId = window.localStorage.getItem('vibecheck-user-id');
    if (!savedUserId) return;

    loadProfile(savedUserId)
      .catch(() => undefined);
  }, []);

  const handleSpotifyConnect = () => {
    if (!profile) return;
    window.location.href = `/api/spotify/auth?playerId=${encodeURIComponent(profile.id)}&returnTo=%2Fprofile`;
  };

  const handleImport = async () => {
    if (!profile || isImporting) return;
    setError('');
    setImportMessage('');

    if (!profile.spotify_user_id) {
      const shouldConnect = window.confirm('Connect Spotify first to import your music libraries.');
      if (shouldConnect) {
        handleSpotifyConnect();
      }
      return;
    }

    setIsImporting(true);

    try {
      const response = await fetch('/api/profile/music/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Could not update your music profile.');
        return;
      }
      setImportMessage(`Imported ${data.libraries?.length ?? 0} libraries from Spotify.`);
      setProfile((current) => (current ? { ...current, last_music_import_at: data.updatedAt } : current));
      setLibraries(data.libraries ?? []);
    } catch {
      setError('Could not update your music profile.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!mode) return;

    setError('');
    setGeneratedCode('');
    setIsSubmitting(true);

    try {
      const response = await fetch(mode === 'create' ? '/api/profile' : '/api/profile/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'create'
            ? { username, displayName: displayName || username }
            : { username, magicCode },
        ),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }

      window.localStorage.setItem('vibecheck-user-id', data.user.id);
      await loadProfile(data.user.id);
      if (mode === 'create') {
        setGeneratedCode(data.magicCode);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profile) {
    return (
      <main className="page-shell">
        <section className="hero">
          <h1>Profile</h1>
          <div className="profile-name-hero card">
            <div className="profile-name-header">
              <span className="profile-name-label">Display Name</span>
              {!isEditingName ? (
                <button
                  type="button"
                  className="profile-icon-button"
                  aria-label="Edit display name"
                  title="Edit display name"
                  onClick={() => {
                    setEditedDisplayName(profile.display_name);
                    setIsEditingName(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20h4l10-10-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="m13 7 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
            <strong className="profile-name-value">{profile.display_name}</strong>
            <span className="profile-name-subline">@{profile.username}</span>
          </div>
          {generatedCode ? (
            <div className="card profile-section-card">
              <h2>Your magic code</h2>
              <p style={{ fontSize: '2.5rem', letterSpacing: '0.2em', fontWeight: 900 }}>{generatedCode}</p>
              <p className="hint">Save this code. You will need it to log in again.</p>
            </div>
          ) : null}
          <div className="card profile-music-card profile-section-card">
            <h2>Music Library</h2>
            <p className="hint">Connect Spotify and refresh your imported libraries when you want to update your music DNA.</p>
            <div className="actions profile-music-actions">
              <button type="button" className="button" onClick={() => setShowLibrariesModal(true)}>
                View libraries
              </button>
            </div>
          </div>
          <div className="actions profile-footer-actions">
            <button type="button" className="button btn-ghost" onClick={() => router.push('/')}>
              Back
            </button>
          </div>
        </section>
        {showLibrariesModal ? (
          <div className="modal-overlay" onClick={() => setShowLibrariesModal(false)}>
            <div className="modal-content" onClick={(event) => event.stopPropagation()}>
              <h2>Imported Libraries</h2>
              <p className="hint" style={{ marginTop: 0 }}>
                Last updated:{' '}
                {profile.last_music_import_at
                  ? new Date(profile.last_music_import_at).toLocaleString()
                  : 'Never'}
              </p>
              <div className="actions profile-music-actions" style={{ marginBottom: '0.75rem' }}>
                <button type="button" className="button" onClick={handleImport}>
                  {isImporting ? 'Updating…' : 'Update from Spotify'}
                </button>
              </div>
              <div className="profile-library-list">
                {libraries.length > 0 ? libraries.map((library) => (
                  <div key={`${library.period}-${library.amount}`} className="profile-library-item">
                    <span className="profile-library-title">Top {library.amount}</span>
                    <span className="profile-library-period">{formatLibraryPeriod(library.period)}</span>
                    <span className="profile-library-count">{library.count} songs</span>
                  </div>
                )) : (
                  <p className="hint" style={{ margin: 0 }}>No libraries imported yet.</p>
                )}
              </div>
              {importMessage ? <p className="success-message">{importMessage}</p> : null}
              {error ? <p className="error-message">{error}</p> : null}
              <button type="button" className="button btn-ghost" onClick={() => setShowLibrariesModal(false)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
        {isEditingName ? (
          <div className="modal-overlay" onClick={() => setIsEditingName(false)}>
            <div className="modal-content" onClick={(event) => event.stopPropagation()}>
              <h2>Edit display name</h2>
              <div className="entry-form profile-edit-name-form">
                <input
                  value={editedDisplayName}
                  onChange={(event) => setEditedDisplayName(event.target.value)}
                  placeholder="Display name"
                  aria-label="Display name"
                  maxLength={60}
                  autoFocus
                />
                <div className="actions">
                  <button type="button" className="button" onClick={handleDisplayNameUpdate}>Save name</button>
                  <button type="button" className="button btn-ghost" onClick={() => setIsEditingName(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>My Music DNA</h1>
        <p>Create a lightweight profile or return with your username and four-digit magic code.</p>
        {mode === null ? (
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="button"
              onClick={() => {
                setError('');
                setMode('create');
              }}
            >
              Create Profile
            </button>
            <button
              type="button"
              className="button btn-ghost"
              onClick={() => {
                setError('');
                setMode('login');
              }}
            >
              Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="entry-form">
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              aria-label="Username"
              autoComplete="username"
              required
            />
            {mode === 'create' ? (
              <input
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Display name"
                aria-label="Display name"
                required
              />
            ) : (
              <input
                name="magicCode"
                value={magicCode}
                onChange={(event) => setMagicCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Magic code"
                aria-label="Magic code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            )}
            <div className="actions">
              <button type="submit" className="button" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Profile' : 'Login'}
              </button>
              <button
                type="button"
                className="button btn-ghost"
                onClick={() => {
                  setMode(null);
                  setError('');
                  setIsSubmitting(false);
                }}
              >
                Back
              </button>
            </div>
            {error ? <p className="error-message">{error}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}
