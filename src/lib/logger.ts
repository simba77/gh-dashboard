type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console -- this module is the single sanctioned console boundary
  console[level](`[${level}] ${message}`, ...args);
}

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    log('debug', message, ...args);
  },
  info: (message: string, ...args: unknown[]): void => {
    log('info', message, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    log('warn', message, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    log('error', message, ...args);
  },
};
