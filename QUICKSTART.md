# Quickstart Guide

This guide walks you through setting up Slack Note Capture from scratch. No prior experience with MCP servers required.

## What This Does

Slack Note Capture connects Claude Code (an AI coding assistant) to your Slack workspace. Once connected, Claude can:

- **Send you messages** when it needs input or has completed a task
- **Wait for your reply** so you can respond from your phone while away from your computer
- **Read your messages** to process notes, ideas, or files you've sent to a Slack channel

This is useful when you want to start a task, walk away, and have Claude notify you or ask questions via Slack.

## Prerequisites

Before starting, you need:

1. **Node.js 18 or later**
   - Check if installed: open Terminal and run `node --version`
   - If not installed: download from [nodejs.org](https://nodejs.org/) (choose the LTS version)

2. **Claude Code**
   - The CLI tool from Anthropic that runs Claude in your terminal or VS Code
   - Install guide: [claude.ai/claude-code](https://claude.ai/claude-code)

3. **A Slack workspace**
   - Free plan works fine
   - You need permission to install apps (check with your workspace admin if unsure)

## Step 1: Download the Code

Open Terminal and run:

```bash
# Navigate to where you want to store it (e.g., your home folder)
cd ~

# Clone the repository
git clone https://github.com/larrygmaguire-hash/slack-note-capture.git

# Enter the folder
cd slack-note-capture

# Install dependencies
npm install
```

Note the full path to this folder — you'll need it later. Run `pwd` to see it (e.g., `/Users/yourname/slack-note-capture`).

## Step 2: Create a Slack App

### 2.1 Open the Slack API Dashboard

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Sign in with your Slack account if prompted
3. Click the green **Create New App** button

### 2.2 Choose Creation Method

1. Select **From scratch** (not "From an app manifest")
2. Enter an app name: `Claude Assistant` (or any name you prefer)
3. Select your workspace from the dropdown
4. Click **Create App**

### 2.3 Add Bot Permissions

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll down to **Scopes** section
3. Under **Bot Token Scopes**, click **Add an OAuth Scope**
4. Add each of these scopes (click "Add an OAuth Scope" for each one):

| Scope | What it allows |
|-------|----------------|
| `channels:history` | Read messages from public channels |
| `channels:read` | See list of public channels |
| `chat:write` | Send messages |
| `files:read` | Access files shared in channels |
| `groups:history` | Read messages from private channels (optional) |
| `groups:read` | See list of private channels (optional) |

### 2.4 Install the App to Your Workspace

1. Scroll up to **OAuth Tokens for Your Workspace**
2. Click **Install to Workspace**
3. Review the permissions and click **Allow**
4. You'll see a **Bot User OAuth Token** (starts with `xoxb-`)
5. Click **Copy** and save this token somewhere safe — you'll need it in Step 4

> ⚠️ **Keep this token secret.** Anyone with this token can read and post messages as your bot.

### 2.5 Create a Channel for Claude

1. Open Slack
2. Create a new channel (e.g., `#claude-inbox` or `#assistant`)
3. This will be where Claude sends you messages

### 2.6 Get the Channel ID

Channel IDs are different from channel names. To find it:

1. In Slack, right-click on your new channel
2. Select **View channel details**
3. Scroll to the bottom of the panel
4. Copy the **Channel ID** (looks like `C0A1B2C3D4E`)

### 2.7 Invite the Bot to the Channel

In Slack, go to your channel and type:

```
/invite @Claude Assistant
```

(Use whatever name you gave your app in step 2.2)

## Step 3: Configure Claude Code

### 3.1 Find Your Claude Configuration File

The configuration file is at `~/.claude.json`. Open it in a text editor:

```bash
# On Mac/Linux
open ~/.claude.json

# Or use any text editor
code ~/.claude.json  # VS Code
nano ~/.claude.json  # Terminal editor
```

If the file doesn't exist, create it with this content:

```json
{
  "mcpServers": {}
}
```

### 3.2 Add the Slack Server Configuration

Find the `"mcpServers"` section and add the slack-note-capture configuration. Your file should look like this:

```json
{
  "mcpServers": {
    "slack-note-capture": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/yourname/slack-note-capture/src/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-actual-token-here",
        "SLACK_CHANNEL_ID": "C0A1B2C3D4E"
      }
    }
  }
}
```

**Replace:**
- `/Users/yourname/slack-note-capture` with the actual path from Step 1
- `xoxb-your-actual-token-here` with your Bot User OAuth Token from Step 2.4
- `C0A1B2C3D4E` with your Channel ID from Step 2.6

> **Important:** Make sure the JSON syntax is valid. Use a JSON validator if unsure: [jsonlint.com](https://jsonlint.com/)

### 3.3 Restart Claude Code

Close and reopen VS Code, or restart your Claude Code terminal session. This loads the new MCP server.

## Step 4: Test Your Setup

### 4.1 Check the Server Loaded

In Claude Code, type:

```
List my Slack channels
```

Claude should respond with a list of channels from your workspace. If you see your channels, the connection is working.

### 4.2 Test Posting a Message

Ask Claude:

```
Post "Hello from Claude!" to my Slack inbox
```

Check your Slack channel — you should see the message appear.

### 4.3 Test Reading Messages

Send a message to your Slack channel manually (just type something), then ask Claude:

```
Show me recent messages from my Slack inbox
```

Claude should show you the message you just sent.

### 4.4 Test the Reply Feature

This is the key feature. Ask Claude:

```
Post a message to Slack asking what format I want for a report, then wait for my reply
```

Claude will:
1. Post a message to your Slack channel
2. Wait for you to reply (check your phone!)
3. Continue once you respond in the thread

**Important:** Reply **in the thread**, not as a new message. On mobile, tap Claude's message first, then type your reply.

## Step 5: Set Up Permissions (Recommended)

By default, Claude asks for permission each time it uses a Slack tool. To avoid constant prompts:

1. Open `~/.claude/settings.local.json` (create it if it doesn't exist)
2. Add:

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

3. Restart Claude Code

## Troubleshooting

### "No MCP servers loaded" or Slack tools not appearing

1. Check `~/.claude.json` has valid JSON syntax
2. Verify the path to `index.js` is correct
3. Restart Claude Code completely

### "not_in_channel" error

The bot isn't in the channel. In Slack, type `/invite @YourBotName` in the channel.

### Claude posts but you don't see it

1. Check you're looking at the right channel
2. Make sure the Channel ID in your config matches the channel

### Reply not detected

Make sure you reply **in the thread**:
- On mobile: tap the message first, then reply
- On desktop: hover over the message, click the speech bubble icon, then reply

### Token errors

Your Bot User OAuth Token may be invalid. Go back to [api.slack.com/apps](https://api.slack.com/apps), select your app, and check **OAuth & Permissions** for the current token.

## What's Next?

Now that setup is complete, you can:

- **Ask Claude to notify you** when long tasks complete
- **Have Claude ask questions** while you're away from your desk
- **Send notes to Slack** throughout the day for Claude to process later

Example prompts to try:

```
When you finish this task, post a summary to my Slack channel
```

```
I need to step away. If you have any questions, ask me via Slack and wait for my reply.
```

```
Check my Slack inbox for any notes I've sent this week
```

---

For technical documentation and advanced usage, see [README.md](README.md).
