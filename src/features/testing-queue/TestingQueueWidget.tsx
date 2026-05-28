import { openUrl } from '@tauri-apps/plugin-opener';

import type { TestingItem } from '../../api/queries/projectTestingItems';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';
import { UpdatedAgo } from '../../ui/UpdatedAgo';
import { useTestingQueue } from './useTestingQueue';

function handleOpen(url: string): void {
  openUrl(url).catch((e: unknown) => {
    logger.error('Failed to open item url', e);
  });
}

function ItemRow({ item }: { item: TestingItem }) {
  const meta = (
    <>
      <span className="widget__repo">{item.projectTitle}</span>
      {item.repository ? <span className="widget__repo">· {item.repository}</span> : null}
      {item.number !== null ? <span className="widget__num">#{item.number}</span> : null}
      <span className="widget__title">{item.title}</span>
      {item.isDraft ? <span className="widget__tag">draft</span> : null}
      {item.assignees.length > 0 ? (
        <span className="widget__author">→ {item.assignees.join(', ')}</span>
      ) : null}
    </>
  );

  // Drafts have no external URL — render them as a non-interactive row so the
  // disabled-looking button doesn't pretend to be clickable. Destructuring
  // gives the closure below a non-nullable `url` without a `!` assertion.
  const { url } = item;
  if (!url) {
    return <div className="widget__row widget__row--static">{meta}</div>;
  }

  return (
    <button
      type="button"
      className="widget__row"
      onClick={() => {
        handleOpen(url);
      }}
    >
      {meta}
    </button>
  );
}

export function TestingQueueWidget({ viewerLogin }: { viewerLogin: string | null }) {
  const { items, loading, error, lastUpdated, paused, refresh } = useTestingQueue(viewerLogin);
  const { pausedUntil } = useRateLimit();
  const pauseTitle = pausedUntil
    ? `Rate-limited until ${pausedUntil.toLocaleTimeString()}`
    : undefined;

  return (
    <section className="widget">
      <header className="widget__head">
        <h2>Tasks in Testing waiting for me</h2>
        <div className="widget__head-meta">
          <UpdatedAgo at={lastUpdated} paused={paused} />
          <button
            type="button"
            onClick={refresh}
            disabled={loading || paused || !viewerLogin}
            title={pauseTitle}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? <p className="login__error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="settings__hint">Nothing in Testing assigned to you.</p>
      ) : null}

      <ul className="widget__list">
        {items.map((item) => (
          <li key={item.itemId}>
            <ItemRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
