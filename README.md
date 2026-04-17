# ReviewHub

Capture UI review annotations from [Agentation](https://www.agentation.com/) and post them to Slack — with screenshots.

ReviewHub is a lightweight Next.js app that acts as a bridge between the Agentation review widget (embedded in your prototype) and a Slack channel. When a reviewer annotates your UI, ReviewHub posts the annotations and a full-page screenshot to a dedicated Slack thread.

## How It Works

```
┌─────────────────┐      webhook POST       ┌─────────────┐     Slack API     ┌───────┐
│  Your Prototype  │  ──────────────────────► │  ReviewHub  │  ──────────────►  │ Slack │
│  + Agentation    │   annotations + screenshot │ (Vercel)  │  thread replies   │       │
└─────────────────┘                          └─────────────┘                   └───────┘
```

1. **Create a project** on the ReviewHub dashboard — this creates a Slack thread and gives you a webhook URL.
2. **Add Agentation** to your prototype with the webhook URL.
3. **Reviewers annotate** the live UI. Each annotation is posted to Slack in real time — with its own screenshot when using Option C.
4. **On submit**, a full-page screenshot + all annotations are posted to the Slack thread.

Screenshots are automatically annotated with **numbered marker pins** at each annotation's position (and optional bounding-box highlights), so you can match marker #3 on the image to annotation #3 in the text. This requires the `viewport` field in the webhook payload (see [Webhook API](#webhook-api)).

### Stateless Architecture

ReviewHub encodes Slack thread info (thread timestamp + project name) directly into the webhook URL as a base64url token. No database or server-side storage is needed — Slack is the single source of truth, and webhook URLs survive redeployments.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Dashboard UI (create projects, copy webhook URLs)
│   ├── api/
│   │   ├── projects/route.ts             # POST /api/projects — create project + Slack thread
│   │   └── webhook/[projectId]/route.ts  # POST /api/webhook/:token — receive annotations
├── components/
│   └── review-capture.tsx                # Client component for screenshot capture (copy into prototype)
└── lib/
    ├── annotate.ts                       # Overlay numbered markers on screenshots (sharp)
    ├── slack.ts                          # Slack API helpers (post messages, upload screenshots)
    ├── store.ts                          # Stateless token encode/decode
    └── types.ts                          # TypeScript types (annotations, events, tokens)
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- A Slack workspace with a bot token

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Create a `.env.local` file:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0123456789
```

**Slack bot scopes needed:** `chat:write`, `files:write` (for screenshot uploads).

Make sure to invite the bot to your channel: type `/invite @YourBotName` in the Slack channel.

### 3. Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to create a project and get your webhook URL.

## Integrating with Your Prototype

### Option A: Agentation webhook only (no screenshots)

```tsx
import { Agentation } from "agentation";

<Agentation webhookUrl="https://reviewhub-weld.vercel.app/api/webhook/YOUR_TOKEN" />
```

### Option B: With screenshot on submit only

```bash
npm install modern-screenshot
```

Copy `src/components/review-capture.tsx` into your prototype, then:

```tsx
import { useRef } from "react";
import { Agentation } from "agentation";
import ReviewCapture from "./review-capture";

function App() {
  const captureRef = useRef<{ submit: (annotations: any[]) => void }>(null);
  return (
    <>
      <ReviewCapture
        ref={captureRef}
        webhookUrl="https://reviewhub-weld.vercel.app/api/webhook/YOUR_TOKEN"
      />
      <Agentation
        onSubmit={(output, annotations) => captureRef.current?.submit(annotations)}
      />
    </>
  );
}
```

### Option C: With screenshot per annotation (recommended)

Each annotation is posted to Slack with its own screenshot, giving reviewers
full visual context for every piece of feedback.

```bash
npm install modern-screenshot
```

Copy `src/components/review-capture.tsx` into your prototype, then:

```tsx
import { useRef } from "react";
import { Agentation } from "agentation";
import ReviewCapture, { type ReviewCaptureHandle } from "./review-capture";

function App() {
  const captureRef = useRef<ReviewCaptureHandle>(null);
  return (
    <>
      <ReviewCapture
        ref={captureRef}
        webhookUrl="https://reviewhub-weld.vercel.app/api/webhook/YOUR_TOKEN"
      />
      <Agentation
        onAnnotationAdd={(annotation) =>
          captureRef.current?.sendAnnotation(annotation)
        }
        onAnnotationUpdate={(annotation) =>
          captureRef.current?.sendAnnotation(annotation, "annotation.update")
        }
        onSubmit={(output, annotations) =>
          captureRef.current?.submit(annotations)
        }
      />
    </>
  );
}
```

> **Note:** When using per-annotation screenshots, you may want to omit the
> `webhookUrl` prop from `<Agentation>` to avoid duplicate posts (ReviewCapture
> already forwards each annotation to the webhook with the screenshot attached).
> The deduplication layer will handle duplicates if both are set, but removing
> `webhookUrl` avoids unnecessary network requests.

## Webhook API

### `POST /api/webhook/:token`

Accepts two payload formats:

**ReviewSubmission** (from ReviewCapture — includes screenshot):
```json
{
  "url": "https://my-app.vercel.app/page",
  "annotations": [{ "id": "...", "comment": "...", ... }],
  "screenshot": "data:image/jpeg;base64,...",
  "viewport": { "width": 1440, "height": 900, "devicePixelRatio": 2, "scrollY": 0 }
}
```

**WebhookEvent** (from Agentation — real-time events):
```json
{
  "event": "annotation.add",
  "timestamp": 1234567890,
  "url": "https://my-app.vercel.app/page",
  "annotation": { "id": "...", "comment": "...", ... }
}
```

Supported events: `annotation.add`, `annotation.update`, `annotation.delete`, `annotations.clear`, `submit`.

### `GET /api/webhook/:token`

Health check — returns project info and accepted events.

### `POST /api/projects`

Create a new project. Body: `{ "name": "My App", "baseUrl": "https://my-app.vercel.app" }`.

## Deploy

Deploy to Vercel with the same environment variables:

```bash
# Using Vercel CLI
vercel --prod

# Or connect the GitHub repo in the Vercel dashboard
```

Set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` in your Vercel project's environment variables (Settings → Environment Variables).

## Key Design Decisions

- **No database** — project tokens are self-contained (base64url-encoded JSON with Slack thread timestamp + project name).
- **Annotation dedup** — in-memory best-effort deduplication prevents double-posting when Agentation real-time events race with the ReviewCapture submit. On serverless, this is per-instance only.
- **Screenshot as JPEG** — compressed at 85% quality for smaller payloads. Uploaded to Slack via `files.uploadV2`.
- **Annotation markers** — screenshots are composited server-side with numbered pins (via `sharp`) using annotation `x`/`y` coordinates and viewport data. Handles DPR scaling and fixed-position elements.
- **CORS enabled** — the webhook accepts cross-origin requests so prototypes on any domain can POST to it.
