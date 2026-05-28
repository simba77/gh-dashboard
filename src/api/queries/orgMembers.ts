import { graphql } from '../client';

// 100 covers the teams we expect. Larger orgs would need pagination, which
// isn't worth wiring until someone hits the limit.
const MEMBERS_PAGE_SIZE = 100;

export const ORG_MEMBERS_QUERY = `
  query OrgMembers($login: String!, $first: Int!) {
    organization(login: $login) {
      membersWithRole(first: $first) {
        nodes {
          login
          name
          avatarUrl
        }
      }
    }
  }
`;

export interface OrgMember {
  login: string;
  name: string | null;
  avatarUrl: string;
}

interface Response {
  organization: {
    membersWithRole: {
      nodes: OrgMember[];
    };
  } | null;
}

export async function fetchOrgMembers(login: string): Promise<OrgMember[]> {
  const data = await graphql<Response>(ORG_MEMBERS_QUERY, {
    login,
    first: MEMBERS_PAGE_SIZE,
  });
  if (!data.organization) {
    throw new Error(`Organization "${login}" not found or not accessible`);
  }
  return data.organization.membersWithRole.nodes;
}
