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

const demoScenes = [
  { title: 'The first spark', description: 'A wide, quiet opening. Light catches the city just before the beat arrives.' },
  { title: 'Velocity / violet', description: 'The camera begins to move; reflections stretch into liquid color.' },
  { title: 'Find the pulse', description: 'Close, tactile fragments cut on the rhythm—hands, rain, glass, neon.' },
  { title: 'Leave a trace', description: 'The world slows down and leaves one glowing frame hanging in the air.' },
];

function demoResult(input, format) {
  const direction = input.toLowerCase();
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
  return {
    provider: 'demo',
    title: dreamy ? 'A softer kind of blue' : acoustic ? 'Woodsmoke in the headlights' : energetic ? 'Voltage after dark' : 'Neon after rain',
    subtitle: 'A cinematic study in motion & light',
    analysis,
    scenes: demoScenes,
    format,
  };
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function analyzeWithGroq(input, format, reference = '') {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a music-video creative director. Return only valid JSON. Create original concepts inspired by broad musical qualities, never copy a referenced video.' },
        { role: 'user', content: `Create an original music and visual treatment. Primary music brief: ${input}\nOptional reference URL for broad inspiration only: ${reference || 'none'}. Never copy the reference audio, lyrics, melody, or shots. Output format: ${format === 'short' ? 'vertical 9:16 YouTube Short' : 'landscape 16:9 music video'}. Return JSON with title, subtitle, analysis {genre, mood, energy, tempo, instruments, palette, visualThemes}, and scenes (exactly 4 objects with title and description). Choose tempo as an integer BPM from 70 to 150 and instruments as an array of 3 to 5 concrete instruments or production elements.` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq request failed (${response.status})`);
  const data = await response.json();
  return { ...extractJson(data.choices?.[0]?.message?.content || ''), provider: 'groq', format };
}

async function handleAnalyze(request, response) {
  try {
    const body = await new Promise((resolve, reject) => {
      let raw = '';
      request.on('data', (chunk) => { raw += chunk; if (raw.length > 100_000) reject(new Error('Request too large')); });
      request.on('end', () => resolve(JSON.parse(raw || '{}')));
      request.on('error', reject);
    });
    const input = String(body.input || '').trim();
    if (!input) throw new Error('Add a reference URL or creative brief first.');
    const reference = String(body.reference || '').trim();
    const format = body.format === 'wide' ? 'wide' : 'short';
    const result = process.env.GROQ_API_KEY ? await analyzeWithGroq(input, format, reference) : demoResult(input, format);
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error.message || 'Unable to analyze this direction.' }));
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/analyze') return handleAnalyze(request, response);
  if (request.method !== 'GET') { response.writeHead(405); return response.end('Method Not Allowed'); }
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) { response.writeHead(403); return response.end('Forbidden'); }
  try { response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' }); response.end(await readFile(filePath)); }
  catch { response.writeHead(404); response.end('Not Found'); }
});

server.listen(port, () => console.log(`Sonora running at http://localhost:${port}`));
