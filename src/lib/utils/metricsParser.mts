'use strict';

import { log } from '@eeveebot/libeevee';

/**
 * Histogram bucket entry parsed from Prometheus metrics text
 */
interface HistogramBucket {
  le: number; // bucket boundary (+Inf represented as Infinity)
  count: number; // cumulative count in this bucket
}

/**
 * Parsed histogram data for a single metric
 */
interface HistogramData {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * Per-module parsed metrics
 */
interface ParsedModuleMetrics {
  version: string | undefined;
  messages_processed: number;
  commands_processed: number;
  broadcasts_processed: number;
  errors_total: number;
  memory_rss_mb: number;
  uptime_formatted: string;
  message_p50_ms: number | null;
  message_p95_ms: number | null;
  command_p50_ms: number | null;
  command_p95_ms: number | null;
  active_connections: number;
  active_channels: number;
  nats_published: number;
  is_connector: boolean;
  connector?: ConnectorInfo[];
}

/**
 * Per-connection info from a connector module
 */
export interface ConnectorInfo {
  name: string;
  connected: boolean;
  host: string;
  nick: string;
  channels: number;
  reconnects: number;
  lastConnect: string | null;
  lastDisconnect: string | null;
}

/**
 * Result of parsing all modules' metrics
 */
interface ParsedMetricsResult {
  modules: Record<string, ParsedModuleMetrics>;
  totalMessages: number;
  totalCommands: number;
  totalBroadcasts: number;
  totalErrors: number;
  totalMemoryMB: number;
  totalNatsPublished: number;
}

/**
 * Calculate a percentile from Prometheus histogram buckets using linear interpolation.
 * This is the standard approach used by Prometheus histogram_quantile().
 * @param buckets - Sorted histogram buckets (ascending le)
 * @param count - Total observation count (_count value)
 * @param percentile - Target percentile (0-1)
 * @returns Percentile value in the same unit as bucket boundaries, or null if insufficient data
 */
export function calculatePercentileFromBuckets(
  buckets: HistogramBucket[],
  count: number,
  percentile: number
): number | null {
  if (buckets.length < 2 || count === 0) return null;

  const target = percentile * count;

  // Find the bucket where the target count falls
  let lowerBucket: HistogramBucket | null = null;
  let upperBucket: HistogramBucket | null = null;

  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].count >= target) {
      upperBucket = buckets[i];
      lowerBucket = i > 0 ? buckets[i - 1] : { le: 0, count: 0 };
      break;
    }
  }

  if (!upperBucket || !lowerBucket) return null;

  // If the target falls exactly on a bucket boundary
  if (upperBucket.count === lowerBucket.count) {
    return upperBucket.le;
  }

  // Linear interpolation between bucket boundaries
  const fraction =
    (target - lowerBucket.count) / (upperBucket.count - lowerBucket.count);
  return lowerBucket.le + fraction * (upperBucket.le - lowerBucket.le);
}

/**
 * Parse histogram buckets, sum, and count from Prometheus metrics text.
 * Returns a map of metric name (without _bucket/_sum/_count suffix) to HistogramData.
 */
