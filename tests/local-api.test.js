import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';

const sampleAudio = Buffer.from('RIFF Sonora mock audio bytes');
let aceServer;
let sonoraProcess;
let sonoraPort;
let acePort;
let aceRequests = [];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForSonora() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${sonoraPort}/api/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Sonora test server did not start.');
}

before(async () => {
  aceRequests = [];
  aceServer = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"data":{"status":"ok"}}'); return;
    }
    if (request.method === 'POST' && request.url === '/release_task') {
      let body = ''; for await (const chunk of request) body += chunk;
      aceRequests.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"data":{"task_id":"test-task"}}'); return;
    }
    if (request.method === 'POST' && request.url === '/query_result') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ status: 1, result: JSON.stringify([{ file: '/v1/audio?path=%2Ftest.mp3' }]) }] })); return;
    }
    if (request.method === 'GET' && request.url.startsWith('/v1/audio')) {
      response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': String(sampleAudio.length) }); response.end(sampleAudio); return;
    }
    response.writeHead(404); response.end('not found');
  });
  acePort = await listen(aceServer);
  const reservation = http.createServer();
  sonoraPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  sonoraProcess = spawn(process.execPath, ['server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(sonoraPort), ACE_STEP_URL: `http://127.0.0.1:${acePort}`, ACESTEP_AUTOSTART: 'false' },
    stdio: 'ignore',
  });
  await waitForSonora();
});

after(async () => {
  if (sonoraProcess && !sonoraProcess.killed) { sonoraProcess.kill('SIGTERM'); await delay(100); }
  if (aceServer) await new Promise((resolve) => aceServer.close(resolve));
});

test('local companion advertises a reachable ACE-Step engine', async () => {
  const response = await fetch(`http://127.0.0.1:${sonoraPort}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ready, true);
});

test('Pages preflight is narrowly allowed, including private-network access', async () => {
  const response = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://dhairya1611.github.io',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
      'Access-Control-Request-Private-Network': 'true',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://dhairya1611.github.io');
  assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
});

test('unapproved web origins are rejected', async () => {
  const response = await fetch(`http://127.0.0.1:${sonoraPort}/api/health`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
});

test('a creative brief produces a model job and returns the actual audio bytes', async () => {
  const origin = 'https://dhairya1611.github.io';
  const create = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: 'Warm acoustic guitar and brushed drums at sunset, about 96 BPM', type: 'music-video', duration: 15, format: 'short', sound: { music: true, narration: false, captions: true } }),
  });
  assert.equal(create.status, 202);
  const started = await create.json();
  const deadline = Date.now() + 5000;
  let finished;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs/${started.id}`, { headers: { Origin: origin } });
    finished = await statusResponse.json();
    if (finished.status === 'ready' || finished.status === 'failed') break;
    await delay(100);
  }
  assert.equal(finished.status, 'ready', finished.error || finished.message);
  assert.equal(finished.plan.provider, 'demo');
  assert.equal(aceRequests.length, 1);
  assert.match(aceRequests[0].prompt, /acoustic guitar/i);
  assert.match(aceRequests[0].prompt, /do not omit the bass/i);
  assert.equal(aceRequests[0].audio_duration, 15);
  assert.equal(aceRequests[0].bpm, 96);
  assert.equal(aceRequests[0].thinking, false);
  assert.equal(aceRequests[0].use_cot_caption, false);
  assert.equal(aceRequests[0].use_cot_language, false);
  assert.equal(aceRequests[0].audio_format, 'wav');
  assert.equal(aceRequests[0].use_random_seed, true);
  const audioResponse = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs/${started.id}/audio`, { headers: { Origin: origin } });
  assert.equal(audioResponse.status, 200);
  assert.equal(audioResponse.headers.get('content-type'), 'audio/wav');
  assert.deepEqual(Buffer.from(await audioResponse.arrayBuffer()), sampleAudio);
});

test('story, animation, explainer, and custom briefs share the real soundtrack job path', async () => {
  const origin = 'https://dhairya1611.github.io';
  const modes = [
    ['story', 'A lost kite leads two friends home'],
    ['animated-short', 'A tiny moon fox lights the winter forest'],
    ['explainer', 'Show how rooftop solar power reaches a home'],
    ['custom', 'A quiet travel postcard about Mumbai at dawn'],
  ];

  for (const [type, input] of modes) {
    const create = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, type, duration: 15, format: 'short', sound: { music: true, narration: false, captions: true } }),
    });
    assert.equal(create.status, 202, `${type} job should be accepted`);
    const started = await create.json();
    const deadline = Date.now() + 5000;
    let finished;
    while (Date.now() < deadline) {
      const statusResponse = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs/${started.id}`, { headers: { Origin: origin } });
      finished = await statusResponse.json();
      if (finished.status === 'ready' || finished.status === 'failed') break;
      await delay(100);
    }
    assert.equal(finished.status, 'ready', `${type}: ${finished.error || finished.message}`);
    assert.equal(finished.plan.type, type);
    assert.equal(finished.plan.scenes.length, 4);
    assert.equal(finished.plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 15);
    assert.match(aceRequests.at(-1).prompt, new RegExp(input.split(' ')[0], 'i'));
    const audioResponse = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs/${started.id}/audio`, { headers: { Origin: origin } });
    assert.deepEqual(Buffer.from(await audioResponse.arrayBuffer()), sampleAudio);
  }
  assert.equal(aceRequests.length, 5);
});

test('empty brief fails before a model call', async () => {
  const response = await fetch(`http://127.0.0.1:${sonoraPort}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: '   ' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /describe what you want/i);
});
