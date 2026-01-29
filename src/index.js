#!/usr/bin/env node

/**
 * Slack Note Capture MCP Server
 *
 * Two-way communication bridge between Claude Code and Slack.
 * Enables Claude to post messages, read threads, and wait for user replies.
 *
 * Features:
 * - Post messages to channels or threads
 * - Read channel history and thread replies
 * - Wait for user replies with configurable polling
 * - File handling (info, download)
 * - Channel listing and search
 */

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

// Get the bot's own user ID for filtering replies
let botUserId = null;

async function getBotUserId() {
  if (botUserId) return botUserId;
  try {
    const authResult = await slack.auth.test();
    botUserId = authResult.user_id;
    return botUserId;
  } catch (error) {
    console.error("Failed to get bot user ID:", error.message);
    return null;
  }
}

const server = new Server(
  {
    name: "slack-note-capture",
    version: "2.0.0",
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
          "Post a message to a Slack channel. Returns the message timestamp (ts) which can be used to read thread replies later.",
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
        name: "slack_post_to_thread",
        description:
          "Post a reply to an existing message thread. Use this to continue a conversation in a thread.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description:
                "The Slack channel ID. Defaults to configured inbox channel.",
            },
            thread_ts: {
              type: "string",
              description: "The timestamp of the parent message to reply to.",
            },
            text: {
              type: "string",
              description: "The message text to post.",
            },
          },
          required: ["thread_ts", "text"],
        },
      },
      {
        name: "slack_read_thread",
        description:
          "Read all replies in a message thread. Use this to check for user responses to a message you posted.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description:
                "The Slack channel ID. Defaults to configured inbox channel.",
            },
            thread_ts: {
              type: "string",
              description: "The timestamp of the parent message.",
            },
          },
          required: ["thread_ts"],
        },
      },
      {
        name: "slack_wait_for_reply",
        description:
          "Poll a thread waiting for a user reply. Posts an initial message if provided, then polls until a non-bot reply appears or timeout is reached. Use this when you need to ask the user a question and wait for their response via Slack.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description:
                "The Slack channel ID. Defaults to configured inbox channel.",
            },
            thread_ts: {
              type: "string",
              description: "The timestamp of an existing thread to monitor. If not provided, message must be provided to start a new thread.",
            },
            message: {
              type: "string",
              description: "Message to post (starts a new thread if thread_ts not provided, or posts to existing thread).",
            },
            poll_interval_seconds: {
              type: "number",
              description: "Seconds between poll attempts. Default: 30",
            },
            timeout_minutes: {
              type: "number",
              description: "Maximum minutes to wait for a reply. Default: 15",
            },
          },
          required: [],
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

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
            thread_ts: msg.thread_ts,
            reply_count: msg.reply_count || 0,
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
                  hint: "Use the 'ts' value with slack_read_thread or slack_wait_for_reply to monitor for responses.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_post_to_thread": {
        const channelId = args.channel_id || DEFAULT_CHANNEL;
        const threadTs = args.thread_ts;
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
          thread_ts: threadTs,
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
                  thread_ts: threadTs,
                  message: result.message?.text,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_read_thread": {
        const channelId = args.channel_id || DEFAULT_CHANNEL;
        const threadTs = args.thread_ts;

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

        const result = await slack.conversations.replies({
          channel: channelId,
          ts: threadTs,
        });

        const messages = result.messages || [];
        const botId = await getBotUserId();

        // Format messages, marking which are from the bot
        const formattedMessages = messages.map((msg) => ({
          ts: msg.ts,
          text: msg.text,
          user: msg.user,
          is_bot: msg.user === botId,
          date: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  channel: channelId,
                  thread_ts: threadTs,
                  reply_count: formattedMessages.length - 1, // Exclude parent
                  messages: formattedMessages,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "slack_wait_for_reply": {
        const channelId = args.channel_id || DEFAULT_CHANNEL;
        let threadTs = args.thread_ts;
        const message = args.message;
        const pollInterval = (args.poll_interval_seconds || 30) * 1000;
        const timeoutMs = (args.timeout_minutes || 15) * 60 * 1000;

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

        if (!threadTs && !message) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Either thread_ts or message must be provided.",
              },
            ],
          };
        }

        const botId = await getBotUserId();

        // Post initial message if provided
        if (message) {
          const postResult = await slack.chat.postMessage({
            channel: channelId,
            text: message,
            thread_ts: threadTs, // Will be undefined for new thread, which is fine
          });

          // If this was a new thread, use the message ts as thread_ts
          if (!threadTs) {
            threadTs = postResult.ts;
          }
        }

        const startTime = Date.now();
        let lastCheckedTs = threadTs;

        // Poll for replies
        while (Date.now() - startTime < timeoutMs) {
          await sleep(pollInterval);

          const result = await slack.conversations.replies({
            channel: channelId,
            ts: threadTs,
          });

          const messages = result.messages || [];

          // Find non-bot replies after our last check
          const newUserReplies = messages.filter(
            (msg) =>
              msg.user !== botId &&
              msg.ts !== threadTs && // Exclude parent message
              parseFloat(msg.ts) > parseFloat(lastCheckedTs)
          );

          if (newUserReplies.length > 0) {
            // Found a reply!
            const latestReply = newUserReplies[newUserReplies.length - 1];
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      reply_received: true,
                      channel: channelId,
                      thread_ts: threadTs,
                      reply: {
                        ts: latestReply.ts,
                        text: latestReply.text,
                        user: latestReply.user,
                        date: new Date(parseFloat(latestReply.ts) * 1000).toISOString(),
                      },
                      wait_duration_seconds: Math.round((Date.now() - startTime) / 1000),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Update last checked timestamp
          if (messages.length > 0) {
            lastCheckedTs = messages[messages.length - 1].ts;
          }
        }

        // Timeout reached
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  reply_received: false,
                  reason: "timeout",
                  channel: channelId,
                  thread_ts: threadTs,
                  timeout_minutes: args.timeout_minutes || 15,
                  hint: "No reply received within the timeout period. You can call slack_read_thread later to check for replies.",
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
  console.error("Slack Note Capture MCP server v2.0.0 running");
}

main().catch(console.error);
