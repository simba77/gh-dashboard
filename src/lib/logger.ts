import {
  attachConsole,
  debug as logDebug,
  error as logError,
  info as logInfo,
  warn as logWarn,
} from '@tauri-apps/plugin-log';

type Level = 'debug' | 'info' | 'warn' | 'error';

// Tauri's log plugin needs a one-time attach so its records also reach the
// browser console (alongside Rust stdout). Fire-and-forget on module load —
// if it fails we still get the Rust-side stream.
attachConsole().catch(() => {
  // Logging the failure would itself require the very thing we just failed
  // to set up; swallow to keep boot quiet.
});

function format(message: string, args: unknown[]): string {
  if (args.length === 0) {
    return message;
  }
  // Serialise extra args inline so the unified stream keeps one record per
  // call (otherwise `info(msg, obj)` would split across two lines in Rust
  // stdout). Errors get special treatment so the stack is preserved.
  const tail = args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
      }
      try {
        return typeof a === 'string' ? a : JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  return `${message} ${tail}`;
}

function send(level: Level, message: string, args: unknown[]): void {
  const text = format(message, args);
  // tauri-plugin-log returns Promises; we don't await — logging is fire-and
  // -forget. Errors during transport are dropped (same as console.* would).
  switch (level) {
    case 'debug':
      void logDebug(text);
      break;
    case 'info':
      void logInfo(text);
      break;
    case 'warn':
      void logWarn(text);
      break;
    case 'error':
      void logError(text);
      break;
  }
}

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    send('debug', message, args);
  },
  info: (message: string, ...args: unknown[]): void => {
    send('info', message, args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    send('warn', message, args);
  },
  error: (message: string, ...args: unknown[]): void => {
    send('error', message, args);
  },
};
