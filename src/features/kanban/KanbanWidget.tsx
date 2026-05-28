import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';

import type { KanbanCard, KanbanColumn } from '../../api/queries/projectKanban';
import { logger } from '../../lib/logger';
import { loadSettings } from '../../settings/settingsStore';
import { UpdatedAgo } from '../../ui/UpdatedAgo';
import { useProjectKanban } from './useProjectKanban';

interface TabProject {
  id: string;
  title: string;
  orgLogin: string;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handleOpen(url: string): void {
  openUrl(url).catch((e: unknown) => {
    logger.error('Failed to open card url', e);
  });
}

function Card({ card }: { card: KanbanCard }) {
  const inner = (
    <>
      {card.number !== null ? <span className="kanban__num">#{card.number}</span> : null}
      <span className="kanban__title">{card.title}</span>
      {card.isDraft ? <span className="widget__tag">draft</span> : null}
      {card.assignees.length > 0 ? (
        <span className="kanban__assignees">{card.assignees.join(', ')}</span>
      ) : null}
    </>
  );

  const { url } = card;
  if (!url) {
    return <div className="kanban__card kanban__card--static">{inner}</div>;
  }
  return (
    <button
      type="button"
      className="kanban__card"
      onClick={() => {
        handleOpen(url);
      }}
    >
      {inner}
    </button>
  );
}

function Column({ column }: { column: KanbanColumn }) {
  return (
    <div className="kanban__col">
      <header className="kanban__col-head">
        <span>{column.name}</span>
        <span className="kanban__count">{column.cards.length}</span>
      </header>
      <div className="kanban__col-body">
        {column.cards.map((card) => (
          <Card key={card.itemId} card={card} />
        ))}
      </div>
    </div>
  );
}

function BoardView({ projectId }: { projectId: string }) {
  const { board, loading, error, lastUpdated, refresh } = useProjectKanban(projectId);

  return (
    <div className="kanban__board">
      <div className="kanban__toolbar">
        <UpdatedAgo at={lastUpdated} />
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error ? <p className="login__error">{error}</p> : null}
      {!error && board?.columns === null ? (
        <p className="settings__hint">
          Project has no &quot;Status&quot; single-select field — nothing to render as columns.
        </p>
      ) : null}
      {board?.columns ? (
        <div className="kanban__cols">
          {board.columns.map((col) => (
            <Column key={col.optionId ?? '__none__'} column={col} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function KanbanWidget() {
  const [tabs, setTabs] = useState<TabProject[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings()
      .then((s) => {
        const flat = s.orgs.flatMap((o) => {
          const tracked = new Set(o.trackedProjectIds);
          return o.projects
            .filter((p) => tracked.has(p.id))
            .map((p) => ({ id: p.id, title: p.title, orgLogin: o.login }));
        });
        setTabs(flat);
        setActive((current) => current ?? flat[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        logger.error('Failed to load tracked projects', e);
        setError(toMessage(e));
      });
  }, []);

  return (
    <section className="widget">
      <header className="widget__head">
        <h2>Kanban</h2>
      </header>

      {error ? <p className="login__error">{error}</p> : null}
      {!error && tabs.length === 0 ? (
        <p className="settings__hint">No projects tracked. Add some in Settings.</p>
      ) : null}

      {tabs.length > 0 ? (
        <>
          <div className="kanban__tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === active ? 'kanban__tab kanban__tab--active' : 'kanban__tab'}
                onClick={() => {
                  setActive(tab.id);
                }}
                title={`${tab.orgLogin}/${tab.title}`}
              >
                {tab.title}
              </button>
            ))}
          </div>
          {active ? <BoardView projectId={active} /> : null}
        </>
      ) : null}
    </section>
  );
}
