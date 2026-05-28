import { graphql } from '../client';

// GitHub caps the search API at 1000 results overall, but the dashboard only
// needs the head of the queue. 50 is plenty and keeps payloads small.
const SEARCH_PAGE_SIZE = 50;
const SEARCH_QUERY = 'is:pr is:open review-requested:@me archived:false';

export const PR_AWAITING_REVIEW_QUERY = `
  query PrsAwaitingReview($search: String!, $first: Int!) {
    search(query: $search, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          isDraft
          updatedAt
          repository { nameWithOwner }
          author { login }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup { state }
              }
            }
          }
        }
      }
    }
  }
`;

// statusCheckRollup.state values per GitHub's GraphQL schema.
export type CiState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED';

export interface PrAwaitingReview {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  repository: string;
  author: string | null;
  ciState: CiState | null;
}

// Raw shape only — kept local so consumers see the cleaned-up `PrAwaitingReview`.
interface RawNode {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  repository: { nameWithOwner: string };
  author: { login: string } | null;
  commits: {
    nodes: {
      commit: {
        statusCheckRollup: { state: CiState } | null;
      };
    }[];
  };
}

interface SearchResponse {
  search: {
    // The search API returns a heterogeneous list; non-PR nodes (shouldn't
    // happen with `type: ISSUE` + `is:pr`, but the schema allows it) come
    // through as empty objects after the inline fragment.
    nodes: (RawNode | Record<string, never>)[];
  };
}

function isPrNode(node: RawNode | Record<string, never>): node is RawNode {
  return 'id' in node;
}

export async function fetchPrsAwaitingReview(): Promise<PrAwaitingReview[]> {
  const data = await graphql<SearchResponse>(PR_AWAITING_REVIEW_QUERY, {
    search: SEARCH_QUERY,
    first: SEARCH_PAGE_SIZE,
  });
  return data.search.nodes.filter(isPrNode).map((node) => ({
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    isDraft: node.isDraft,
    updatedAt: node.updatedAt,
    repository: node.repository.nameWithOwner,
    author: node.author?.login ?? null,
    ciState: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
  }));
}
