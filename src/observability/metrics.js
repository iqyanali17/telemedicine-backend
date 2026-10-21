const startTime = Date.now();

const metrics = {
  totalRequests: 0,
  activeRequests: 0,
  statusCodes: {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  },
  durationsMs: [],
  maxDurationsTracked: 1000,
};

export const metricsMiddleware = (req, res, next) => {
  metrics.totalRequests += 1;
  metrics.activeRequests += 1;
  const start = performance.now();

  res.on('finish', () => {
    metrics.activeRequests = Math.max(0, metrics.activeRequests - 1);
    const duration = performance.now() - start;

    if (metrics.durationsMs.length >= metrics.maxDurationsTracked) {
      metrics.durationsMs.shift();
    }
    metrics.durationsMs.push(duration);

    const category = `${Math.floor(res.statusCode / 100)}xx`;
    if (metrics.statusCodes[category] !== undefined) {
      metrics.statusCodes[category] += 1;
    }
  });

  next();
};

export const getMetricsSnapshot = () => {
  const sorted = [...metrics.durationsMs].sort((a, b) => a - b);
  const count = sorted.length;
  const p50 = count > 0 ? sorted[Math.floor(count * 0.5)] : 0;
  const p95 = count > 0 ? sorted[Math.floor(count * 0.95)] : 0;
  const p99 = count > 0 ? sorted[Math.floor(count * 0.99)] : 0;

  const memory = process.memoryUsage();

  return {
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalRequests: metrics.totalRequests,
    activeRequests: metrics.activeRequests,
    statusCodes: { ...metrics.statusCodes },
    latency: {
      samples: count,
      p50Ms: Math.round(p50 * 100) / 100,
      p95Ms: Math.round(p95 * 100) / 100,
      p99Ms: Math.round(p99 * 100) / 100,
    },
    system: {
      heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
      rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
    },
  };
};
