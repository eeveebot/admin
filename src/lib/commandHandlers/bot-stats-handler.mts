'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import * as crypto from 'crypto';
import AsciiTable from 'ascii-table';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';
import { parsePrometheusMetrics } from '../utils.mjs';
import { recordAdminCommand, recordAdminError, recordProcessingTime, recordNatsPublish } from '../metrics.mjs';

// Interfaces for type safety
interface StatsResponse {
  module: string;
  stats: Record<string, string | number | boolean | object | null | undefined>;
  [key: string]: string | number | boolean | object | null | undefined;
}

/**
 * Handle the admin bot-stats command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleBotStatsCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  void (async () => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for bot-stats', {
        producer: 'admin',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Check if user is authenticated admin
      if (
        !isAuthenticatedAdmin(
          adminConfig,
          data.platform,
          data.user,
          data.userHost
        )
      ) {
        log.warn('Unauthorized bot-stats command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'bot-stats', 'unauthorized');
        return;
      }

      // Get required environment variables for operator API
      const apiToken = process.env.EEVEE_OPERATOR_API_TOKEN;
      const apiUrl = process.env.EEVEE_OPERATOR_API_URL;

      if (!apiToken || !apiUrl) {
        log.error(
          'Missing EEVEE_OPERATOR_API_TOKEN or EEVEE_OPERATOR_API_URL environment variables',
          {
            producer: 'admin',
          }
        );

        // Send error message back to user
        const errorMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Missing operator API configuration',
          trace: data.trace,
        };

        const errorTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(errorTopic, JSON.stringify(errorMessage));
        recordNatsPublish(errorTopic, 'bot_stats_config_error_response');
        recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'bot-stats', 'config_error');
        return;
      }

      // Fetch bot modules from operator API
      let modulesResponse;
      try {
        const response = await fetch(`${apiUrl}/api/bot-modules`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Operator API returned status ${response.status}`);
        }

        modulesResponse = await response.json();
      } catch (fetchError) {
        log.error('Failed to fetch bot modules from operator API', {
          producer: 'admin',
          error:
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError),
        });

        // Send error message back to user
        const errorMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Failed to fetch bot modules from operator',
          trace: data.trace,
        };

        const errorTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(errorTopic, JSON.stringify(errorMessage));
        recordNatsPublish(errorTopic, 'bot_stats_fetch_error_response');
        recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'bot-stats', 'fetch_error');
        return;
      }

      // Extract module names from the response
      const moduleNames: string[] = Array.isArray(modulesResponse)
        ? (modulesResponse as Array<{name: string}>)
            .map((module) => module.name)
            .filter(Boolean)
        : [];

      if (moduleNames.length === 0) {
        // Send message back to user that no modules were found
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'No bot modules found in the system.',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        recordNatsPublish(responseTopic, 'bot_stats_no_modules_response');
        recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'bot-stats', 'no_modules');
        return;
      }

      // Generate a unique reply channel for this request
      const replyChannel = `stats.emit.response.${crypto.randomUUID()}`;

      // Store responses we receive
      const responses: StatsResponse[] = [];
      const expectedResponses = new Set(moduleNames);
      let allResponsesReceived = false;

      // Function to generate detailed statistics report
      const generateDetailedStatsReport = (
        responses: StatsResponse[]
      ): string => {
        try {
          if (responses.length === 0) return '';

          // Aggregate statistics
          let totalMessages = 0;
          let totalCommands = 0;
          let totalBroadcasts = 0;
          let totalErrors = 0;
          let totalMemoryMB = 0;
          let avgMessageTime = 0;
          let avgCommandTime = 0;
          let messageTimeSamples = 0;
          let commandTimeSamples = 0;
          let natsMessagesPublished = 0;

          // Generic metrics
          let activeConnections = 0;
          let activeChannels = 0;

          // Collect timing data for percentiles
          const allMessageTimes: number[] = [];
          const allCommandTimes: number[] = [];

          // Count modules with issues
          let modulesWithErrors = 0;
          let modulesWithHighLatency = 0;

          // Module-specific aggregations
          const moduleSpecificMetrics: Record<
            string,
            Record<string, number>
          > = {};

          // Process each response
          for (const response of responses) {
            if (response.stats) {
              let parsedStats = response.stats;
              if (response.stats.prometheus_metrics) {
                // Merge parsed Prometheus metrics with existing stats
                parsedStats = {
                  ...response.stats,
                  ...parsePrometheusMetrics(
                    response.stats.prometheus_metrics as string
                  ),
                };
              }

              // Aggregate counters
              if (parsedStats.messages_processed_count !== undefined) {
                totalMessages += Number(parsedStats.messages_processed_count);
              }

              if (parsedStats.commands_processed_count !== undefined) {
                totalCommands += Number(parsedStats.commands_processed_count);
              }

              if (parsedStats.broadcasts_processed_count !== undefined) {
                totalBroadcasts += Number(
                  parsedStats.broadcasts_processed_count
                );
              }

              if (parsedStats.errors_total !== undefined) {
                const errors = Number(parsedStats.errors_total);
                totalErrors += errors;
                if (errors > 0) {
                  modulesWithErrors++;
                }
              }

              // Memory usage
              if (parsedStats.memory_rss_mb !== undefined) {
                totalMemoryMB += Number(parsedStats.memory_rss_mb);
              }

              // Aggregate timing averages
              if (parsedStats.message_avg_processing_time_ms !== undefined) {
                avgMessageTime += Number(
                  parsedStats.message_avg_processing_time_ms
                );
                messageTimeSamples++;
                allMessageTimes.push(
                  Number(parsedStats.message_avg_processing_time_ms)
                );
              }

              if (parsedStats.command_avg_processing_time_ms !== undefined) {
                avgCommandTime += Number(
                  parsedStats.command_avg_processing_time_ms
                );
                commandTimeSamples++;
                allCommandTimes.push(
                  Number(parsedStats.command_avg_processing_time_ms)
                );
              }

              // Check for high latency modules
              if (
                (parsedStats.message_avg_processing_time_ms !== undefined &&
                  Number(parsedStats.message_avg_processing_time_ms) > 100) ||
                (parsedStats.command_avg_processing_time_ms !== undefined &&
                  Number(parsedStats.command_avg_processing_time_ms) > 100)
              ) {
                modulesWithHighLatency++;
              }

              // Generic metrics aggregation
              if (parsedStats.active_connections !== undefined) {
                activeConnections += Number(parsedStats.active_connections);
              }

              if (parsedStats.active_channels !== undefined) {
                activeChannels += Number(parsedStats.active_channels);
              }

              if (parsedStats.nats_messages_published !== undefined) {
                natsMessagesPublished += Number(
                  parsedStats.nats_messages_published
                );
              }

              // Handle module-specific metrics
              if (parsedStats.modules) {
                for (const [moduleName, moduleStats] of Object.entries(
                  parsedStats.modules
                )) {
                  if (!moduleSpecificMetrics[moduleName]) {
                    moduleSpecificMetrics[moduleName] = {};
                  }
                  for (const [metricName, metricValue] of Object.entries(
                    moduleStats
                  )) {
                    if (typeof metricValue === 'number') {
                      if (!moduleSpecificMetrics[moduleName][metricName]) {
                        moduleSpecificMetrics[moduleName][metricName] = 0;
                      }
                      moduleSpecificMetrics[moduleName][metricName] +=
                        metricValue;
                    }
                  }
                }
              }
            }
          }

          // Calculate averages
          const avgMessageTimeMs =
            messageTimeSamples > 0
              ? Math.round(avgMessageTime / messageTimeSamples)
              : 0;
          const avgCommandTimeMs =
            commandTimeSamples > 0
              ? Math.round(avgCommandTime / commandTimeSamples)
              : 0;

          // Calculate percentiles for timing
          const calculatePercentile = (
            arr: number[],
            percentile: number
          ): number => {
            if (arr.length === 0) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const index = Math.floor(sorted.length * percentile);
            return sorted[index];
          };

          const messageP95 = calculatePercentile(allMessageTimes, 0.95);
          const commandP95 = calculatePercentile(allCommandTimes, 0.95);

          // Calculate error rate
          const totalProcessed = totalMessages + totalCommands;
          const errorRate =
            totalProcessed > 0
              ? Math.round((totalErrors / totalProcessed) * 10000) / 100
              : 0;

          // Generate report
          let report = '=== Analysis:\n';
          report += `├─ Total Messages: ${totalMessages.toLocaleString()}\n`;
          report += `├─ Total Commands: ${totalCommands.toLocaleString()}\n`;
          report += `├─ Total Broadcasts: ${totalBroadcasts.toLocaleString()}\n`;
          report += `├─ Total Errors: ${totalErrors.toLocaleString()} (${errorRate}%)\n`;
          report += `├─ Total Memory Usage: ${totalMemoryMB.toLocaleString()} MB\n`;
          report += `├─ NATS Messages Published: ${natsMessagesPublished.toLocaleString()}\n`;

          if (avgMessageTimeMs > 0) {
            report += `├─ Avg Message Processing: ${avgMessageTimeMs}ms (p95: ${messageP95}ms)\n`;
          }

          if (avgCommandTimeMs > 0) {
            report += `├─ Avg Command Processing: ${avgCommandTimeMs}ms (p95: ${commandP95}ms)\n`;
          }

          // Add generic metrics if available
          if (activeConnections > 0 || activeChannels > 0) {
            report += `├─ Active Connections: ${activeConnections.toLocaleString()}\n`;
            report += `├─ Active Channels: ${activeChannels.toLocaleString()}\n`;
          }

          // Add module-specific metrics if available
          const moduleMetricEntries = Object.entries(moduleSpecificMetrics);
          if (moduleMetricEntries.length > 0) {
            report += '├─ Module-Specific Metrics:\n';
            for (const [moduleName, metrics] of moduleMetricEntries) {
              const metricStrings = Object.entries(metrics)
                .map(([name, value]) => `${name}: ${value}`)
                .join(', ');
              report += `│  ├─ ${moduleName}: ${metricStrings}\n`;
            }
          }

          // Add warnings if needed
          const warnings: string[] = [];
          if (modulesWithErrors > 0) {
            warnings.push(`${modulesWithErrors} modules with errors`);
          }
          if (modulesWithHighLatency > 0) {
            warnings.push(
              `${modulesWithHighLatency} modules with high latency (>100ms)`
            );
          }

          if (warnings.length > 0) {
            report += `└─ ⚠️  Warnings: ${warnings.join(', ')}\n`;
          } else {
            report += '└─ ✅ All modules healthy\n';
          }

          return report;
        } catch (error) {
          log.error('Failed to generate detailed stats report', {
            producer: 'admin',
            error: error instanceof Error ? error.message : String(error),
          });
          return '';
        }
      };

      // Function to send the stats report
      const sendStatsReport = () => {
        // Clear the timeout if it's still active
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Format the responses as a message
        let responseText = 'Bot Statistics Report:\n';

        if (responses.length === 0) {
          responseText += 'No modules responded within the timeout period.\n';
        } else {
          // Sort responses by module name
          responses.sort((a, b) => a.module.localeCompare(b.module));

          // Create a concise table with key highlights
          const table = new AsciiTable();
          table.setHeading('Module', 'Status', 'Uptime', 'Key Metrics');

          // Process each module's stats for the table
          for (const response of responses) {
            let status = 'OK';
            let uptime = 'N/A';
            let keyMetrics = 'N/A';

            try {
              if (response.stats) {
                // Parse Prometheus metrics if available
                let parsedStats = response.stats;
                if (response.stats.prometheus_metrics) {
                  try {
                    // Merge parsed Prometheus metrics with existing stats
                    parsedStats = {
                      ...response.stats,
                      ...parsePrometheusMetrics(
                        response.stats.prometheus_metrics as string
                      ),
                    };
                  } catch (parseError) {
                    log.warn('Failed to parse Prometheus metrics for module', {
                      producer: 'admin',
                      module: response.module,
                      error: parseError,
                    });
                    // Continue with original stats if parsing fails
                  }
                }

                // Extract uptime info
                if (parsedStats.uptime_seconds !== undefined) {
                  uptime = parsedStats.uptime_formatted
                    ? String(parsedStats.uptime_formatted)
                    : `${parsedStats.uptime_seconds}s`;
                } else if (parsedStats.uptime_formatted) {
                  uptime = String(parsedStats.uptime_formatted);
                }

                // Extract key metrics based on what's available
                const metrics: string[] = [];

                // Memory usage if available
                if (parsedStats.memory_rss_mb !== undefined) {
                  metrics.push(`Mem: ${String(parsedStats.memory_rss_mb)}MB`);
                }

                // Message counts if available
                if (parsedStats.messages_processed_count !== undefined) {
                  metrics.push(
                    `Msgs: ${String(parsedStats.messages_processed_count)}`
                  );
                }

                // Command counts if available
                if (parsedStats.commands_processed_count !== undefined) {
                  metrics.push(
                    `Cmds: ${String(parsedStats.commands_processed_count)}`
                  );
                }

                // Broadcast counts if available
                if (parsedStats.broadcasts_processed_count !== undefined) {
                  metrics.push(
                    `Bcasts: ${String(parsedStats.broadcasts_processed_count)}`
                  );
                }

                // Error information if available
                if (
                  parsedStats.errors_total !== undefined &&
                  parsedStats.error_rate_percent !== undefined
                ) {
                  metrics.push(
                    `Err: ${String(parsedStats.errors_total)} (${String(parsedStats.error_rate_percent)}%)`
                  );
                } else if (parsedStats.errors_total !== undefined) {
                  metrics.push(`Err: ${String(parsedStats.errors_total)}`);
                }

                // Timing information if available
                if (parsedStats.message_avg_processing_time_ms !== undefined) {
                  metrics.push(
                    `MsgTime: ${String(parsedStats.message_avg_processing_time_ms)}ms`
                  );
                } else if (
                  parsedStats.command_avg_processing_time_ms !== undefined
                ) {
                  metrics.push(
                    `CmdTime: ${String(parsedStats.command_avg_processing_time_ms)}ms`
                  );
                }

                // NATS messages if available
                if (parsedStats.nats_messages_published !== undefined) {
                  metrics.push(
                    `NATS: ${String(parsedStats.nats_messages_published)}`
                  );
                }

                // Generic metrics if available
                if (parsedStats.active_connections !== undefined) {
                  metrics.push(
                    `ActConns: ${String(parsedStats.active_connections)}`
                  );
                }

                if (parsedStats.active_channels !== undefined) {
                  metrics.push(
                    `ActChans: ${String(parsedStats.active_channels)}`
                  );
                }

                keyMetrics =
                  metrics.length > 0 ? metrics.join(' | ') : 'No key metrics';
              } else {
                status = 'No Stats';
              }
            } catch (processError) {
              log.error('Failed to process stats for module', {
                producer: 'admin',
                module: response.module,
                error: processError,
              });
              status = 'Error';
              keyMetrics = 'Processing Error';
            }

            table.addRow(response.module, status, uptime, keyMetrics);
          }

          responseText += table.toString() + '\n';

          // Add detailed statistics and analysis
          const detailedStats = generateDetailedStatsReport(responses);
          if (detailedStats) {
            responseText += '\n' + detailedStats + '\n';
          }

          // Add summary
          responseText += `\nSummary: ${responses.length}/${moduleNames.length} modules responded\n`;
        }

        // Send the response back to the user/channel
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: responseText,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        recordNatsPublish(responseTopic, 'bot_stats_report_response');

        log.info('Sent bot statistics report to user', {
          producer: 'admin',
          user: data.user,
          channel: data.channel,
          platform: data.platform,
          instance: data.instance,
          moduleCount: responses.length,
          expectedModules: moduleNames.length,
        });
        
        // Record successful command execution
        recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'bot-stats', 'success');
      };

      // Subscribe to the reply channel to collect responses
      await nats.subscribe(replyChannel, (replySubject, replyMessage) => {
        try {
          const replyData: StatsResponse = JSON.parse(replyMessage.string());

          // Validate required fields
          if (!replyData.module) {
            log.warn('Received stats response with missing module name', {
              producer: 'admin',
              replySubject,
            });
            return;
          }

          responses.push(replyData);

          // Remove this module from expected responses
          expectedResponses.delete(replyData.module);

          // If we've received responses from all expected modules, we can finish early
          if (expectedResponses.size === 0 && !allResponsesReceived) {
            allResponsesReceived = true;
            sendStatsReport();
          }
        } catch (error) {
          log.error('Failed to parse stats response', {
            producer: 'admin',
            error: error,
          });
        }
      });

      // Send stats.emit.request to all modules
      const statsRequest = {
        replyChannel: replyChannel,
      };
      void nats.publish('stats.emit.request', JSON.stringify(statsRequest));
      recordNatsPublish('stats.emit.request', 'bot_stats_request');

      // Wait 5 seconds for modules to respond, but finish early if all expected responses received
      const timeoutId = setTimeout(() => {
        if (!allResponsesReceived) {
          allResponsesReceived = true;
          sendStatsReport();
        }
      }, 5000); // 5 second timeout
    } catch (error) {
      log.error('Failed to process bot-stats command', {
        producer: 'admin',
        message: message.string(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Record error
      recordAdminError('bot_stats_command', 'process');
      if (typeof error === 'object' && error !== null && 'platform' in error && 'channel' in error) {
        recordAdminCommand(
          error.platform,
          error.network || 'unknown',
          error.channel,
          'bot-stats',
          'error'
        );
      } else {
        recordAdminCommand('unknown', 'unknown', 'unknown', 'bot-stats', 'error');
      }

      // Try to send error message back to user
      try {
        const data = JSON.parse(message.string());
        const errorMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error: Failed to process bot-stats command: ${error instanceof Error ? error.message : String(error)}`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(errorMessage));
        recordNatsPublish(responseTopic, 'bot_stats_exception_response');
      } catch (sendError) {
        log.error('Failed to send error message to user', {
          producer: 'admin',
          error:
            sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    } finally {
      // Record processing time
      const duration = Date.now() - startTime;
      recordProcessingTime(duration / 1000); // Convert to seconds
    }
  })();
}