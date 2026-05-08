# ReviewHub

Capture UI review annotations from [Agentation](https://www.agentation.com/) and route them to Slack, Confluence, both, or neither.

ReviewHub is a lightweight Next.js app that receives Agentation review webhooks, groups comments by project/day/session/submission, and publishes them to the destinations configured for that project.

## How It Works

```txt
Prototype + Agentation
        |
        | one ReviewHub webhook URL
        v
ReviewHub project router
        |
        +--> Slack daily/session thread
        +--> Confluence daily/session child page
```

1. Create a project on the ReviewHub dashboard.
2. Choose destinations: Slack, Confluence, both, or none.
3. Choose grouping: daily, session, or per submission.
4. Copy the single webhook URL into Agentation.
5. ReviewHub receives comments and routes them server-side based on the project config.

The prototype URL is optional. Project identity comes from the ReviewHub project ID in the webhook URL, so two projects can both run at `http://localhost:3000` and still publish to different Slack threads or Confluence pages.

## Storage Model

ReviewHub uses Vercel KV when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured. Local development falls back to in-memory storage.

Project config:

```txt
reviewhub:project:{projectId}
```

Daily/session group state:

```txt
reviewhub:project:{projectId}:group:{groupId}
```

Latest group link for dashboard visibility:

```txt
reviewhub:project:{projectId}:latest-group
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm
- Optional: Vercel KV for persistent project storage
- Optional: Slack bot token
- Optional: Confluence API token

### Install

```bash
pnpm install
```

### Environment

```env
# Vercel KV, optional locally but recommended in production
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Slack, required only for Slack destinations
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0123456789

# Confluence, required only for Confluence destinations
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_EMAIL=you@example.com
CONFLUENCE_API_TOKEN=your-api-token
CONFLUENCE_SPACE_ID=123456
CONFLUENCE_PARENT_PAGE_ID=789012
```

Slack bot scopes: `chat:write`, `files:write`, and `links:read`/permalink access through Slack Web API behavior. Invite the bot to each configured channel.

Confluence needs permission to create and update pages in the configured space.

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## New Project Workflow

1. Enter a project label, e.g. `Client A Dashboard`.
2. Optionally enter a default/prototype URL for display context.
3. Select grouping:
   - `daily`: one Slack thread / Confluence page per project per day.
   - `session`: one thread/page per provided session ID, falling back to the day.
   - `submission`: one thread/page per webhook submission.
4. Enable Slack and provide a channel ID, or leave blank to use `SLACK_CHANNEL_ID`.
5. Enable Confluence and provide a space ID and optional parent page ID, or use env defaults.
6. Copy the generated webhook URL.

```tsx
import { Agentation } from "agentation";

<Agentation webhookUrl="https://reviewhub.example.com/api/webhook/proj_abc123" />
```

ReviewHub creates Slack threads and Confluence pages lazily on the first review for each group. The dashboard shows direct links to the latest Slack thread and Confluence page once they exist.

## Webhook API

### `POST /api/webhook/:projectId`

Accepts ReviewCapture submissions:

```json
{
  "url": "https://my-app.vercel.app/page",
  "annotations": [{ "id": "...", "comment": "...", "elementPath": "..." }],
  "screenshot": "data:image/jpeg;base64,...",
  "viewport": { "width": 1440, "height": 900, "devicePixelRatio": 2, "scrollY": 0 }
}
```

Accepts Agentation events:

```json
{
  "event": "annotation.add",
  "timestamp": 1234567890,
  "url": "https://my-app.vercel.app/page",
  "annotation": { "id": "...", "comment": "...", "elementPath": "..." }
}
```

Supported events: `annotation.add`, `annotation.update`, `annotation.delete`, `annotations.clear`, `submit`.

### `GET /api/webhook/:projectId`

Health check for a project webhook.

### `GET /api/projects`

Lists active ReviewHub projects and their latest destination links.

### `POST /api/projects`

Creates a project.

```json
{
  "name": "Client A Dashboard",
  "defaultUrl": "https://client-a.vercel.app",
  "grouping": "daily",
  "destinations": {
    "slack": { "enabled": true, "channelId": "C0123456789" },
    "confluence": {
      "enabled": true,
      "spaceId": "123456",
      "parentPageId": "789012"
    }
  }
}
```

## Validation

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```
