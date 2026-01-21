#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebClient } from "@slack/web-api";

// Get credentials from environment
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const DEFAULT_CHANNEL = process.env.SLACK_CHANNEL_ID;

if (!SLACK_BOT_TOKEN) {
  console.error("Error: SLACK_BOT_TOKEN environment variable is required");
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

const server = new Server(
  {
    name: "slack-note-capture",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "slack_read_messages",
        description:
          "Read messages from a Slack channel. Returns messages from the last N days or since a specific timestamp. Use this to pull captured content from the inbox.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description:
                "The Slack channel ID. Defaults to configured inbox channel.",
            },
            days_back: {
              type: "number",
              description:
                "Number of days of history to fetch. Default is 7.",
            },
            oldest: {
              type: "string",
              description:
                "Unix timestamp. If provided, only messages after this time are returned.",
            },
            limit: {
              type: "number",
              description: "Maximum number of messages to return. Default 100.",
            },
          },
          required: [],
        },
      },
      {
        name: "slack_post_message",
        description:
          "Post a message to a Slack channel. Use this to send Apple Notes content to the inbox or post processing confirmations.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description:
                "The Slack channel ID. Defaults to configured inbox channel.",
            },
            text: {
              type: "string",
              description: "The message text to post.",
            },
          },
          required: ["text"],
        },
      },
      {
        name: "slack_get_file",
        description:
          "Get information about a file shared in Slack, including download URL. Use this to retrieve voice notes and documents.",
        inputSchema: {
          type: "object",
          properties: {
            file_id: {
              type: "string",
              description: "The Slack file ID.",
            },
          },
          required: ["file_id"],
        },
      },
      {
        name: "slack_download_file",
        description:
          "Download a file from Slack and save it to the specified path.",
        inputSchema: {
          type: "object",
          properties: {
            file_id: {
              type: "string",
              description: "The Slack file ID to download.",
            },
            save_path: {
              type: "string",
              description: "Local file path where the file should be saved.",
            },
          },
          required: ["file_id", "save_path"],
        },
      },
      {
        name: "slack_list_channels",
        description:
          "List available Slack channels. Use this to find channel IDs.",
        inputSchema: {
          type: "object",
          properties: {
            types: {
              type: "string",
              description:
                "Channel types to include: public_channel, private_channel. Default: public_channel,private_channel",
            },
          },
          required: [],
        },
      },
      {
        name: "slack_search_messages",
        description:
          "Search for messages containing specific text or hashtags.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., '#GenAI' or 'workshop idea').",
            },
            channel_id: {
              type: "string",
              description: "Limit search to specific channel.",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "slack_read_messages": {
        const channelId = args.channel_id || DEFAULT_CHANNEL;
        const daysBack = args.days_back || 7;
        const limit = args.limit || 100;

        if (!channelId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No channel ID provided and no default channel configured.",
              },
            ],
          };
        }

        // Calculate oldest timestamp
        const oldest =
          args.oldest ||
          String(Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60);

        const result = await slack.conversations.history({
          channel: channelId,
          oldest: oldest,
          limit: limit,
          inclusive: true,
        });

        const messages = result.messages || [];

        // Format messages with files info
        const formattedMessages = messages.map((msg) => {
          let formatted = {
            ts: msg.ts,
            text: msg.text,
            user: msg.user,
            date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          };

          if (msg.files && msg.files.length > 0) {
            formatted.files = msg.files.map((f) => ({
              id: f.id,
              name: f.name,
              mimetype: f.mimetype,
              size: f.size,
              url_private: f.url_private,
            }));
          }

          return formatted;
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  channel: channelId,
                  message_count: formattedMessages.length,
                  messages: formattedMessages.reverse(), // Chronological order
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_post_message": {
        const channelId = args.channel_id || DEFAULT_CHANNEL;
        const text = args.text;

        if (!channelId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No channel ID provided and no default channel configured.",
              },
            ],
          };
        }

        const result = await slack.chat.postMessage({
          channel: channelId,
          text: text,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  channel: result.channel,
                  ts: result.ts,
                  message: result.message?.text,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_get_file": {
        const fileId = args.file_id;

        const result = await slack.files.info({
          file: fileId,
        });

        const file = result.file;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: file.id,
                  name: file.name,
                  title: file.title,
                  mimetype: file.mimetype,
                  size: file.size,
                  url_private: file.url_private,
                  url_private_download: file.url_private_download,
                  created: new Date(file.created * 1000).toISOString(),
                  user: file.user,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_download_file": {
        const fileId = args.file_id;
        const savePath = args.save_path;

        // Get file info first
        const fileInfo = await slack.files.info({
          file: fileId,
        });

        const file = fileInfo.file;
        const downloadUrl = file.url_private_download || file.url_private;

        if (!downloadUrl) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No download URL available for this file.",
              },
            ],
          };
        }

        // Download the file using fetch with auth header
        const response = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          },
        });

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error downloading file: ${response.status} ${response.statusText}`,
              },
            ],
          };
        }

        // Write to file
        const fs = await import("fs/promises");
        const path = await import("path");

        // Ensure directory exists
        await fs.mkdir(path.dirname(savePath), { recursive: true });

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(savePath, buffer);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  file_name: file.name,
                  saved_to: savePath,
                  size: buffer.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_list_channels": {
        const types = args.types || "public_channel,private_channel";

        const result = await slack.conversations.list({
          types: types,
          exclude_archived: true,
        });

        const channels = (result.channels || []).map((ch) => ({
          id: ch.id,
          name: ch.name,
          is_private: ch.is_private,
          num_members: ch.num_members,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  channel_count: channels.length,
                  channels: channels,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_search_messages": {
        const query = args.query;
        const channelId = args.channel_id;

        // Note: search.messages requires a user token, not a bot token
        // For bot tokens, we'll filter messages from history instead
        if (channelId || DEFAULT_CHANNEL) {
          const channel = channelId || DEFAULT_CHANNEL;

          // Get recent history and filter
          const result = await slack.conversations.history({
            channel: channel,
            limit: 200,
          });

          const messages = (result.messages || []).filter((msg) =>
            msg.text?.toLowerCase().includes(query.toLowerCase())
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query: query,
                    channel: channel,
                    match_count: messages.length,
                    matches: messages.map((msg) => ({
                      ts: msg.ts,
                      text: msg.text,
                      date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: "Error: Channel ID required for search with bot token.",
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Slack Note Capture MCP server running");
}

main().catch(console.error);
