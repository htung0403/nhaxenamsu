import { AsyncLocalStorage } from 'node:async_hooks';

type OrderReadPhase = 'auth' | 'access';
type OrderReadQueryStage = 'delivery' | 'hydrate' | 'payments';
export type OrderReadMetrics = {
  dbCalls: number;
  fetchedRows: number;
  dataWorkMs: number;
  checkpoint: number;
  stages: Partial<Record<OrderReadPhase | OrderReadQueryStage, number>>;
};
export const orderReadMetricContext = new AsyncLocalStorage<OrderReadMetrics>();

export function markOrderReadPhase(phase: OrderReadPhase): void {
  const metrics = orderReadMetricContext.getStore();
  if (!metrics) return;
  const now = performance.now();
  metrics.stages[phase] = (metrics.stages[phase] || 0) + now - metrics.checkpoint;
  metrics.checkpoint = now;
}

export async function measureOrderRead<Result extends { data: unknown }>(query: PromiseLike<Result>, stage?: OrderReadQueryStage): Promise<Result> {
  const metrics = orderReadMetricContext.getStore();
  if (!metrics) return await query;
  const started = performance.now();
  metrics.dbCalls += 1;
  try {
    const result = await query;
    if (Array.isArray(result.data)) metrics.fetchedRows += result.data.length;
    return result;
  } finally {
    const duration = performance.now() - started;
    metrics.dataWorkMs += duration;
    if (stage) metrics.stages[stage] = (metrics.stages[stage] || 0) + duration;
  }
}
