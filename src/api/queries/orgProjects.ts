import { graphql } from '../client';

// Up to 100 projects per org. Pagination is out of scope for v1: an org with
// more than 100 ProjectsV2 boards is not a case we support yet.
const PROJECTS_PAGE_SIZE = 100;

export const ORG_PROJECTS_QUERY = `
  query OrgProjects($login: String!, $first: Int!) {
    organization(login: $login) {
      projectsV2(first: $first) {
        nodes {
          id
          title
          number
        }
      }
    }
  }
`;

export interface OrgProject {
  id: string;
  title: string;
  number: number;
}

interface OrgProjectsResponse {
  organization: {
    projectsV2: {
      nodes: OrgProject[];
    };
  } | null;
}

// Lists the ProjectsV2 boards of an organization by its login (slug). Throws if
// the org does not exist or the token lacks access to it.
export async function fetchOrgProjects(login: string): Promise<OrgProject[]> {
  const data = await graphql<OrgProjectsResponse>(ORG_PROJECTS_QUERY, {
    login,
    first: PROJECTS_PAGE_SIZE,
  });
  if (!data.organization) {
    throw new Error(`Organization "${login}" not found or not accessible`);
  }
  return data.organization.projectsV2.nodes;
}
