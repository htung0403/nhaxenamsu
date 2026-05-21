type TrackingMetrics = {
  acceptedUpdates: number;
  skippedUpdates: number;
  rateLimitRejected: number;
  endpointErrors: number;
  startedAt: string;
};

const metrics: TrackingMetrics = {
  acceptedUpdates: 0,
  skippedUpdates: 0,
  rateLimitRejected: 0,
  endpointErrors: 0,
  startedAt: new Date().toISOString(),
};

export const driverTrackingMetrics = {
  incrementAccepted: () => {
    metrics.acceptedUpdates += 1;
  },
  incrementSkipped: () => {
    metrics.skippedUpdates += 1;
  },
  incrementRateLimited: () => {
    metrics.rateLimitRejected += 1;
  },
  incrementError: () => {
    metrics.endpointErrors += 1;
  },
  snapshot: () => ({ ...metrics }),
};
