import { PlannerInput, PlannerResult, plannerKey, runStudyPlan } from './planner';

interface PlannerRequest {
  id: number;
  input: PlannerInput;
}

interface PlannerResponse {
  id: number;
  result?: PlannerResult;
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PlannerRequest>) => void) | null;
  postMessage: (response: PlannerResponse) => void;
};

const cache = new Map<string, PlannerResult>();
const MAX_CACHE = 6;

scope.onmessage = (event) => {
  const { id, input } = event.data;
  try {
    const key = plannerKey(input);
    let result = cache.get(key);
    if (!result) {
      result = runStudyPlan(input);
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, result);
    }
    scope.postMessage({ id, result });
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Falha ao calcular o plano.',
    });
  }
};
