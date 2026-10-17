import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';
const aceUrl = (process.env.ACE_STEP_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const jobs = new Map();
const maxJobs = 8;
const allowedOrigins = new Set([
  'https://dhairya1611.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  ...(process.env.SONORA_ALLOWED_ORIGIN ? [process.env.SONORA_ALLOWED_ORIGIN] : []),
]);

function loadLocalEnv() {
  try {
    const text = readFileSync(path.join(root, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

loadLocalEnv();

const typeLabels = {
  'music-video': 'Music video',
  story: 'Story',
  'animated-short': 'Animated short',
  explainer: 'Explainer',
  custom: 'Custom video',
};

const scenePlans = {
  'music-video': [
    ['Opening image', 'Introduce the visual world and let the first musical motif breathe.'],
    ['The pulse arrives', 'Build movement and texture as the rhythm and arrangement open up.'],
    ['The emotional lift', 'Bring the central image or performance into focus at the musical peak.'],
    ['Last note', 'Resolve the visual story with a final image that lands with the music.'],
  ],
  story: [
    ['A world before', 'Meet the protagonist and understand what matters in their world.'],
    ['The turning point', 'An unexpected event forces the protagonist to make a choice.'],
    ['The hard choice', 'The choice has consequences; raise the emotional and visual stakes.'],
    ['A changed world', 'Resolve the central conflict with a clear, satisfying final image.'],
  ],
  'animated-short': [
    ['Meet the character', 'Establish the character silhouette, personality, and animated world.'],
    ['A curious discovery', 'Use expressive motion and a visual surprise to set the story in motion.'],
    ['The playful challenge', 'Escalate the action while preserving character design and screen direction.'],
    ['A little wonder', 'Finish with a memorable, emotionally clear animated payoff.'],
  ],
  explainer: [
    ['The question', 'Start with the viewer’s question and a concrete visual hook.'],
    ['The simple model', 'Introduce one visual metaphor that makes the main idea intuitive.'],
    ['How it works', 'Show the key steps in order, with narration and captions in sync.'],
    ['The takeaway', 'Repeat the core idea and close with a practical, memorable summary.'],
  ],
  custom: [
    ['Set the scene', 'Establish the subject, audience, tone, and visual world.'],
    ['Build the idea', 'Develop the central action or message with a distinct progression.'],
    ['Make the moment', 'Deliver the most important reveal, change, or emotional beat.'],
    ['Leave an impression', 'Resolve the idea with a strong final image or call to action.'],
  ],
};

function readJson(request, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) reject(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
    request.on('error', reject);
  });
}

function normalizeRequest(body) {
  const input = String(body.input || '').trim().slice(0, 1800);
  if (!input) throw new Error('Describe what you want Sonora to create first.');
  const type = Object.hasOwn(typeLabels, body.type) ? body.type : 'music-video';
  const format = ['short', 'wide', 'square'].includes(body.format) ? body.format : 'short';
  const duration = [15, 30, 60, 90].includes(Number(body.duration)) ? Number(body.duration) : 30;
  return {
    input,
    reference: String(body.reference || '').trim().slice(0, 500),
    visualStyle: String(body.visualStyle || '').trim().slice(0, 180),
    type,
    format,
    duration,
    sound: {
      music: body.sound?.music !== false,
      narration: body.sound?.narration === true,
      captions: body.sound?.captions !== false,
    },
  };
}

function demoResult(request) {
  const direction = `${request.input} ${request.visualStyle}`.toLowerCase();
  const dreamy = /dream|ambient|soft|ethereal|calm|lo-fi/.test(direction);
  const energetic = /dance|edm|house|techno|upbeat|energetic|club|trap|hip.?hop/.test(direction);
  const acoustic = /acoustic|guitar|piano|folk|organic|indie|jazz|strings/.test(direction);
  const requestedTempo = direction.match(/\b(\d{2,3})\s*(?:bpm|beats per minute)\b/);
  const analysis = {
    genre: energetic ? 'electronic' : acoustic ? 'acoustic indie' : dreamy ? 'ambient pop' : 'cinematic pop',
    mood: energetic ? 'driving' : acoustic ? (/hopeful|uplift|joy/.test(direction) ? 'hopeful and warm' : 'warm and reflective') : dreamy ? 'dreamy' : 'cinematic',
    energy: energetic ? 'high' : acoustic ? 'gently building' : dreamy ? 'low' : 'building',
    tempo: Number(requestedTempo?.[1]) || (energetic ? 122 : dreamy ? 82 : acoustic ? 96 : 108),
    instruments: acoustic ? ['fingerpicked acoustic guitar', 'warm piano', 'brush drums', 'round bass'] : energetic ? ['analog synth bass', 'bright pluck', 'four-on-the-floor kick', 'claps and hi-hats'] : ['felt piano', 'soft strings', 'sub bass', 'textured drums'],
    palette: ['violet', 'warm amber', 'midnight blue'],
    visualThemes: ['motion', 'light', 'atmosphere'],
  };
  const titles = scenePlans[request.type] || scenePlans.custom;
  const sceneSeconds = Math.floor(request.duration / titles.length);
  const scenes = titles.map(([title, description], index) => ({
    title,
    description: `${description} Direction: ${request.input}`,
    durationSeconds: index === titles.length - 1 ? request.duration - sceneSeconds * (titles.length - 1) : sceneSeconds,
    audioCue: index === 0 ? 'Opening cue' : index === titles.length - 1 ? 'Resolve and fade' : 'Transition cue',
  }));
  const title = request.input.split(/[.!?\n]/)[0].trim().split(/\s+/).slice(0, 7).join(' ').replace(/[,;:]$/, '');
  return {
    provider: 'demo',
    type: request.type,
    title: title || `${typeLabels[request.type]} treatment`,
    subtitle: `${typeLabels[request.type]} · ${request.duration}s · ${request.format}`,
    treatment: `A ${request.duration}-second ${typeLabels[request.type].toLowerCase()} based on your brief: ${request.input}`,
    visualStyle: request.visualStyle || 'A coherent visual language guided by the selected idea and audience.',
    audioDirection: request.sound.music ? `${analysis.genre}, about ${analysis.tempo} BPM, with ${analysis.instruments.join(', ')}. Original instrumental direction; no copied source audio.` : 'No score requested. Preserve dialogue, natural sound, and intentional quiet.',
    narration: request.sound.narration ? 'Use the local system voice for the user-provided idea and scene beats.' : 'No dialogue or narration requested.',
    captions: request.sound.captions ? 'Add readable, synchronized captions inside platform-safe margins.' : 'Captions are off.',
    narrationScript: request.sound.narration ? `${request.input}. ${scenes.map((scene) => scene.title).join('. ')}.` : '',
    analysis,
    scenes,
    format: request.format,
    duration: request.duration,
    renderingAvailable: true,
  };
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function planWithGroq(request) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
      temperature: 0.82,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are Sonora, an imaginative short-form film producer and story editor. Return only valid JSON. Adapt the plan to the requested content type; do not assume every request is a music video. Create original characters, plots, visuals, music direction, and scripts. A reference URL is inspiration only: never copy its audio, lyrics, melody, characters, or shots. You write production plans; you do not claim to render media.' },
        { role: 'user', content: [
          'Create a fresh, production-ready treatment.',
          `Content type: ${typeLabels[request.type]}`,
          `User idea: ${request.input}`,
          `Visual style: ${request.visualStyle || 'Let the idea guide a coherent style.'}`,
          `Duration: ${request.duration} seconds`,
          `Frame format: ${request.format}`,
          `Original score requested: ${request.sound.music ? 'yes' : 'no'}`,
          `Dialogue or narration requested: ${request.sound.narration ? 'yes' : 'no'}`,
          `Captions requested: ${request.sound.captions ? 'yes' : 'no'}`,
          `Optional YouTube reference for broad inspiration only: ${request.reference || 'none'}`,
          `Return JSON with title, subtitle, treatment, visualStyle, audioDirection, narration, narrationScript, captions, analysis {genre, mood, energy, tempo, instruments, palette, visualThemes}, and exactly 4 scenes. Each scene has title, description, durationSeconds, audioCue. Scene durations must sum to ${request.duration}. Make the story or teaching arc specific, coherent, and emotionally clear. Make narrationScript an original speakable script with no stage directions. For music videos, make music structure and visual cuts feel intentional. For explainers, ensure factual clarity and a memorable takeaway. Preserve character and style continuity. Never imply audio or video rendering has happened.`,
        ].join('\n') },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Creative planner request failed (${response.status}).`);
  const data = await response.json();
  const result = extractJson(data.choices?.[0]?.message?.content || '');
  return { ...result, provider: 'groq', type: request.type, format: request.format, duration: request.duration, renderingAvailable: true };
}

async function handlePlan(request, response) {
  try {
    const body = normalizeRequest(await readJson(request));
    const result = process.env.GROQ_API_KEY ? await planWithGroq(body) : demoResult(body);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, { error: error.message || 'Unable to create this treatment.' });
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function aceHeaders(contentType = false) {
  const headers = {};
  if (contentType) headers['Content-Type'] = 'application/json';
  if (process.env.ACESTEP_API_KEY) headers.Authorization = `Bearer ${process.env.ACESTEP_API_KEY}`;
  return headers;
}

async function fetchAce(pathname, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${aceUrl}${pathname}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkAce() {
  for (const endpoint of ['/health', '/']) {
    try {
      const response = await fetchAce(endpoint, {}, 1800);
      if (response.ok) return true;
    } catch {}
  }
  return false;
}

function publicJob(job) {
  return { id: job.id, status: job.status, phase: job.phase, message: job.message, error: job.error || null, plan: job.plan };
}

function extractAudioFile(resultField) {
  let results = resultField;
  if (typeof results === 'string') {
    try { results = JSON.parse(results); }
    catch { throw new Error('The music model returned an unreadable result.'); }
  }
  if (!Array.isArray(results)) results = [results];
  const item = results.find((entry) => entry?.file) || results[0];
  if (!item?.file) throw new Error(item?.message || 'The music model completed without an audio file.');
  return item.file;
}

function narrationText(job) {
  const planned = String(job.plan?.narrationScript || '').trim();
  const text = planned || `${job.request.input}. ${job.plan?.scenes?.map((scene) => scene.title).join('. ') || ''}.`;
  return text.replace(/\s+/g, ' ').slice(0, 1800);
}

async function makeNarration(job) {
  if (!job.request.sound.narration) return;
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/say') || !existsSync('/usr/bin/afconvert')) {
    throw new Error('Local narration currently requires macOS speech tools; turn off Dialogue / narration to continue.');
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sonora-voice-'));
  const aiff = path.join(directory, 'voice.aiff');
  const wav = path.join(directory, 'voice.wav');
  try {
    await execFileAsync('/usr/bin/say', ['-r', '168', '-o', aiff, narrationText(job)], { timeout: 120_000 });
    await execFileAsync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', aiff, wav], { timeout: 30_000 });
    job.narrationBuffer = await readFile(wav);
    job.narrationType = 'audio/wav';
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function generateMusic(job) {
  const { request, plan } = job;
  const analysis = plan.analysis || {};
  const instruments = Array.isArray(analysis.instruments) ? analysis.instruments.join(', ') : '';
  const prompt = [
    `Create an original ${analysis.genre || 'cinematic'} ${request.type === 'music-video' ? 'song' : 'instrumental soundtrack'}, not a copy of any existing work.`,
    `Creative brief: ${request.input}`,
    `Mood: ${analysis.mood || 'emotionally clear'}; energy: ${analysis.energy || 'building'}; tempo: about ${Number(analysis.tempo) || 105} BPM.`,
    instruments ? `Required audible instruments: ${instruments}. Keep every named instrument clearly present in the arrangement; do not omit the bass, percussion, or harmonic accompaniment.` : 'Use a melodic lead, warm harmonic accompaniment, rounded bass, and a purposeful drum/percussion groove.',
    request.type === 'music-video' ? 'Write a memorable original melody with a clear opening, development, and satisfying ending; no recognizable melody or lyrics.' : 'Instrumental only, no vocals or spoken words; leave clear space for narration.',
    request.visualStyle ? `The feeling should complement this visual direction: ${request.visualStyle}.` : '',
    'Use audible acoustic or organic timbres together with rhythm section and supporting instruments; avoid a bare sine-wave synth demo.',
  ].filter(Boolean).join(' ');
  const submitted = await fetchAce('/release_task', {
    method: 'POST',
    headers: aceHeaders(true),
    body: JSON.stringify({
      prompt,
      lyrics: '',
      task_type: 'text2music',
      // Keep the user-authored caption intact so the DiT can condition on the
      // full instrument arrangement instead of letting the 5Hz LM paraphrase
      // a multi-instrument brief down to one timbre. The LM may still fill
      // missing metadata; the explicit tempo above is preserved.
      thinking: false,
      use_cot_caption: false,
      use_cot_language: false,
      audio_duration: request.duration,
      audio_format: 'wav',
      bpm: Number(analysis.tempo) || 105,
      time_signature: '4',
      model: process.env.ACESTEP_DIT_MODEL || 'acestep-v15-turbo',
      lm_model_path: process.env.ACESTEP_LM_MODEL || 'acestep-5Hz-lm-0.6B',
      lm_backend: 'mlx',
      inference_steps: 8,
      batch_size: 1,
      use_random_seed: true,
    }),
  });
  if (!submitted.ok) throw new Error(`Local music model rejected the request (${submitted.status}).`);
  const taskPayload = await submitted.json();
  const taskId = taskPayload.data?.task_id;
  if (!taskId) throw new Error(taskPayload.error || 'The local music model did not return a task ID.');

  job.status = 'running';
  job.phase = 'music';
  job.message = 'The Mac is composing an original score. The first generation can take several minutes.';
  const started = Date.now();
  // First generation may include a one-time multi-GB model download; allow
  // that initialization to finish rather than timing out the user's job.
  const timeoutMs = Math.max(60 * 60_000, request.duration * 60_000);
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const resultResponse = await fetchAce('/query_result', {
      method: 'POST',
      headers: aceHeaders(true),
      body: JSON.stringify({ task_id_list: [taskId] }),
    });
    if (!resultResponse.ok) throw new Error(`Could not check local music generation (${resultResponse.status}).`);
    const resultPayload = await resultResponse.json();
    const result = resultPayload.data?.[0];
    if (!result) continue;
    if (Number(result.status) === 2) throw new Error(result.error || result.message || 'The local music model could not complete this track.');
    if (Number(result.status) !== 1) {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      job.message = `Music generation is still running on this Mac · ${elapsed}s elapsed.`;
      continue;
    }
    const audioPath = extractAudioFile(result.result);
    const audioUrl = new URL(audioPath, `${aceUrl}/`);
    if (audioUrl.origin !== new URL(aceUrl).origin) throw new Error('The music model returned an unexpected audio host.');
    const audioResponse = await fetch(audioUrl, { headers: aceHeaders() });
    if (!audioResponse.ok) throw new Error(`The music file could not be read (${audioResponse.status}).`);
    job.audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    job.audioType = audioResponse.headers.get('content-type')?.split(';')[0] || 'audio/wav';
    if (!job.audioBuffer.length) throw new Error('The local music model returned an empty audio file.');
    return;
  }
  throw new Error('Music generation timed out. The local service may still be loading its model; try again after its status turns ready.');
}

async function runJob(job) {
  try {
    job.status = 'running';
    job.phase = 'plan';
    job.message = process.env.GROQ_API_KEY ? 'The creative director is shaping the scenes.' : 'The local scene template is being prepared; no text-model key is configured.';
    job.plan = process.env.GROQ_API_KEY ? await planWithGroq(job.request) : demoResult(job.request);
    if (job.request.sound.music) {
      job.phase = 'music';
      job.message = 'Checking the local music model…';
      if (!(await checkAce())) throw new Error('The local ACE-Step music engine is not running yet. Start the Sonora local companion and wait for the model status to turn ready.');
      await generateMusic(job);
    }
    if (job.request.sound.narration) {
      job.phase = 'narration';
      job.message = 'Preparing narration with the built-in Mac voice.';
      await makeNarration(job);
    }
    job.phase = 'ready';
    job.status = 'ready';
    job.message = 'Audio is ready. Sonora can now render your reviewable motion-graphics video.';
  } catch (error) {
    job.status = 'failed';
    job.phase = job.phase || 'failed';
    job.error = error.message || 'The local render could not be completed.';
    job.message = job.error;
  }
}

async function handleCreateJob(request, response) {
  try {
    const data = normalizeRequest(await readJson(request, 20_000));
    const plan = data.sound.music || data.sound.narration ? null : demoResult(data);
    const id = randomUUID();
    const job = {
      id,
      request: data,
      plan,
      status: 'queued',
      phase: 'brief',
      message: 'Your brief is queued for the local production steps.',
      createdAt: Date.now(),
      audioBuffer: null,
      audioType: null,
      narrationBuffer: null,
      narrationType: null,
      error: null,
    };
    jobs.set(id, job);
    for (const [oldId, oldJob] of jobs) if (Date.now() - oldJob.createdAt > 60 * 60_000) jobs.delete(oldId);
    if (jobs.size > maxJobs) jobs.delete(jobs.keys().next().value);
    sendJson(response, 202, publicJob(job));
    runJob(job);
  } catch (error) {
    sendJson(response, 400, { error: error.message || 'Could not start this video.' });
  }
}

async function handleHealth(response) {
  const ready = await checkAce();
  sendJson(response, 200, {
    ready,
    companion: 'Sonora local companion',
    engine: ready ? 'ACE-Step local API reachable' : 'ACE-Step not ready',
    host,
    port,
  });
}

async function sendJobAsset(response, job, kind) {
  const buffer = kind === 'narration' ? job.narrationBuffer : job.audioBuffer;
  const contentType = kind === 'narration' ? job.narrationType : job.audioType;
  if (!buffer) return sendJson(response, 404, { error: 'This audio asset is not available for the job.' });
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(buffer);
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) { response.writeHead(403); return response.end('Origin not allowed'); }
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.headers['access-control-request-private-network'] === 'true') response.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (request.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) { response.writeHead(403); return response.end('Origin not allowed'); }
    response.writeHead(204);
    return response.end();
  }

  const url = new URL(request.url, `http://${host}:${port}`);
  if (request.method === 'GET' && url.pathname === '/api/health') return handleHealth(response);
  if (request.method === 'POST' && url.pathname === '/api/plan') return handlePlan(request, response);
  if (request.method === 'POST' && url.pathname === '/api/jobs') return handleCreateJob(request, response);
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([\da-f-]{36})(?:\/(audio|narration))?$/i);
  if (jobMatch && request.method === 'GET') {
    const [, id, asset] = jobMatch;
    const job = jobs.get(id);
    if (!job) return sendJson(response, 404, { error: 'This render job was not found or has expired.' });
    if (asset) return sendJobAsset(response, job, asset);
    return sendJson(response, 200, publicJob(job));
  }
  if (request.method !== 'GET') { response.writeHead(405); return response.end('Method Not Allowed'); }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) { response.writeHead(403); return response.end('Forbidden'); }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404); response.end('Not Found'); }
});

