# Sonora

Sonora is an AI creative-studio prototype. A user chooses a music video, story, animated short, explainer, or custom format; describes the idea; and receives a production treatment and storyboard to review.

## Current milestone

The current milestone builds a dependency-free, plan-first experience. It uses a clearly labeled template planner without credentials and uses Groq for an original treatment when `GROQ_API_KEY` is configured on the local server. It supports:

- five creation types: music video, story, animated short, explainer, and custom;
- a free-form creative brief, visual style, duration, frame format, score, narration, and caption preferences;
- an optional YouTube reference used only for broad inspiration;
- a treatment and four-scene plan with audio cues, plus a Markdown download;
- visible planning phases and a clear distinction between a plan and rendered media.

Actual AI audio/video rendering is not connected in this milestone. The concept board is not a video preview, and no synthetic browser audio is presented as an AI-generated soundtrack. YouTube upload remains disabled until a real video asset exists.

## AI provider plan

The app is intentionally provider-agnostic. A media-generation milestone should expose adapter interfaces such as:

```text
generateMusic({ brief, duration }) -> audioAsset
generateScene({ prompt, references, duration, format }) -> videoClip
assembleProject({ scenes, audio, narration, captions }) -> videoAsset
```

### Creative director: Groq

Groq can act as the text creative director through the local server’s `/api/plan` endpoint. It turns any supported creation type into a treatment, scene plan, and music/narration direction. Groq does not generate audio or video files.

The browser must never receive `GROQ_API_KEY`; requests will go through a server-side endpoint. Demo Mode remains the fallback when no key is configured.

### Audio model path

The browser never receives provider secrets. GitHub Pages can host the static planner UI but cannot run `/api/plan` or securely call a model. Add a separate server runtime and real audio/video providers before enabling media generation. Free inference tiers are quota-limited and may not offer dependable video rendering.

## Run locally

```bash
npm start
```

Then open `http://localhost:4173`.

To enable AI-written treatments locally, create an untracked `.env.local` file based on `.env.example` and add your own Groq key. Never expose the key to the browser or commit the file. Without it, the planner clearly returns a template-based sample.

## GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`. GitHub Pages serves the interactive sample-planning experience. Its static frontend intentionally does not call a missing backend or claim that media has been generated. The Groq treatment endpoint works only in a server deployment with a private key.

## Planned production integrations

- a real music-generation provider for original, listenable tracks;
- an actual video-generation provider with character/style reference support;
- job progress, retries, per-scene revision, and provider cost estimates;
- media assembly, beat synchronization, narration mixing, captions, and format-specific exports;
- preview and explicit plan approval before paid rendering;
- YouTube OAuth and private-by-default upload only after a real video is reviewed;
- rights confirmation and user approval before every upload.
