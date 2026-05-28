import { graphql } from '../client';

// Mirrors STATUS_FIELD_NAME in projectTestingItems — both widgets look up the
// same conventional "Status" single-select for display.
const STATUS_FIELD_NAME = 'Status';
const ITEMS_PAGE_SIZE = 100;

export const PROJECT_ASSIGNED_ITEMS_QUERY = `
  query ProjectAssignedItems($projectId: ID!, $first: Int!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        title
        items(first: $first, orderBy: {field: POSITION, direction: DESC}) {
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

export interface AssignedItem {
  itemId: string;
  projectTitle: string;
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  isDraft: boolean;
  // Other people the work has been delegated to.
  assignees: string[];
  // Display-only; null when project has no "Status" field or item has no value.
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
  // Issue/PR carry a state (OPEN/CLOSED/MERGED) we use to filter out finished
  // work. DraftIssue has no state — it's always considered open.
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

function isAuthoredBy(content: ContentRef, login: string): boolean {
  const originator = content.author?.login ?? content.creator?.login ?? null;
  return originator === login;
}

function isDelegated(content: ContentRef, login: string): boolean {
  const others = content.assignees.nodes.filter((a) => a.login !== login);
  return others.length > 0;
}

function isOpen(content: ContentRef): boolean {
  return content.state === undefined || content.state === 'OPEN';
}

// Fetches one project's items and returns those I created where the work is
// currently assigned to someone other than me, and isn't already closed/merged.
export async function fetchProjectAssignedItems(
  projectId: string,
  viewerLogin: string,
): Promise<AssignedItem[]> {
  const data = await graphql<Response>(PROJECT_ASSIGNED_ITEMS_QUERY, {
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
    if (
      !content ||
      !isAuthoredBy(content, viewerLogin) ||
      !isDelegated(content, viewerLogin) ||
      !isOpen(content)
    ) {
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
        assignees: content.assignees.nodes
          .filter((a) => a.login !== viewerLogin)
          .map((a) => a.login),
        status: statusOf(item),
      },
    ];
  });
}
