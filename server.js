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
  return {
    provider: 'demo',
    title: input.toLowerCase().includes('dream') ? 'A softer kind of blue' : 'Neon after rain',
    subtitle: 'A cinematic study in motion & light',
    analysis: { mood: 'cinematic', energy: 'building', palette: ['violet', 'warm amber', 'midnight blue'], visualThemes: ['rain', 'city reflections', 'slow motion'] },
    scenes: demoScenes,
    format,
  };
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function analyzeWithGroq(input, format) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a music-video creative director. Return only valid JSON. Create original concepts inspired by broad musical qualities, never copy a referenced video.' },
        { role: 'user', content: `Create an original visual treatment for this music direction or reference: ${input}\nOutput format: ${format === 'short' ? 'vertical 9:16 YouTube Short' : 'landscape 16:9 music video'}. Return JSON with title, subtitle, analysis {mood, energy, palette, visualThemes}, and scenes (exactly 4 objects with title and description).` },
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
    const format = body.format === 'wide' ? 'wide' : 'short';
    const result = process.env.GROQ_API_KEY ? await analyzeWithGroq(input, format) : demoResult(input, format);
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
