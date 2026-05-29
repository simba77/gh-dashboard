import { openUrl } from '@tauri-apps/plugin-opener';

import { logger } from '../../lib/logger';
import { useAssignedByMe, type AssignedItem } from './useAssignedByMe';

function handleOpen(url: string): void {
  openUrl(url).catch((e: unknown) => {
    logger.error('Failed to open item url', e);
  });
}

function ItemRow({ item }: { item: AssignedItem }) {
  const meta = (
    <>
      <span className="widget__repo">{item.projectTitle}</span>
      {item.repository ? <span className="widget__repo">· {item.repository}</span> : null}
      {item.number !== null ? <span className="widget__num">#{item.number}</span> : null}
      <span className="widget__title">{item.title}</span>
      {item.status ? <span className="widget__tag">{item.status}</span> : null}
      {item.isDraft ? <span className="widget__tag">draft</span> : null}
      {item.assignees.length > 0 ? (
        <span className="widget__author">→ {item.assignees.join(', ')}</span>
      ) : null}
    </>
  );

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

export function AssignedByMeWidget({ viewerLogin }: { viewerLogin: string | null }) {
  const { items, loading } = useAssignedByMe(viewerLogin);

  return (
    <section className="widget">
      <header className="widget__head">
        <h2>Tasks I assigned to others</h2>
      </header>

      {!loading && items.length === 0 ? (
        <p className="settings__hint">Nothing delegated right now.</p>
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
