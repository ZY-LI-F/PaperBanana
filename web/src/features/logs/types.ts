import type { LogEntry } from '../../components/ui';

export type LogLevelFilter = LogEntry['level'] | 'all';

export type LogFilters = {
  level: LogLevelFilter;
  query: string;
  stage: string;
};

export type LogStreamEntry = LogEntry & {
  rawTimestamp: string;
  runId: string;
};