function parseHistograms(metricsText: string): Map<string, HistogramData> {
  const histograms = new Map<string, HistogramData>();
  const lines = metricsText.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    // Bucket line: metric_name_bucket{labels,le="0.001"} 5
    const bucketMatch = line.match(
      /^([a-zA-Z0-9_]+)_bucket\{([^}]*)\}\s+([\d.]+)/
    );
    if (bucketMatch) {
      const metricName = bucketMatch[1];
      const labelsStr = bucketMatch[2];
      const value = parseFloat(bucketMatch[3]);
      if (isNaN(value)) continue;

      // Extract le value
      const leMatch = labelsStr.match(/le="([^"]+)"/);
      if (!leMatch) continue;

      const le = leMatch[1] === '+Inf' ? Infinity : parseFloat(leMatch[1]);
      if (leMatch[1] !== '+Inf' && isNaN(le)) continue;

      if (!histograms.has(metricName)) {
        histograms.set(metricName, { buckets: [], sum: 0, count: 0 });
      }
      histograms.get(metricName)!.buckets.push({ le, count: value });
      continue;
    }

    // Sum line: metric_name_sum{labels} 0.156
    const sumMatch = line.match(
      /^([a-zA-Z0-9_]+)_sum\{[^}]*\}\s+([\d.eE+-]+)/
    );
    if (sumMatch) {
      const metricName = sumMatch[1];
      const value = parseFloat(sumMatch[2]);
      if (isNaN(value)) continue;

      if (!histograms.has(metricName)) {
        histograms.set(metricName, { buckets: [], sum: 0, count: 0 });
      }
      histograms.get(metricName)!.sum = value;
      continue;
    }

    // Count line: metric_name_count{labels} 25
    const countMatch = line.match(
      /^([a-zA-Z0-9_]+)_count\{[^}]*\}\s+([\d.]+)/
    );
    if (countMatch) {
      const metricName = countMatch[1];
      const value = parseInt(countMatch[2], 10);
      if (isNaN(value)) continue;

      if (!histograms.has(metricName)) {
        histograms.set(metricName, { buckets: [], sum: 0, count: 0 });
      }
      histograms.get(metricName)!.count = value;
      continue;
    }
  }

  // Sort buckets by le within each histogram
  for (const hist of histograms.values()) {
    hist.buckets.sort((a, b) => {
      if (a.le === Infinity) return 1;
      if (b.le === Infinity) return -1;
      return a.le - b.le;
    });
  }

  return histograms;
}

/**
 * Parse a simple counter value from Prometheus metrics text.
 * Returns the sum across all label combinations, optionally filtered by labels.
 */
function parseCounter(
  metricsText: string,
  metricName: string,
  labelFilter?: Record<string, string>
): number {
  let total = 0;
  const lines = metricsText.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    const match = line.match(
      new RegExp(`^${metricName}\\{([^}]*)\\}\\s+([\\d.]+)`)
    );
    if (!match) continue;

    const labelsStr = match[1];
    const value = parseFloat(match[2]);
    if (isNaN(value)) continue;

    // Apply label filter
    if (labelFilter) {
      let matches = true;
      for (const [key, val] of Object.entries(labelFilter)) {
        const pattern = `${key}="${val}"`;
        if (!labelsStr.includes(pattern)) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    total += value;
  }

  return total;
}

/**
 * Parse a gauge value from Prometheus metrics text.
 * Returns the sum across all label combinations for the given metric name.
 */
function parseGauge(metricsText: string, metricName: string): number {
  let total = 0;
  const lines = metricsText.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;

    // Gauge with labels: metric_name{labels} value
    const match = line.match(
      new RegExp(`^${metricName}\\{([^}]*)\\}\\s+([\\d.]+)`)
    );
    if (match) {
      const value = parseFloat(match[2]);
      if (!isNaN(value)) total += value;
      continue;
    }

    // Gauge without labels: metric_name value
    const bareMatch = line.match(new RegExp(`^${metricName}\\s+([\\d.]+)`));
    if (bareMatch) {
      const value = parseFloat(bareMatch[1]);
      if (!isNaN(value)) total += value;
    }
  }

  return total;
}

/**
 * Parse Prometheus metrics text into per-module structured data.
 * Each module's raw prometheus_metrics string is parsed independently,
 * producing real per-module latency percentiles from histogram buckets.
 *
 * @param modulesData - Map of module name to their raw prometheus_metrics string and basic stats
 * @returns Parsed metrics result with per-module data and totals
 */
