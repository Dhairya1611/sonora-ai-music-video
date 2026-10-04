# Sonora

Sonora is an AI-directed music video studio prototype. It accepts either a YouTube reference URL or a creative brief, then turns the direction into an original visual storyboard and an upload-ready video workflow.

## Current milestone

This first milestone includes a dependency-free frontend and a Node server endpoint. It runs in Demo Mode so the experience can be reviewed without API keys, and automatically uses Groq when `GROQ_API_KEY` is configured. The UI already models the core product flow:

- reference URL or creative brief input;
- short/landscape output choice;
- generated preview direction;
- editable storyboard state;
- YouTube connection and private-upload approval boundary.

## AI provider plan

The app is intentionally provider-agnostic. The next backend milestone should expose a small adapter interface:

```text
analyzeReference(input) -> { mood, tempo, palette, themes }
createStoryboard(analysis, format) -> scenes[]
renderVideo(scenes, audio, format) -> videoAsset
```

### Primary option: Groq

Groq is the preferred first API for the text workflow because its free plan publishes request and token limits and its API is OpenAI-compatible. The planned adapter will use a Groq text model for structured music analysis, storyboard generation, titles, descriptions, and upload metadata. Groq also exposes Whisper models for transcription when the user supplies audio they own or are authorized to process.

The browser must never receive `GROQ_API_KEY`; requests will go through a server-side endpoint. Demo Mode remains the fallback when no key is configured.

### Other options

Hugging Face is a reasonable fallback, but its current free access is limited monthly inference credit, not unlimited generation. AirLLM is a local inference library and can be used behind a local Python service when a suitable GPU/local machine is available. Neither Groq nor AirLLM is, by itself, a complete text-to-music-video renderer. Video rendering will use a separate provider or a local FFmpeg/visual-asset pipeline.

## Run locally

```bash
npm start
```

Then open `http://localhost:4173`.

To enable the Groq path locally, create an untracked `.env.local` file based on `.env.example` and add your own Groq key. Never expose the key to the browser or commit the file.

## GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`. GitHub Pages can host the public frontend and Demo Mode, but it cannot safely execute the Groq server endpoint because Pages does not provide a private runtime for API secrets. Use a server deployment for the live Groq path, while keeping this repository as the source and Pages demo.

## Planned production integrations

- server-side Hugging Face/local-model adapter for text analysis and storyboard generation;
- separate video-generation provider or local render pipeline;
- FFmpeg assembly, audio synchronization, captions, and 9:16/16:9 exports;
- Google OAuth and YouTube Data API upload with private-by-default publishing;
- rights confirmation and user approval before every upload.
