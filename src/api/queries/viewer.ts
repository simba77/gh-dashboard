import { graphql } from '../client';

export const VIEWER_QUERY = `
  query Viewer {
    viewer {
      login
    }
  }
`;

export interface ViewerResponse {
  viewer: {
    login: string;
  };
}

// Verifies the stored token works by resolving the current user's login.
export function fetchViewer(): Promise<ViewerResponse> {
  return graphql<ViewerResponse>(VIEWER_QUERY);
}
