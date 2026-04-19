import { useEffect, useState } from 'react';

type HealthResponse = { ok: boolean; version: string };
type Status = 'loading' | 'online' | 'offline';

const STATUS_STYLES: Record<Status, { label: string; background: string; color: string }> = {
  loading: { label: '…', background: 'var(--bg-subtle)', color: 'var(--text-secondary)' },
  online: { label: 'Online', background: 'color-mix(in srgb, var(--accent-1) 14%, white)', color: 'var(--accent-1)' },
  offline: { label: 'Offline', background: 'color-mix(in srgb, var(--danger) 14%, white)', color: 'var(--danger)' },
};

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [version, setVersion] = useState('');

  useEffect(() => {
    let ignore = false;

    const loadHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Health request failed');
        const body: HealthResponse = await response.json();
        if (ignore) return;
        setStatus(body.ok ? 'online' : 'offline');
        setVersion(body.version);
      } catch {
        if (!ignore) setStatus('offline');
      }
    };

    void loadHealth();
    return () => {
      ignore = true;
    };
  }, []);

  const badge = STATUS_STYLES[status];

  return (
    <main className="flex min-h-screen items-center justify-center px-24">
      <section className="w-full max-w-lg rounded-lg bg-surface p-24 shadow-card">
        <h1 className="m-0 text-primary" style={{ fontSize: 'var(--text-2xl)', lineHeight: 'var(--leading-heading)' }}>
          PaperBanana
        </h1>
        <div
          className="mt-16 inline-flex rounded-pill px-12 py-8 font-medium"
          style={{ backgroundColor: badge.background, color: badge.color }}
        >
          {badge.label}
        </div>
        {status === 'online' ? (
          <p className="mb-0 mt-12 text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
            Version {version}
          </p>
        ) : null}
      </section>
    </main>
  );
}

