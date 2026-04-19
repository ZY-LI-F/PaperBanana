import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { describeError } from '../generate/utils';
import { buildReuseState, parseHistoryRunDetail } from './utils';

export function useReuse(runId: string) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function reuse() {
    setIsLoading(true);
    setError(null);
    try {
      const detail = parseHistoryRunDetail(await api.runs.detail(runId));
      navigate('/generate', { state: { prefill: buildReuseState(detail) } });
    } catch (nextError) {
      setError(describeError(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  return { error, isLoading, reuse };
}
