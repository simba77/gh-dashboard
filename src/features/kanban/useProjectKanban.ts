import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { ProjectItemRow } from '../../db/projectItems';
import { selectStatusOptions, type StatusOptionRow } from '../../db/projectStatusOptions';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';
import { getLastSyncAt, subscribeItems } from '../../sync/itemStore';
import { getInFlight, refreshAll, subscribeInFlight } from '../../sync/orchestrator';
import { useItems } from '../../sync/useItems';

export interface KanbanCard {
  itemId: string;
  title: string;
  url: string | null;
  number: number | null;
  assignees: string[];
  isDraft: boolean;
}

export interface KanbanColumn {
  // null id is the synthetic "no status" bucket for items whose Status value
  // doesn't match any current option (or is missing entirely).
  optionId: string | null;
  name: string;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  projectTitle: string;
  // null when the project has no "Status" single-select field. The widget
  // renders a hint instead of an empty board in that case.
  columns: KanbanColumn[] | null;
}

export interface KanbanState {
  board: KanbanBoard | null;
  loading: boolean;
  lastUpdated: Date | null;
  paused: boolean;
  refresh: () => void;
}

const NO_STATUS_LABEL = '(no status)';

function toCard(row: ProjectItemRow): KanbanCard {
  return {
    itemId: row.itemId,
    title: row.title,
    url: row.url,
    number: row.number,
    assignees: row.assignees,
    isDraft: row.isDraft,
  };
}

function buildBoard(
  projectId: string,
  rows: ProjectItemRow[],
  options: StatusOptionRow[],
): KanbanBoard {
  // projectTitle lives on the items (we don't store it per-project) — derive
  // from any one of them; empty board falls back to an empty string.
  const sample = rows.find((r) => r.projectId === projectId);
  const projectTitle = sample?.projectTitle ?? '';
  if (options.length === 0) {
    return { projectTitle, columns: null };
  }

  const buckets = new Map<string | null, KanbanCard[]>();
  for (const opt of options) {
    buckets.set(opt.optionId, []);
  }
  buckets.set(null, []);

  for (const r of rows) {
    if (r.projectId !== projectId) continue;
    const optionId = r.statusOptionId;
    const card = toCard(r);
    const bucket = buckets.get(optionId) ?? buckets.get(null);
    bucket?.push(card);
  }

  const columns: KanbanColumn[] = options.map((opt) => ({
    optionId: opt.optionId,
    name: opt.name,
    cards: buckets.get(opt.optionId) ?? [],
  }));
  const noStatus = buckets.get(null) ?? [];
  if (noStatus.length > 0) {
    columns.push({ optionId: null, name: NO_STATUS_LABEL, cards: noStatus });
  }
  return { projectTitle, columns };
}

// Reads board for one project from the shared item cache, joined with the
// project's Status options (loaded once per projectId on mount). Re-reads
// options each time a sync completes — handles the case where a column was
// added/renamed/removed on GitHub.
export function useProjectKanban(projectId: string | null): KanbanState {
  const { pausedUntil } = useRateLimit();
  const [options, setOptions] = useState<StatusOptionRow[]>([]);
  const lastSyncAt = useSyncExternalStore(subscribeItems, getLastSyncAt);

  useEffect(() => {
    if (!projectId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    selectStatusOptions(projectId)
      .then((next) => {
        if (!cancelled) {
          setOptions(next);
        }
      })
      .catch((e: unknown) => {
        logger.error('Failed to load status options', e);
      });
    return () => {
      cancelled = true;
    };
    // Re-run on lastSyncAt so a fresh sync that adds/renames options updates
    // the column list without forcing the user to refresh.
  }, [projectId, lastSyncAt]);

  const board = useItems(
    (rows): KanbanBoard | null => {
      if (!projectId) {
        return null;
      }
      return buildBoard(projectId, rows, options);
    },
    [projectId, options],
  );
  const loading = useSyncExternalStore(subscribeInFlight, getInFlight);
  const refresh = useCallback(() => {
    refreshAll().catch((e: unknown) => {
      logger.error('Refresh failed', e);
    });
  }, []);

  return {
    board,
    loading,
    lastUpdated: lastSyncAt ? new Date(lastSyncAt) : null,
    paused: (pausedUntil?.getTime() ?? 0) > Date.now(),
    refresh,
  };
}
