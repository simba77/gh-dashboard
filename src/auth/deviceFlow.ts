import { invoke } from '@tauri-apps/api/core';

import { CLIENT_ID, OAUTH_SCOPES } from './config';

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}

// Requests a device + user code. The returned `user_code` and
// `verification_uri` are shown to the user.
export function startDeviceFlow(): Promise<DeviceCode> {
  return invoke<DeviceCode>('start_device_flow', {
    clientId: CLIENT_ID,
    scope: OAUTH_SCOPES,
  });
}

// Polls until the user authorizes. Resolves once the token has been saved to
// the OS keyring on the Rust side; rejects with a message on expiry/denial.
export function pollDeviceFlow(deviceCode: string, interval: number): Promise<void> {
  return invoke('poll_device_flow', {
    clientId: CLIENT_ID,
    deviceCode,
    interval,
  });
}
