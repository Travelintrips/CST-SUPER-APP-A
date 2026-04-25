const MAX_ENTRIES = 100;

export interface ResponseTimeEntry {
  timestamp: string;
  path: string;
  durationMs: number;
}

const _log: ResponseTimeEntry[] = [];

export function recordResponseTime(path: string, durationMs: number): void {
  _log.push({ timestamp: new Date().toISOString(), path, durationMs });
  if (_log.length > MAX_ENTRIES) _log.shift();
}

export function getRecentResponseTimes(pathFragment?: string): ResponseTimeEntry[] {
  const entries = pathFragment
    ? _log.filter((e) => e.path.includes(pathFragment))
    : [..._log];
  return entries.slice(-50);
}
