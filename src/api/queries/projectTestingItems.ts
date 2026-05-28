import { graphql } from '../client';

// Conventional names: GitHub Projects v2 ships with a "Status" single-select
// field. We match by exact name — if a project renames it, the widget will
// simply show no items, which is the right failure mode for v1.
const STATUS_FIELD_NAME = 'Status';
const STATUS_TESTING = 'Testing';
// 100 items per project is the documented per-page max for ProjectV2.items.
// Boards larger than this won't show their tail until pagination is added.
const ITEMS_PAGE_SIZE = 100;

export const PROJECT_TESTING_ITEMS_QUERY = `
  query ProjectTestingItems($projectId: ID!, $first: Int!) {
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
                title url number
                author { login }
                repository { nameWithOwner }
                assignees(first: 10) { nodes { login } }
              }
              ... on PullRequest {
                title url number
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

export interface TestingItem {
  itemId: string;
  projectTitle: string;
  title: string;
  // null for draft issues, which exist only on the project board.
  url: string | null;
  number: number | null;
  repository: string | null;
  isDraft: boolean;
  // Developer(s) currently working on the item — shown so the postановщик
  // (viewer) knows whom to ping when verifying the work.
  assignees: string[];
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
  // Issue/PR use `author`, DraftIssue uses `creator`. Either may be null when
  // the original GitHub account is deleted/ghosted.
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
    items?: { nodes: RawItem[] };
  } | null;
}

function isSingleSelect(v: FieldValue): v is SingleSelectFieldValue {
  return v.__typename === 'ProjectV2ItemFieldSingleSelectValue';
}

function hasTestingStatus(item: RawItem): boolean {
  return item.fieldValues.nodes.some(
    (v) => isSingleSelect(v) && v.field.name === STATUS_FIELD_NAME && v.name === STATUS_TESTING,
  );
}

// In this workflow the task's author ("постановщик") is the one who verifies
// work moved into Testing — assignee stays as the developer. So "waiting for
// me" means items in Testing that I originally created.
function isAuthoredBy(content: ContentRef, login: string): boolean {
  const originator = content.author?.login ?? content.creator?.login ?? null;
  return originator === login;
}

// Fetches items of one ProjectV2 and returns those with Status="Testing" that
// are assigned to `viewerLogin`. Filtering is client-side — Projects v2's
// GraphQL has no server-side field-value filter.
export async function fetchProjectTestingItems(
  projectId: string,
  viewerLogin: string,
): Promise<TestingItem[]> {
  const data = await graphql<Response>(PROJECT_TESTING_ITEMS_QUERY, {
    projectId,
    first: ITEMS_PAGE_SIZE,
  });
  const project = data.node;
  if (!project?.items) {
    return [];
  }
  const projectTitle = project.title ?? '';

  // flatMap so the narrowing of `content` from the early returns flows into
  // the mapped object without needing a non-null assertion.
  return project.items.nodes.flatMap((item) => {
    const content = item.content;
    if (!content || !hasTestingStatus(item) || !isAuthoredBy(content, viewerLogin)) {
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
      },
    ];
  });
}
