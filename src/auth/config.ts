// Public OAuth App client ID (Device Flow). Safe to embed: this is a public
// client with no secret. Registered on github.com with Device Flow enabled.
export const CLIENT_ID = 'Ov23li4UeC6bYxWkII2O';

// Scopes required by the dashboard widgets:
// - read:org     org membership + projects
// - read:project Projects v2 boards and items
// - repo         read access to issues/PRs and their status
export const OAUTH_SCOPES = 'read:org read:project repo';
