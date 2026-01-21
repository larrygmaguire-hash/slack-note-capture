# Slack Note Capture

A Slack MCP server for capturing notes, ideas, and files via Slack and archiving to Google Drive.

## Overview

**Slack Note Capture** uses Slack as a unified inbox for frictionless capture throughout the week, with periodic processing and archiving via Claude.

```
Capture (Slack) → Process (Claude + MCP) → Archive (Google Drive)
```

## Features

- **Read messages** from Slack channels
- **Post messages** to Slack (for Apple Notes transfer, confirmations)
- **Download files** including voice notes and documents
- **Search messages** by content or hashtags
- **Auto-tagging** based on hashtags in message content

## Prerequisites

- Node.js 18+
- A Slack workspace (free plan works)
- Claude Code with MCP support
- Google Drive sync enabled on your Mac

## Setup Instructions

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it `Slack Note Capture` and select your workspace
4. Click **Create App**

### 2. Configure Bot Permissions

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll to **Scopes** → **Bot Token Scopes**
3. Add these scopes:
   - `channels:history` — Read messages from public channels
   - `channels:read` — List channels
   - `chat:write` — Post messages
   - `files:read` — Access file info
   - `groups:history` — Read messages from private channels
   - `groups:read` — List private channels

### 3. Install the App

1. Scroll up to **OAuth Tokens for Your Workspace**
2. Click **Install to Workspace**
3. Authorise the app
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 4. Create Your Inbox Channel

1. In Slack, create a channel called `#inbox` (or your preferred name)
2. Right-click the channel → **View channel details**
3. Scroll to the bottom and copy the **Channel ID** (e.g., `C0123456789`)

### 5. Install the MCP Server

```bash
cd /path/to/slack-note-capture
npm install
```

### 6. Configure Claude Code

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "slack-note-capture": {
      "command": "node",
      "args": ["/path/to/slack-note-capture/src/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token-here",
        "SLACK_CHANNEL_ID": "C0123456789"
      }
    }
  }
}
```

Replace:
- `/path/to/slack-note-capture` with your actual path
- `xoxb-your-bot-token-here` with your Bot User OAuth Token
- `C0123456789` with your inbox channel ID

### 7. Restart Claude Code

Restart VS Code or your Claude Code terminal to load the new MCP server.

### 8. Test the Connection

Ask Claude:
```
List my Slack channels
```

You should see your workspace channels listed.

## Usage

### Capturing Content

Throughout your week, send anything to your `#inbox` channel:

- **Quick thoughts:** Just type them
- **Voice notes:** Record an audio message
- **Links:** Paste URLs with optional notes
- **Files:** Upload documents, images
- **Tagged content:** Add hashtags like `#GenAI #Idea`

### Weekly Processing

At the end of each week, ask Claude:

```
Process my Slack inbox and save to Google Drive
```

Claude will:
1. Pull all messages from the last 7 days
2. Create a dated folder: `Google Drive/Slack/2026/01-January/21-01-2026/`
3. Save messages as markdown
4. Download voice notes and files
5. Apply macOS Finder tags based on hashtags
6. Post a confirmation to Slack

### Transferring Apple Notes

To consolidate Apple Notes into Slack:

```
Send my Apple Notes from "Claude To Do" folder to Slack
```

### Available Commands

| Action | Example |
|--------|---------|
| Read inbox | "Show me my Slack inbox from the last 7 days" |
| Post to inbox | "Post this to my Slack inbox: [content]" |
| Search by tag | "Find all messages tagged #GenAI" |
| Download file | "Download the voice note from my last message" |
| Process inbox | "Process my Slack inbox and archive to Google Drive" |

## Folder Structure

```
Google Drive/
└── Slack/
    └── 2026/
        └── 01-January/
            └── 21-01-2026/
                ├── messages.md
                ├── voice-notes/
                │   ├── recording-001.m4a
                │   └── recording-001-transcript.md
                └── files/
                    └── document.pdf
```

## Tagging

Add hashtags inline when capturing:

```
Workshop idea for prompt engineering basics #GenAI #Workshop #Idea
```

During processing, these become macOS Finder tags on the saved files, enabling:
- Spotlight search by tag
- Smart Folders
- Quick filtering

## Limitations

- **Slack free plan:** 90-day message history, 10 app limit, 5GB storage
- **Voice transcription:** Handled by Claude, not automatic
- **Search:** Limited to channel history with bot token (no workspace-wide search)

## Troubleshooting

### "No channel ID provided"

Ensure `SLACK_CHANNEL_ID` is set in your Claude config.

### "not_in_channel" error

Add your bot to the channel:
1. Open the channel in Slack
2. Type `/invite @Slack Note Capture`

### Files not downloading

Check that `files:read` scope is added to your bot.

### MCP not loading

1. Check `~/.claude.json` syntax (valid JSON)
2. Restart VS Code completely
3. Check the path to `index.js` is correct

## Security Notes

- Never commit your `SLACK_BOT_TOKEN` to git
- The token is stored in `~/.claude.json` which is not synced
- Each machine needs its own configuration

---

MIT License
