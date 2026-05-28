import { openUrl } from '@tauri-apps/plugin-opener';

import type { CiState } from '../../api/queries/prAwaitingReview';
import { logger } from '../../lib/logger';
import { usePrAwaitingReview } from './usePrAwaitingReview';

// Maps the GraphQL statusCheckRollup state to a coarse traffic-light bucket
// the dashboard can render as a coloured dot.
function ciClass(state: CiState | null): string {
  switch (state) {
    case 'SUCCESS':
      return 'ci-dot ci-dot--green';
    case 'PENDING':
    case 'EXPECTED':
      return 'ci-dot ci-dot--yellow';
    case 'FAILURE':
    case 'ERROR':
      return 'ci-dot ci-dot--red';
    case null:
      return 'ci-dot ci-dot--neutral';
  }
}

function ciLabel(state: CiState | null): string {
  return state === null ? 'No CI' : state.toLowerCase();
}

function handleOpen(url: string): void {
  openUrl(url).catch((e: unknown) => {
    logger.error('Failed to open PR url', e);
  });
}

export function PrAwaitingReviewWidget() {
  const { prs, loading, error, refresh } = usePrAwaitingReview();

  return (
    <section className="widget">
      <header className="widget__head">
        <h2>PRs awaiting my review</h2>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error ? <p className="login__error">{error}</p> : null}
      {!loading && !error && prs.length === 0 ? (
        <p className="settings__hint">Nothing to review right now.</p>
      ) : null}

      <ul className="widget__list">
        {prs.map((pr) => (
          <li key={pr.id}>
            <button
              type="button"
              className="widget__row"
              onClick={() => {
                handleOpen(pr.url);
              }}
            >
              <span className={ciClass(pr.ciState)} title={ciLabel(pr.ciState)} />
              <span className="widget__repo">{pr.repository}</span>
              <span className="widget__num">#{pr.number}</span>
              <span className="widget__title">{pr.title}</span>
              {pr.isDraft ? <span className="widget__tag">draft</span> : null}
              {pr.author ? <span className="widget__author">by {pr.author}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
