import { graphql } from '../client';
import type { UpsertItem } from '../../db/projectItems';

export interface StatusOption {
  optionId: string;
  name: string;
  position: number;
}

// Conventional names: GitHub Projects v2 ships with a "Status" single-select
// field. We match by exact name — if a project renames it, items will have
// `status: null` in our cache and widgets that filter by status see nothing.
const STATUS_FIELD_NAME = 'Status';
// 100 items/page is the documented per-page max for ProjectV2.items.
const PAGE_SIZE = 100;
// Hard cap on pagination depth to prevent runaway loops on misbehaving boards.
// 50 pages × 100 = 5000 items per project — well above anything reasonable.
const MAX_PAGES = 50;

// orderBy POSITION DESC pulls the *tail* first — that's where new items live
// in GitHub's default ordering, so active work surfaces in page 1 even on
// large boards. Without this, the first 100 items on a 127-item board were
// all `Done` and active Testing items were invisible.
// Status options come along on every page request — cheap (handful of options)
// and saves us a second round-trip just to refresh column metadata. Tail sync
// happily over-writes them with the same values; full sync also stores them.
const QUERY = `
  query ProjectItems($projectId: ID!, $first: Int!, $after: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        title
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
        items(first: $first, after: $after, orderBy: {field: POSITION, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  name
                  field { ... on ProjectV2SingleSelectField { name } }
                }
              }
            }
            content {
              __typename
              ... on Issue {
                title url number state
                author { login }
                repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
              }
              ... on PullRequest {
                title url number state
                author { login }
                repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
              }
              ... on DraftIssue {
                title
                creator { login }
                assignees(first: 10) { nodes { login } }
              }
            }
          }
        }
      }
    }
  }
`;

interface SingleSelectFieldValue {
  __typename: 'ProjectV2ItemFieldSingleSelectValue';
  optionId: string | null;
  name: string | null;
  field: { name?: string };
}

type FieldValue = SingleSelectFieldValue | { __typename: string };

interface ContentRef {
  __typename: 'Issue' | 'PullRequest' | 'DraftIssue';
  title: string;
  url?: string;
  number?: number;
  // OPEN/CLOSED on Issue; OPEN/CLOSED/MERGED on PR; absent on DraftIssue.
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  author?: { login: string } | null;
  creator?: { login: string } | null;
  repository?: { nameWithOwner: string };
  assignees: { nodes: { login: string }[] };
}

interface RawItem {
  id: string;
  fieldValues: { nodes: FieldValue[] };
  content: ContentRef | null;
}

interface Response {
  node: {
    title?: string;
    field?: { options: { id: string; name: string }[] } | null;
    items?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: RawItem[];
    };
  } | null;
}

function isSingleSelect(v: FieldValue): v is SingleSelectFieldValue {
  return v.__typename === 'ProjectV2ItemFieldSingleSelectValue';
}

function statusValueOf(item: RawItem): { name: string | null; optionId: string | null } {
  for (const v of item.fieldValues.nodes) {
    if (isSingleSelect(v) && v.field.name === STATUS_FIELD_NAME) {
      return { name: v.name, optionId: v.optionId };
    }
  }
  return { name: null, optionId: null };
}

function toUpsert(projectId: string, projectTitle: string, item: RawItem): UpsertItem | null {
  const content = item.content;
  if (!content) {
    return null;
  }
  const status = statusValueOf(item);
  return {
    itemId: item.id,
    projectId,
    projectTitle,
    contentType: content.__typename,
    title: content.title,
    url: content.url ?? null,
    number: content.number ?? null,
    repository: content.repository?.nameWithOwner ?? null,
    author: content.author?.login ?? content.creator?.login ?? null,
    assignees: content.assignees.nodes.map((a) => a.login),
    status: status.name,
    statusOptionId: status.optionId,
    contentState: content.state ?? null,
    isDraft: content.__typename === 'DraftIssue',
  };
}

export interface FetchResult {
  projectTitle: string;
  items: UpsertItem[];
  // Status options come back on every page so the sync layer can replace the
  // cached set without a separate request. null when the project has no
  // single-select field named "Status".
  statusOptions: StatusOption[] | null;
  hasMore: boolean;
  // null when hasMore=false. Pass back into the next call to advance.
  nextCursor: string | null;
}

// Fetches a single page. `cursor=null` starts from the beginning of the DESC
// order (i.e. the newest items). Used by both full and tail sync — tail sync
// just stops after page 1.
export async function fetchProjectItemsPage(
  projectId: string,
  cursor: string | null,
): Promise<FetchResult> {
  const data = await graphql<Response>(QUERY, {
    projectId,
    first: PAGE_SIZE,
    after: cursor,
  });
  const project = data.node;
  if (!project?.items) {
    return {
      projectTitle: '',
      items: [],
      statusOptions: null,
      hasMore: false,
      nextCursor: null,
    };
  }
  const projectTitle = project.title ?? '';
  const items = project.items.nodes
    .map((it) => toUpsert(projectId, projectTitle, it))
    .filter((x): x is UpsertItem => x !== null);
  const statusOptions =
    project.field?.options.map((o, i) => ({ optionId: o.id, name: o.name, position: i })) ?? null;
  return {
    projectTitle,
    items,
    statusOptions,
    hasMore: project.items.pageInfo.hasNextPage,
    nextCursor: project.items.pageInfo.endCursor,
  };
}

export interface FullFetchResult {
  items: UpsertItem[];
  statusOptions: StatusOption[] | null;
}

// Walks all pages of a project's items. Status options are identical across
// pages, so we keep the value from the first non-null page and ignore the
// rest. Caller decides what to store (full sync replaces, tail sync upserts).
export async function fetchAllProjectItems(projectId: string): Promise<FullFetchResult> {
  const items: UpsertItem[] = [];
  let statusOptions: StatusOption[] | null = null;
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetchProjectItemsPage(projectId, cursor);
    items.push(...res.items);
    statusOptions ??= res.statusOptions;
    if (!res.hasMore || !res.nextCursor) {
      return { items, statusOptions };
    }
    cursor = res.nextCursor;
  }
  // Hit the safety cap — return what we have; the sync layer logs it.
  return { items, statusOptions };
}
