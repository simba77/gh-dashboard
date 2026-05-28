import { useEffect, useReducer } from 'react';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
// Re-render interval. 10s is fine-grained enough to make "Ns ago" feel live
// without churning React for nothing while a card sits idle.
const TICK_MS = 10 * SECOND;

function formatAgo(at: Date): string {
  const diff = Date.now() - at.getTime();
  if (diff < 5 * SECOND) {
    return 'just now';
  }
  if (diff < MINUTE) {
    return `${String(Math.floor(diff / SECOND))}s ago`;
  }
  if (diff < HOUR) {
    return `${String(Math.floor(diff / MINUTE))}m ago`;
  }
  return `${String(Math.floor(diff / HOUR))}h ago`;
}

// `paused` flags that polling is held off (rate limit) — appended so the user
// understands the `lastUpdated` figure has stopped advancing on purpose, and
// that the cause is global (mirrored by the top-of-app banner).
export function UpdatedAgo({ at, paused = false }: { at: Date | null; paused?: boolean }) {
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const id = window.setInterval(() => {
      force();
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  if (!at) {
    return paused ? <span className="updated-ago">Paused</span> : null;
  }
  return (
    <span className="updated-ago">
      Updated {formatAgo(at)}
      {paused ? ' · paused' : ''}
    </span>
  );
}
