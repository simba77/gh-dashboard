import { graphql } from '../client';

const STATUS_FIELD_NAME = 'Status';
const ITEMS_PAGE_SIZE = 100;
// Terminal Status values that mean "no longer in flight". Compared
// case-insensitively so renamed-but-similar values still get filtered out.
const TERMINAL_STATUSES = new Set(['done', 'closed', 'cancelled', 'canceled']);

export const PROJECT_ACTIVE_ITEMS_QUERY = `
  query ProjectActiveItems($projectId: ID!, $first: Int!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        title
        items(first: $first) {
          nodes {
            id
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
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
                title url number state
                repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
              }
              ... on PullRequest {
                title url number state
                repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
              }
              ... on DraftIssue {
                title
                assignees(first: 10) { nodes { login } }
              }
            }
          }
        }
      }
    }
  }
`;

export interface ActiveItem {
  itemId: string;
  projectTitle: string;
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  isDraft: boolean;
  assignees: string[];
  // null when project has no Status field or item has no value — rendered as
  // the "(no status)" section on the team view.
  status: string | null;
}

interface SingleSelectFieldValue {
  __typename: 'ProjectV2ItemFieldSingleSelectValue';
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
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
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
    items?: { nodes: RawItem[] };
  } | null;
}

function isSingleSelect(v: FieldValue): v is SingleSelectFieldValue {
  return v.__typename === 'ProjectV2ItemFieldSingleSelectValue';
}

function statusOf(item: RawItem): string | null {
  for (const v of item.fieldValues.nodes) {
    if (isSingleSelect(v) && v.field.name === STATUS_FIELD_NAME) {
      return v.name;
    }
  }
  return null;
}

function isOpen(content: ContentRef): boolean {
  return content.state === undefined || content.state === 'OPEN';
}

function isTerminalStatus(status: string | null): boolean {
  return status !== null && TERMINAL_STATUSES.has(status.toLowerCase());
}

// Fetches one project's items and returns those that are still in flight:
// open (for Issue/PR) and not in a terminal Status. Used by the team view to
// build per-person workload across all tracked projects.
export async function fetchProjectActiveItems(projectId: string): Promise<ActiveItem[]> {
  const data = await graphql<Response>(PROJECT_ACTIVE_ITEMS_QUERY, {
    projectId,
    first: ITEMS_PAGE_SIZE,
  });
  const project = data.node;
  if (!project?.items) {
    return [];
  }
  const projectTitle = project.title ?? '';

  return project.items.nodes.flatMap((item) => {
    const content = item.content;
    if (!content || !isOpen(content)) {
      return [];
    }
    const status = statusOf(item);
    if (isTerminalStatus(status)) {
      return [];
    }
    return [
      {
        itemId: item.id,
        projectTitle,
        title: content.title,
        url: content.url ?? null,
        number: content.number ?? null,
        repository: content.repository?.nameWithOwner ?? null,
        isDraft: content.__typename === 'DraftIssue',
        assignees: content.assignees.nodes.map((a) => a.login),
        status,
      },
    ];
  });
}
