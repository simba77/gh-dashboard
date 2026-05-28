import { graphql } from '../client';

const STATUS_FIELD_NAME = 'Status';
const ITEMS_PAGE_SIZE = 100;

export const PROJECT_KANBAN_QUERY = `
  query ProjectKanban($projectId: ID!, $first: Int!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        title
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
        items(first: $first, orderBy: {field: POSITION, direction: DESC}) {
          nodes {
            id
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  name
                  field {
                    ... on ProjectV2SingleSelectField { name }
                  }
                }
              }
            }
            content {
              __typename
              ... on Issue {
                title url number
                assignees(first: 5) { nodes { login } }
              }
              ... on PullRequest {
                title url number
                assignees(first: 5) { nodes { login } }
              }
              ... on DraftIssue {
                title
                assignees(first: 5) { nodes { login } }
              }
            }
          }
        }
      }
    }
  }
`;

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
  // shows a hint instead of an empty board in that case.
  columns: KanbanColumn[] | null;
}

interface StatusOption {
  id: string;
  name: string;
}

interface SingleSelectFieldValue {
  __typename: 'ProjectV2ItemFieldSingleSelectValue';
  optionId: string | null;
  name: string | null;
  field: { name?: string };
}

interface OtherFieldValue {
  __typename: string;
}

type FieldValue = SingleSelectFieldValue | OtherFieldValue;

interface ContentRef {
  __typename: 'Issue' | 'PullRequest' | 'DraftIssue';
  title: string;
  url?: string;
  number?: number;
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
    field?: { options: StatusOption[] } | null;
    items?: { nodes: RawItem[] };
  } | null;
}

function isSingleSelect(v: FieldValue): v is SingleSelectFieldValue {
  return v.__typename === 'ProjectV2ItemFieldSingleSelectValue';
}

function statusOptionId(item: RawItem): string | null {
  for (const v of item.fieldValues.nodes) {
    if (isSingleSelect(v) && v.field.name === STATUS_FIELD_NAME) {
      return v.optionId;
    }
  }
  return null;
}

const NO_STATUS_COLUMN: { id: null; name: string } = { id: null, name: '(no status)' };

// Fetches one project's items and groups them into kanban columns by the
// "Status" single-select option. Column order follows the project's option
// order; items with missing or stale status land in a trailing fallback column.
export async function fetchProjectKanban(projectId: string): Promise<KanbanBoard> {
  const data = await graphql<Response>(PROJECT_KANBAN_QUERY, {
    projectId,
    first: ITEMS_PAGE_SIZE,
  });
  const project = data.node;
  if (!project) {
    throw new Error('Project not found');
  }
  const projectTitle = project.title ?? '';

  if (!project.field) {
    return { projectTitle, columns: null };
  }

  const options = project.field.options;
  const buckets = new Map<string | null, KanbanCard[]>();
  for (const opt of options) {
    buckets.set(opt.id, []);
  }
  buckets.set(NO_STATUS_COLUMN.id, []);

  for (const item of project.items?.nodes ?? []) {
    const content = item.content;
    if (!content) {
      continue;
    }
    const optionId = statusOptionId(item);
    const card: KanbanCard = {
      itemId: item.id,
      title: content.title,
      url: content.url ?? null,
      number: content.number ?? null,
      assignees: content.assignees.nodes.map((a) => a.login),
      isDraft: content.__typename === 'DraftIssue',
    };
    const bucket = buckets.get(optionId) ?? buckets.get(NO_STATUS_COLUMN.id);
    bucket?.push(card);
  }

  const columns: KanbanColumn[] = options.map((opt) => ({
    optionId: opt.id,
    name: opt.name,
    cards: buckets.get(opt.id) ?? [],
  }));
  const noStatus = buckets.get(NO_STATUS_COLUMN.id) ?? [];
  if (noStatus.length > 0) {
    columns.push({ optionId: NO_STATUS_COLUMN.id, name: NO_STATUS_COLUMN.name, cards: noStatus });
  }

  return { projectTitle, columns };
}
