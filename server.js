import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);

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

function demoResult(request) {
  const direction = `${request.input} ${request.visualStyle}`.toLowerCase();
  const dreamy = /dream|ambient|soft|ethereal|calm|lo-fi/.test(direction);
  const energetic = /dance|edm|house|techno|upbeat|energetic|club|trap|hip.?hop/.test(direction);
  const acoustic = /acoustic|guitar|piano|folk|organic|indie|jazz|strings/.test(direction);
  const analysis = {
    genre: energetic ? 'electronic' : acoustic ? 'acoustic indie' : dreamy ? 'ambient pop' : 'cinematic pop',
    mood: dreamy ? 'dreamy' : energetic ? 'driving' : acoustic ? 'warm' : 'cinematic',
    energy: energetic ? 'high' : dreamy ? 'low' : 'building',
    tempo: energetic ? 122 : dreamy ? 82 : acoustic ? 96 : 108,
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
  const audioDirection = request.sound.music
    ? request.type === 'music-video'
      ? `${analysis.genre}, about ${analysis.tempo} BPM, with ${analysis.instruments.join(', ')}. Direction for an original melody and arrangement; no track has been rendered.`
      : `An original ${analysis.mood} underscore with ${analysis.instruments.slice(0, 3).join(', ')}; leave space for speech and natural sound. No track has been rendered.`
    : 'No score requested. Preserve dialogue, natural sound, and intentional quiet.';
  return {
    provider: 'demo',
    type: request.type,
    title: title || `${typeLabels[request.type]} treatment`,
    subtitle: `${typeLabels[request.type]} · ${request.duration}s · ${request.format}`,
    treatment: `A ${request.duration}-second ${typeLabels[request.type].toLowerCase()} based on your brief: ${request.input}`,
    visualStyle: request.visualStyle || 'A coherent visual language guided by the selected idea and audience.',
    audioDirection,
    narration: request.sound.narration ? 'Plan original dialogue or narration, mixed clearly above the score.' : 'No dialogue or narration requested.',
    captions: request.sound.captions ? 'Add readable, synchronized captions inside platform-safe margins.' : 'Captions are off.',
    analysis,
    scenes,
    format: request.format,
    duration: request.duration,
    renderingAvailable: false,
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
          `Return JSON with title, subtitle, treatment, visualStyle, audioDirection, narration, captions, analysis {genre, mood, energy, tempo, instruments, palette, visualThemes}, and exactly 4 scenes. Each scene has title, description, durationSeconds, audioCue. Scene durations must sum to ${request.duration}. Make the story or teaching arc specific, coherent, and emotionally clear. For music videos, make music structure and visual cuts feel intentional. For explainers, ensure factual clarity and a memorable takeaway. Preserve character and style continuity. Never imply audio or video rendering has happened.`,
        ].join('\n') },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Creative planner request failed (${response.status}).`);
  const data = await response.json();
  return { ...extractJson(data.choices?.[0]?.message?.content || ''), provider: 'groq', type: request.type, format: request.format, duration: request.duration, renderingAvailable: false };
}

async function handlePlan(request, response) {
  try {
    const body = await new Promise((resolve, reject) => {
      let raw = '';
      request.on('data', (chunk) => { raw += chunk; if (raw.length > 100_000) reject(new Error('Request too large')); });
      request.on('end', () => resolve(JSON.parse(raw || '{}')));
      request.on('error', reject);
    });
    const input = String(body.input || '').trim().slice(0, 1800);
    if (!input) throw new Error('Describe what you want Sonora to create first.');
    const type = Object.hasOwn(typeLabels, body.type) ? body.type : 'music-video';
    const format = ['short', 'wide', 'square'].includes(body.format) ? body.format : 'short';
    const duration = [15, 30, 60, 90].includes(Number(body.duration)) ? Number(body.duration) : 30;
    const requestData = {
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
    const result = process.env.GROQ_API_KEY ? await planWithGroq(requestData) : demoResult(requestData);
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error.message || 'Unable to create this treatment.' }));
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && ['/api/plan', '/api/analyze'].includes(request.url)) return handlePlan(request, response);
  if (request.method !== 'GET') { response.writeHead(405); return response.end('Method Not Allowed'); }
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) { response.writeHead(403); return response.end('Forbidden'); }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  }
  catch { response.writeHead(404); response.end('Not Found'); }
});

server.listen(port, () => console.log(`Sonora running at http://localhost:${port}`));
