# Sonora

Sonora is a GitHub Pages creative studio with an optional private renderer on the user's Mac. The local-first path creates an original soundtrack with ACE-Step, optionally adds macOS speech narration, renders a playable WebM motion-graphics video in the browser, and offers an explicit private YouTube upload after preview.

## Run on this Mac

Requirements: Apple Silicon macOS, Git, Node.js, an internet connection for setup/model downloads, and roughly 10 GB of model storage plus runtime/dependencies.

```bash
npm run setup:local-ai
npm start
```

Open `http://127.0.0.1:4173` for local development, or keep the companion running and use the GitHub Pages site. On the first start, the companion installs ACE-Step's Python environment and downloads its model weights. Later starts reuse the ignored `.sonora-runtime/` folder. The companion binds only to `127.0.0.1`; it does not expose the model API to the LAN or the public internet.

When using GitHub Pages, the browser connects to the loopback companion at `127.0.0.1:4173`. The companion allows only the Sonora GitHub Pages origin and its local development origins. If Chrome asks for local-network access, allow it for the site. Your YouTube OAuth token remains in the page session and is not sent to the local renderer.

Set `ACESTEP_AUTOSTART=false` to run only the web companion without starting ACE-Step. `ACE_STEP_URL` can point the companion at another local ACE-Step API during development. An optional `GROQ_API_KEY` in ignored `.env.local` enables AI-written treatments; without it, the plan/storyboard uses an explicitly labeled template. Never put provider keys in browser code or commit them.

## What the current pipeline really generates

- Music: original audio from local ACE-Step 1.5; the 2B turbo DiT model and 0.6B LM are selected for a 16 GB Apple Silicon Mac. Sonora keeps the user's full caption as the DiT conditioning text and asks the LM only for missing metadata, so instrument lists aren't first paraphrased away. It forwards an explicitly requested BPM and requests WAV so the installed soundfile backend can export without a separate FFmpeg install. The model's first run can take minutes, and output quality/latency depend on local resources.
- Narration: optional built-in macOS `say` voice, not a neural voice model.
- Video: the browser records a format-specific (9:16, 16:9, or 1:1) motion-graphics composition, optionally with the generated audio and burned-in scene captions. The visual scenes are code-rendered motion graphics—not AI-generated film footage, diffusion images, or camera video.
- Story, animated short, explainer, and custom modes share the same actual audio/video assembly path, with type-specific scene structures and visuals. Without `GROQ_API_KEY`, their written treatment is a template rather than an LLM-generated script.
- YouTube: the user explicitly initiates upload after preview; the upload request sets `privacyStatus: private`. A successful API response yields a link to the private video. The user must connect a channel with upload and read-only scopes in their own Google OAuth configuration.
- Optional YouTube reference links are not downloaded or analyzed for audio/video in this local MVP. They are inspiration-only input to a configured text planner; the music generation does not reproduce reference audio.

## Checks

```bash
npm test
```

The test suite uses a local mock ACE-Step API to verify the job flow, returned audio bytes, GitHub Pages CORS/private-network preflight, and rejection of unrelated origins. It does not substitute for a live generation run or an actual YouTube upload.

## Hosting boundary

GitHub Pages serves the static frontend only. Each person who wants local generation needs the companion and local model on their Mac; GitHub Pages cannot host the private model service. A public multi-user product would need a separately hosted, authenticated renderer and a provider/budget plan.
