type Level = 'debug' | 'info' | 'warn' | 'error';

// HH:MM:SS.mmm — short enough to scan, precise enough to spot overlapping
// operations. We never log on a hot path, so the cost of constructing this
// per call is negligible.
function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function log(level: Level, message: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console -- this module is the single sanctioned console boundary
  console[level](`${timestamp()} [${level}] ${message}`, ...args);
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
