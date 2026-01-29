# Slack Note Capture MCP Server

A Model Context Protocol (MCP) server that enables two-way communication between Claude Code and Slack. Post messages, read threads, and wait for user replies — enabling remote conversations when you're away from your machine.

## Features

- **Two-way conversations** — Claude asks questions via Slack, you reply from your phone
- **Thread support** — Post to threads and read thread replies
- **Wait for replies** — Poll threads until you respond (configurable timeout)
- **Channel operations** — Read history, search messages, list channels
- **File handling** — Get file info and download shared files

## Use Cases

### Remote Conversations
Claude asks a question via Slack, you reply from your phone, Claude continues working.

### Task Notifications
Claude posts completion updates to a Slack channel so you know when work is done.

### Note Capture
Send ideas, links, and voice notes to Slack for Claude to process later.

### Async Workflows
Start a task, go about your day, get notified when input is needed.

## Installation

```bash
cd slack-note-capture
npm install
```

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `channels:history` — Read messages from public channels
   - `channels:read` — List channels
   - `chat:write` — Post messages
   - `files:read` — Access shared files
   - `groups:history` — Read messages from private channels (optional)
   - `groups:read` — List private channels (optional)
3. Install the app to your workspace
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
5. Invite the bot to your channel: `/invite @YourBotName`

## Configuration

### Tool Permissions (Required)

By default, Claude Code prompts for approval each time an MCP tool is used. For Slack tools to work without interruption (especially `slack_wait_for_reply` which blocks execution), you must pre-approve them.

**Add to `~/.claude/settings.local.json`:**

```json
{
  "permissions": {
    "allow": [
      "mcp__slack-note-capture__slack_read_messages",
      "mcp__slack-note-capture__slack_post_message",
      "mcp__slack-note-capture__slack_post_to_thread",
      "mcp__slack-note-capture__slack_read_thread",
      "mcp__slack-note-capture__slack_wait_for_reply",
      "mcp__slack-note-capture__slack_get_file",
      "mcp__slack-note-capture__slack_download_file",
      "mcp__slack-note-capture__slack_list_channels",
      "mcp__slack-note-capture__slack_search_messages"
    ]
  }
}
```

**Alternative (VSCode):** When prompted for tool approval, select "Yes, allow for this project (just you)" — this persists the permission in `~/.claude.json`.

**Important:** Restart Claude Code after changing permissions.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Bot User OAuth Token from your Slack app |
| `SLACK_CHANNEL_ID` | No | Default channel ID for operations |

### Claude Code Configuration

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "slack-note-capture": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/slack-note-capture/src/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token-here",
        "SLACK_CHANNEL_ID": "C0123456789"
      }
    }
  }
}
```

## Available Tools

### slack_post_message

Post a message to a channel. Returns the message timestamp (`ts`) for thread operations.

```javascript
{
  channel_id: "C0123456789",  // optional, uses default if not provided
  text: "Hello from Claude!"
}
```

### slack_post_to_thread

Reply to an existing message thread.

```javascript
{
  channel_id: "C0123456789",  // optional
  thread_ts: "1234567890.123456",  // required - parent message timestamp
  text: "This is a thread reply"
}
```

### slack_read_thread

Read all replies in a thread. Useful for checking responses to your messages.

```javascript
{
  channel_id: "C0123456789",  // optional
  thread_ts: "1234567890.123456"  // required
}
```

### slack_wait_for_reply

**The key tool for remote conversations.** Posts a message and polls for a user reply.

```javascript
{
  channel_id: "C0123456789",  // optional
  message: "I need your input on X. Please reply in this thread.",
  poll_interval_seconds: 30,  // default: 30
  timeout_minutes: 15  // default: 15
}
```

Or monitor an existing thread:

```javascript
{
  thread_ts: "1234567890.123456",
  poll_interval_seconds: 30,
  timeout_minutes: 15
}
```

**Returns** either:
- Success with the user's reply text
- Timeout with a hint to check manually later

### slack_read_messages

Read recent messages from a channel.

```javascript
{
  channel_id: "C0123456789",  // optional
  days_back: 7,  // default: 7
  limit: 100  // default: 100
}
```

### slack_list_channels

List available channels to find channel IDs.

```javascript
{
  types: "public_channel,private_channel"  // default
}
```

### slack_search_messages

Search for messages containing specific text.

```javascript
{
  query: "workshop idea",
  channel_id: "C0123456789"  // optional but recommended
}
```

### slack_get_file

Get information about a shared file.

```javascript
{
  file_id: "F0123456789"
}
```

### slack_download_file

Download a file to local storage.

```javascript
{
  file_id: "F0123456789",
  save_path: "/path/to/save/file.pdf"
}
```

## Example: Remote Question/Answer

```
Claude: I'm working on the report but need to know which format you prefer.
        Let me ask you via Slack so you can respond from your phone.

[Claude calls slack_wait_for_reply with question about format]
[User receives Slack notification on phone]
[User replies in thread: "PDF please"]
[Claude receives reply and continues work]
```

## Example: Task Completion Notification

When Claude finishes a task, it posts a summary to Slack:

```
Claude: [completes grading 15 assignments]
        Let me notify you that the task is complete.

[Claude calls slack_post_message: "✓ Grading complete — 15 assignments processed, feedback docs saved to Google Drive"]
[User receives notification on phone]
```

This is useful for long-running tasks where you've stepped away from your machine.

## Finding Channel IDs

Channel IDs are not the same as channel names. To find a channel ID:

1. Use the `slack_list_channels` tool, or
2. In Slack: right-click a channel → "View channel details" → scroll to bottom

Channel IDs look like: `C0A9WLH9KH9` (public) or `G0A9WLH9KH9` (private)

## Troubleshooting

### "not_in_channel" error
The bot needs to be added to the channel. In Slack, type `/invite @YourBotName` in the channel.

### Thread replies not appearing
Make sure you're replying **in the thread**, not as a new message in the channel. In Slack mobile, tap the message first, then reply.

### Timeout on wait_for_reply
The default timeout is 15 minutes. Increase with `timeout_minutes`, or call `slack_read_thread` later to check manually.

### MCP not loading
1. Check `~/.claude.json` syntax is valid JSON
2. Restart Claude Code / VS Code
3. Verify the path to `index.js` is correct

## Security Notes

- Never commit your `SLACK_BOT_TOKEN` to git
- The token is stored in `~/.claude.json` which is machine-specific
- Each machine needs its own configuration

## Version History

- **2.0.0** — Added two-way communication: `slack_read_thread`, `slack_post_to_thread`, `slack_wait_for_reply`
- **1.0.0** — Initial release: basic read/post/file operations

## Licence

MIT
