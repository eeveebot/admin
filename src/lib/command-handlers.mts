'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import * as crypto from 'crypto';
import AsciiTable from 'ascii-table';
import { AdminRootConfig } from '../types/admin.types.mjs';
import { isAuthenticatedAdmin } from './auth.mjs';

/**
 * Handle the admin join command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleJoinCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for join', {
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
      log.warn('Unauthorized join command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      return;
    }

    // Extract channel and optional key from command text (format: "#channel [key]")
    const parts = data.text.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) {
      log.warn('Invalid join command format', {
        producer: 'admin',
        text: data.text,
      });
      return;
    }

    const channel = parts[0];
    const key = parts.length > 1 ? parts[1] : undefined;

    // Publish control message to NATS
    const controlMessage: {
      action: string;
      data: {
        channel: string;
        key?: string;
      };
      platform: string;
      instance: string;
      trace: string;
    } = {
      action: 'join',
      data: {
        channel: channel,
      },
      platform: data.platform,
      instance: data.instance,
      trace: data.trace,
    };

    // Add key to data if provided
    if (key) {
      controlMessage.data.key = key;
    }

    // Publish control message to NATS
    const controlTopic = `control.chatConnectors.${data.platform}.${data.instance}`;
    void nats.publish(controlTopic, JSON.stringify(controlMessage));

    log.info(`Published join control message for ${channel}`, {
      producer: 'admin',
      topic: controlTopic,
    });
  } catch (error) {
    log.error('Failed to process join command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}

/**
 * Handle the admin part command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handlePartCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for part', {
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
      log.warn('Unauthorized part command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      return;
    }

    // Extract channel from command text (format: "#channel")
    const channel = data.text.trim();
    if (!channel) {
      log.warn('Invalid part command format', {
        producer: 'admin',
        text: data.text,
      });
      return;
    }

    // Publish control message to NATS
    const controlMessage = {
      action: 'part',
      data: {
        channel: channel,
      },
      platform: data.platform,
      instance: data.instance,
      trace: data.trace,
    };

    const controlTopic = `control.chatConnectors.${data.platform}.${data.instance}`;
    void nats.publish(controlTopic, JSON.stringify(controlMessage));

    log.info(`Published part control message for ${channel}`, {
      producer: 'admin',
      topic: controlTopic,
    });
  } catch (error) {
    log.error('Failed to process part command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}

/**
 * Handle the admin show-ratelimits command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleShowRatelimitsCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for show-ratelimits', {
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
      log.warn('Unauthorized show-ratelimits command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      return;
    }

    // Send a message to the router to gather rate limit statistics
    const requestMessage = {
      action: 'get-ratelimit-stats',
      requester: {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
      },
      trace: data.trace,
    };

    // Publish request to router
    void nats.publish('admin.request.router', JSON.stringify(requestMessage));

    log.info('Requested rate limit statistics from router', {
      producer: 'admin',
      trace: data.trace,
    });
  } catch (error) {
    log.error('Failed to process show-ratelimits command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}

/**
 * Handle the admin show-command-registry command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleShowCommandRegistryCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for show-command-registry', {
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
      log.warn('Unauthorized show-command-registry command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      return;
    }

    // Send a message to the router to gather command registry information
    const requestMessage = {
      action: 'get-command-registry',
      requester: {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
      },
      trace: data.trace,
    };

    // Publish request to router
    void nats.publish('admin.request.router', JSON.stringify(requestMessage));

    log.info('Requested command registry from router', {
      producer: 'admin',
      trace: data.trace,
    });
  } catch (error) {
    log.error('Failed to process show-command-registry command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}

/**
 * Handle the admin module-uptime command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleModuleUptimeCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for module-uptime', {
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
      log.warn('Unauthorized module-uptime command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      return;
    }

    // Generate a unique reply channel for this request
    const replyChannel = `stats.uptime.reply.${crypto.randomUUID()}`;

    // Store responses we receive
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responses: any[] = [];

    // Subscribe to the reply channel to collect responses
    void nats
      .subscribe(replyChannel, (replySubject, replyMessage) => {
        try {
          const replyData = JSON.parse(replyMessage.string());
          responses.push(replyData);
        } catch (error) {
          log.error('Failed to parse uptime response', {
            producer: 'admin',
            error: error,
          });
        }
      })
      .then((sub) => {
        if (sub && typeof sub === 'string') {
          // We'll let the subscription naturally expire
          // In a production system, we might want to track and clean these up
        }
      });

    // Send stats.uptime request to all modules
    const uptimeRequest = {
      replyChannel: replyChannel,
    };
    void nats.publish('stats.uptime', JSON.stringify(uptimeRequest));

    // Wait 5 seconds for modules to respond
    setTimeout(() => {
      // Format the responses as a message
      let responseText = 'Module Uptime Report:\n';

      if (responses.length === 0) {
        responseText += 'No modules responded within the timeout period.\n';
      } else {
        // Sort responses by module name
        responses.sort((a, b) => a.module.localeCompare(b.module));

        // Create a formatted table using ascii-table
        const table = new AsciiTable();
        table.setHeading('Module', 'Uptime');

        for (const response of responses) {
          table.addRow(response.module, response.uptimeFormatted);
        }

        responseText += table.toString() + '\n';
        responseText += `Total modules: ${responses.length}\n`;
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

      log.info('Sent module uptime report to user', {
        producer: 'admin',
        user: data.user,
        channel: data.channel,
        platform: data.platform,
        instance: data.instance,
        moduleCount: responses.length,
      });
    }, 5000); // 5 second timeout
  } catch (error) {
    log.error('Failed to process module-uptime command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}

/**
 * Handle the admin module-restart command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleModuleRestartCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for module-restart', {
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
      log.warn('Unauthorized module-restart command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      return;
    }

    // Extract module name from command text (format: "$MODULE")
    const moduleName = data.text.trim();
    if (!moduleName) {
      log.warn('Invalid module-restart command format', {
        producer: 'admin',
        text: data.text,
      });
      return;
    }

    // Get required environment variables
    const apiToken = process.env.EEVEE_OPERATOR_API_TOKEN;
    const apiUrl = process.env.EEVEE_OPERATOR_API_URL;

    if (!apiToken || !apiUrl) {
      log.error(
        'Missing EEVEE_OPERATOR_API_TOKEN or EEVEE_OPERATOR_API_URL environment variables',
        {
          producer: 'admin',
        }
      );
      return;
    }

    // Send restart request to operator API
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/api/action/restart-module`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            moduleName: moduleName,
            namespace: 'eevee-bot',
          }),
        });

        if (response.ok) {
          log.info(
            `Successfully sent restart request for module ${moduleName}`,
            {
              producer: 'admin',
              moduleName,
            }
          );

          // Send confirmation message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: `Module restart request sent for: ${moduleName}`,
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
        } else {
          const errorText = await response.text();
          log.error(`Failed to restart module ${moduleName}`, {
            producer: 'admin',
            moduleName,
            status: response.status,
            error: errorText,
          });

          // Send error message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: `Failed to send restart request for module ${moduleName}. Status: ${response.status}`,
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
        }
      } catch (error) {
        log.error(`Error sending restart request for module ${moduleName}`, {
          producer: 'admin',
          moduleName,
          error: error instanceof Error ? error.message : String(error),
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error sending restart request for module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
      }
    })();
  } catch (error) {
    log.error('Failed to process module-restart command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}

/**
 * Handle the admin list-bot-modules command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleListBotModulesCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  void (async () => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for list-bot-modules', {
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
        log.warn('Unauthorized list-bot-modules command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Get required environment variables
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
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Missing operator API configuration',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      // Fetch bot modules from operator API
      let response;
      try {
        response = await fetch(`${apiUrl}/api/bot-modules`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (fetchError) {
        log.error('Failed to connect to operator API', {
          producer: 'admin',
          error:
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError),
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Failed to connect to operator API',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        log.error('Failed to fetch bot modules from operator API', {
          producer: 'admin',
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error: Failed to fetch bot modules. Status: ${response.status} (${response.statusText})`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      let modulesResponse;
      try {
        modulesResponse = await response.json();
      } catch (parseError) {
        log.error('Failed to parse bot modules response from operator API', {
          producer: 'admin',
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Failed to parse response from operator API',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      const modules: Array<{
        name: string;
        namespace: string;
        image: string;
        tag: string;
        enabled: boolean;
      }> = Array.isArray(modulesResponse) ? modulesResponse : [];

      // Format the response as a table
      let responseText = 'Bot Modules:\n';

      if (!modules || modules.length === 0) {
        responseText += 'No bot modules found.\n';
      } else {
        // Create ASCII table using ascii-table
        const table = new AsciiTable();
        table.setHeading('Name', 'Namespace', 'Image', 'Tag', 'Enabled');

        // Add each module entry
        for (const module of modules) {
          table.addRow(
            module.name,
            module.namespace,
            module.image,
            module.tag,
            module.enabled ? 'Yes' : 'No'
          );
        }

        responseText += table.toString() + '\n';
        responseText += `Total modules: ${modules.length}\n`;
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

      log.info('Sent bot modules list to user', {
        producer: 'admin',
        user: data.user,
        channel: data.channel,
        platform: data.platform,
        instance: data.instance,
        moduleCount: modules.length,
      });
    } catch (error) {
      log.error('Failed to process list-bot-modules command', {
        producer: 'admin',
        message: message.string(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to send error message back to user
      try {
        const data = JSON.parse(message.string());
        const errorMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error: Failed to process list-bot-modules command: ${error instanceof Error ? error.message : String(error)}`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(errorMessage));
      } catch (sendError) {
        log.error('Failed to send error message to user', {
          producer: 'admin',
          error:
            sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  })();
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
        return;
      }

      // Generate a unique reply channel for this request
      const replyChannel = `stats.emit.response.${crypto.randomUUID()}`;

      // Store responses we receive
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responses: any[] = [];

      // Subscribe to the reply channel to collect responses
      void nats
        .subscribe(replyChannel, (replySubject, replyMessage) => {
          try {
            const replyData = JSON.parse(replyMessage.string());
            responses.push(replyData);
          } catch (error) {
            log.error('Failed to parse stats response', {
              producer: 'admin',
              error: error,
            });
          }
        })
        .then((sub) => {
          if (sub && typeof sub === 'string') {
            // We'll let the subscription naturally expire
            // In a production system, we might want to track and clean these up
          }
        });

      // Send stats.emit.request to all modules
      const statsRequest = {
        replyChannel: replyChannel,
      };
      void nats.publish('stats.emit.request', JSON.stringify(statsRequest));

      // Wait 5 seconds for modules to respond
      setTimeout(() => {
        // Format the responses as a message
        let responseText = 'Bot Statistics Report:\n';

        if (responses.length === 0) {
          responseText += 'No modules responded within the timeout period.\n';
        } else {
          // Sort responses by module name
          responses.sort((a, b) => a.module.localeCompare(b.module));

          // Create a formatted table using ascii-table
          const table = new AsciiTable();
          table.setHeading('Module', 'Stats');

          for (const response of responses) {
            // Format stats as a string
            let statsStr = '';
            if (response.stats) {
              for (const [key, value] of Object.entries(response.stats)) {
                statsStr += `${key}: ${value} `;
              }
            } else {
              statsStr = 'No stats available';
            }

            table.addRow(response.module, statsStr.trim());
          }

          responseText += table.toString() + '\n';
          responseText += `Total modules: ${responses.length}\n`;
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

        log.info('Sent bot statistics report to user', {
          producer: 'admin',
          user: data.user,
          channel: data.channel,
          platform: data.platform,
          instance: data.instance,
          moduleCount: responses.length,
        });
      }, 5000); // 5 second timeout
    } catch (error) {
      log.error('Failed to process bot-stats command', {
        producer: 'admin',
        message: message.string(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      } catch (sendError) {
        log.error('Failed to send error message to user', {
          producer: 'admin',
          error:
            sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  })();
}
