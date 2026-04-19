import { useEffect, useRef, useState } from 'react';
import type { RunEventsState } from '../types';

type UseRunEventsArgs = {
  enabled: boolean;
  onError?: (error: string) => void;
  onLog?: (payload: unknown) => void;
  onRun?: (payload: unknown) => void;
  onStage?: (payload: unknown) => void;
  runId: string | null;
};

type HandlersRef = Omit<UseRunEventsArgs, 'enabled' | 'runId'>;

const INITIAL_STATE: RunEventsState = {
  connectionState: 'closed',
  lastEventAt: null,
};

export function useRunEvents({
  enabled,
  onError,
  onLog,
  onRun,
  onStage,
  runId,
}: UseRunEventsArgs): RunEventsState {
  const [state, setState] = useState<RunEventsState>(INITIAL_STATE);
  const handlersRef = useRef<HandlersRef>({});

  handlersRef.current = { onError, onLog, onRun, onStage };

  useEffect(() => {
    if (!enabled || !runId) {
      setState(INITIAL_STATE);
      return undefined;
    }

    setState({ connectionState: 'connecting', lastEventAt: null });
    const source = new EventSource(`/api/runs/${runId}/events`);

    source.onopen = () => {
      setState((current) => ({ ...current, connectionState: 'open' }));
    };

    const bind = (eventName: 'log' | 'run' | 'stage') => {
      source.addEventListener(eventName, (event) => {
        const message = event as MessageEvent<string>;
        const payload = JSON.parse(message.data) as unknown;
        setState({ connectionState: 'open', lastEventAt: Date.now() });
        dispatchEvent(handlersRef.current, eventName, payload);
      });
    };

    bind('log');
    bind('run');
    bind('stage');

    source.onerror = () => {
      setState((current) => ({ ...current, connectionState: 'error' }));
      handlersRef.current.onError?.('Run event stream disconnected.');
    };

    return () => source.close();
  }, [enabled, runId]);

  return state;
}

function dispatchEvent(
  handlers: HandlersRef,
  eventName: 'log' | 'run' | 'stage',
  payload: unknown,
) {
  if (eventName === 'log') {
    handlers.onLog?.(payload);
    return;
  }
  if (eventName === 'run') {
    handlers.onRun?.(payload);
    return;
  }
  handlers.onStage?.(payload);
}