export function parsePerModuleMetrics(
  modulesData: Map<string, { prometheusMetrics: string; version?: string; memoryRssMb: number; uptimeFormatted: string; connector?: ConnectorInfo[] }>
): ParsedMetricsResult {
  const modules: Record<string, ParsedModuleMetrics> = {};
  let totalMessages = 0;
  let totalCommands = 0;
  let totalBroadcasts = 0;
  let totalErrors = 0;
  let totalMemoryMB = 0;
  let totalNatsPublished = 0;

  for (const [moduleName, data] of modulesData) {
    const promText = data.prometheusMetrics;
    const histograms = parseHistograms(promText);

    // Message processing latency from histogram
    const msgHist = histograms.get('message_processing_seconds');
    let messageP50Ms: number | null = null;
    let messageP95Ms: number | null = null;
    if (msgHist && msgHist.count > 0) {
      const p50 = calculatePercentileFromBuckets(msgHist.buckets, msgHist.count, 0.5);
      const p95 = calculatePercentileFromBuckets(msgHist.buckets, msgHist.count, 0.95);
      if (p50 !== null) messageP50Ms = Math.round(p50 * 1000);
      if (p95 !== null) messageP95Ms = Math.round(p95 * 1000);
    }

    // Command processing latency from histogram
    const cmdHist = histograms.get('command_processing_seconds');
    let commandP50Ms: number | null = null;
    let commandP95Ms: number | null = null;
    if (cmdHist && cmdHist.count > 0) {
      const p50 = calculatePercentileFromBuckets(cmdHist.buckets, cmdHist.count, 0.5);
      const p95 = calculatePercentileFromBuckets(cmdHist.buckets, cmdHist.count, 0.95);
      if (p50 !== null) commandP50Ms = Math.round(p50 * 1000);
      if (p95 !== null) commandP95Ms = Math.round(p95 * 1000);
    }

    // Counters
    const messages = parseCounter(promText, 'messages_total', { result: 'processed' });
    const commands = parseCounter(promText, 'commands_total', { result: 'success' });
    const broadcasts = parseCounter(promText, 'broadcasts_total');
    const errors = parseCounter(promText, 'errors_total');
    const nats = parseCounter(promText, 'nats_publish_total');

    // Gauges
    const activeConns = parseGauge(promText, 'active_connections');
    const activeChans = parseGauge(promText, 'active_channels');

    const isConnector = moduleName.startsWith('connector-');

    totalMessages += messages;
    totalCommands += commands;
    totalBroadcasts += broadcasts;
    totalErrors += errors;
    totalMemoryMB += data.memoryRssMb;
    totalNatsPublished += nats;

    modules[moduleName] = {
      version: data.version,
      messages_processed: messages,
      commands_processed: commands,
      broadcasts_processed: broadcasts,
      errors_total: errors,
      memory_rss_mb: data.memoryRssMb,
      uptime_formatted: data.uptimeFormatted,
      message_p50_ms: messageP50Ms,
      message_p95_ms: messageP95Ms,
      command_p50_ms: commandP50Ms,
      command_p95_ms: commandP95Ms,
      active_connections: activeConns,
      active_channels: activeChans,
      nats_published: nats,
      is_connector: isConnector,
      connector: data.connector,
    };
  }

  return {
    modules,
    totalMessages,
    totalCommands,
    totalBroadcasts,
    totalErrors,
    totalMemoryMB,
    totalNatsPublished,
  };
}

/**
 * Legacy parse function for backward compatibility (used by health-handler).
 * Extracts a simplified set of metrics from a single module's Prometheus text.
 * @param metricsText - The raw Prometheus metrics text
 * @returns Object containing parsed metrics
 */
export function parsePrometheusMetrics(metricsText: string): Record<string, number | string | null> {
  try {
    if (!metricsText || typeof metricsText !== 'string') {
      return {};
    }

    const result: Record<string, number | string | null> = {};

    // Counters
    const messages = parseCounter(metricsText, 'messages_total', { result: 'processed' });
    if (messages > 0) result.messages_processed_count = messages;

    const errors = parseCounter(metricsText, 'errors_total');
    if (errors > 0) result.errors_total = errors;

    // Gauges
    const activeConns = parseGauge(metricsText, 'active_connections');
    if (activeConns > 0) result.active_connections = activeConns;

    const activeChans = parseGauge(metricsText, 'active_channels');
    if (activeChans > 0) result.active_channels = activeChans;

    // Histograms for latency
    const histograms = parseHistograms(metricsText);
    const msgHist = histograms.get('message_processing_seconds');
    if (msgHist && msgHist.count > 0) {
      const p95 = calculatePercentileFromBuckets(msgHist.buckets, msgHist.count, 0.95);
      if (p95 !== null) result.message_p95_time_ms = Math.round(p95 * 1000);
    }
    const cmdHist = histograms.get('command_processing_seconds');
    if (cmdHist && cmdHist.count > 0) {
      const p95 = calculatePercentileFromBuckets(cmdHist.buckets, cmdHist.count, 0.95);
      if (p95 !== null) result.command_p95_time_ms = Math.round(p95 * 1000);
    }

    return result;
  } catch (error) {
    log.error('Failed to parse Prometheus metrics', {
      producer: 'admin-utils',
      error,
    });
    return {};
  }
}