server.listen(port, host, () => {
  console.log(`Sonora local companion listening at http://${host}:${port}`);
  if (process.env.ACESTEP_AUTOSTART !== 'false') {
    const modelRoot = path.join(root, '.sonora-runtime', 'ACE-Step-1.5');
    const uv = path.join(root, '.sonora-runtime', 'bin', 'uv');
    if (process.platform === 'darwin' && existsSync(path.join(modelRoot, 'pyproject.toml')) && existsSync(uv)) {
      const child = spawn(uv, ['run', 'acestep-api'], {
        cwd: modelRoot,
        env: {
          ...process.env,
          ACESTEP_API_HOST: host,
          ACESTEP_API_PORT: '8001',
          ACESTEP_CONFIG_PATH: 'acestep-v15-turbo',
          ACESTEP_LM_MODEL_PATH: 'acestep-5Hz-lm-0.6B',
          ACESTEP_LM_BACKEND: 'mlx',
          ACESTEP_INIT_LLM: 'auto',
          HF_HOME: path.join(root, '.sonora-runtime', 'huggingface'),
          HUGGINGFACE_HUB_CACHE: path.join(root, '.sonora-runtime', 'huggingface', 'hub'),
          UV_SYSTEM_CERTS: 'true',
          PYTHONUNBUFFERED: '1',
        },
        stdio: 'inherit',
      });
      child.on('error', (error) => console.error(`Could not start the local music model: ${error.message}`));
      const stop = () => {
        child.kill('SIGINT');
        server.close(() => process.exit(0));
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    } else {
      console.log('ACE-Step is not installed yet. Run: npm run setup:local-ai');
    }
  }
});
