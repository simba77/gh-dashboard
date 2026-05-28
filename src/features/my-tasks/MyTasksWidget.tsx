import { openUrl } from '@tauri-apps/plugin-opener';

import type { ActiveItem } from '../../api/queries/projectActiveItems';
import { logger } from '../../lib/logger';
import { UpdatedAgo } from '../../ui/UpdatedAgo';
import { useMyTasks } from './useMyTasks';

function handleOpen(url: string): void {
  openUrl(url).catch((e: unknown) => {
    logger.error('Failed to open item url', e);
  });
}

function ItemRow({ item }: { item: ActiveItem }) {
  const inner = (
    <>
      <span className="widget__repo">{item.projectTitle}</span>
      {item.repository ? <span className="widget__repo">· {item.repository}</span> : null}
      {item.number !== null ? <span className="widget__num">#{item.number}</span> : null}
      <span className="widget__title">{item.title}</span>
      {item.status ? <span className="widget__tag">{item.status}</span> : null}
      {item.isDraft ? <span className="widget__tag">draft</span> : null}
    </>
  );
  const { url } = item;
  if (!url) {
    return <div className="widget__row widget__row--static">{inner}</div>;
  }
  return (
    <button
      type="button"
      className="widget__row"
      onClick={() => {
        handleOpen(url);
      }}
    >
      {inner}
    </button>
  );
}

export function MyTasksWidget({ viewerLogin }: { viewerLogin: string | null }) {
  const { items, loading, error, lastUpdated, refresh } = useMyTasks(viewerLogin);

  return (
    <section className="widget">
      <header className="widget__head">
        <h2>My open tasks</h2>
        <div className="widget__head-meta">
          <UpdatedAgo at={lastUpdated} />
          <button type="button" onClick={refresh} disabled={loading || !viewerLogin}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? <p className="login__error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="settings__hint">Nothing on your plate right now.</p>
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
