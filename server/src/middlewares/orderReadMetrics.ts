import type { RequestHandler } from 'express';
import { logger } from '../utils/logger';
import { orderReadMetricContext, type OrderReadMetrics } from '../utils/orderReadMetrics';

export function orderReadMetrics(namespace: string): RequestHandler {
  return (req, res, next) => {
    const logMetrics = process.env.ORDER_API_METRICS === 'true';
    const developmentTiming = process.env.NODE_ENV === 'development' && process.env.ORDER_API_METRICS !== 'false';
    if ((!logMetrics && !developmentTiming) || req.method !== 'GET') return next();
    const started = performance.now();
    const metrics: OrderReadMetrics = { dbCalls: 0, fetchedRows: 0, dataWorkMs: 0, checkpoint: started, stages: {} };
    let returnedRows = 0;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (typeof body === 'object' && body !== null && 'data' in body) {
        const data = body.data;
        if (Array.isArray(data)) returnedRows = data.length;
        else if (typeof data === 'object' && data !== null && 'data' in data && Array.isArray(data.data)) returnedRows = data.data.length;
      }
      const stages = Object.entries(metrics.stages).map(([stage, duration]) => `${stage};dur=${duration.toFixed(1)}`);
      res.append('Server-Timing', [`order;dur=${(performance.now() - started).toFixed(1)}`, `data;dur=${metrics.dataWorkMs.toFixed(1)}`, ...stages].join(', '));
      return json(body);
    };
    res.once('finish', () => {
      if (!logMetrics) return;
      logger.info('order_read_metrics', {
        namespace,
        status: res.statusCode,
        durationMs: Number((performance.now() - started).toFixed(1)),
        returnedRows,
        responseBytes: Number(res.getHeader('Content-Length') || 0),
        dbCalls: metrics.dbCalls,
        fetchedRows: metrics.fetchedRows,
        dataWorkMs: Number(metrics.dataWorkMs.toFixed(1)),
        stages: Object.fromEntries(Object.entries(metrics.stages).map(([stage, duration]) => [stage, Number(duration.toFixed(1))])),
      });
    });
    orderReadMetricContext.run(metrics, next);
  };
}
