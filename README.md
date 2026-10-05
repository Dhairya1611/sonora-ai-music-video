# Sonora

Sonora is a prompt-first AI-directed music video studio prototype. The user describes the music they want, may optionally add a YouTube reference for broad inspiration, and receives an original music score, visual storyboard, preview, and upload-ready video workflow.

## Current milestone

This first milestone includes a dependency-free frontend and a Node server endpoint. It runs in Demo Mode so the experience can be reviewed without API keys, and automatically uses Groq when `GROQ_API_KEY` is configured. The UI already models the core product flow:

- a music-generation brief describing genre, instruments, tempo, mood, vocals, and story;
- an optional YouTube reference used only for broad inspiration;
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

### Creative director: Groq

Groq is used as the text creative director because its API is OpenAI-compatible. It turns the user brief and optional reference into structured genre, mood, BPM, instrument, rhythm, visual, title, and storyboard guidance. Groq does not generate the audio waveform itself.

The browser must never receive `GROQ_API_KEY`; requests will go through a server-side endpoint. Demo Mode remains the fallback when no key is configured.

### Audio model path

MusicGen is the aligned open model for text-to-music generation. The current GitHub Pages build uses a no-key browser music renderer so the demo remains functional. A production MusicGen adapter must run server-side or locally; the model is not safe to call with a secret from a static page, and inference availability/limits vary by provider. Hugging Face documents a free tier for Inference Providers, but it is not unlimited generation.

## Run locally

```bash
npm start
```

Then open `http://localhost:4173`.

To enable the Groq path locally, create an untracked `.env.local` file based on `.env.example` and add your own Groq key. Never expose the key to the browser or commit the file.

## GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml`. GitHub Pages can host the public frontend and Demo Mode, but it cannot safely execute the Groq server endpoint because Pages does not provide a private runtime for API secrets. Use a server deployment for the live Groq path, while keeping this repository as the source and Pages demo.

## Planned production integrations

- server-side MusicGen/Hugging Face or local AudioCraft adapter for actual AI audio generation;
- separate video-generation provider or local render pipeline;
- FFmpeg assembly, audio synchronization, captions, and 9:16/16:9 exports;
- Google OAuth and YouTube Data API upload with private-by-default publishing;
- rights confirmation and user approval before every upload.
