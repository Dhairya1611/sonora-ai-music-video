const state = { mode: 'reference', format: 'short', connected: false, generated: false, accessToken: null, channelTitle: '', videoBlob: null, previewUrl: '' };
const YOUTUBE_CLIENT_ID = '442084033193-giinlub1bcoh39r5v2ior5nr2aq7oe1r.apps.googleusercontent.com';
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
let tokenClient;

const scenes = {
  default: [
    ['01', 'The first spark', 'A wide, quiet opening. Light catches the city just before the beat arrives.'],
    ['02', 'Velocity / violet', 'The camera begins to move; reflections stretch into liquid color.'],
    ['03', 'Find the pulse', 'Close, tactile fragments cut on the rhythm—hands, rain, glass, neon.'],
    ['04', 'Leave a trace', 'The world slows down and leaves one glowing frame hanging in the air.'],
  ],
  dreamy: [
    ['01', 'Soft focus', 'A warm horizon breathes through a haze of blue and lilac.'],
    ['02', 'Weightless', 'Slow camera drift through clouds, water and half-remembered places.'],
    ['03', 'The quiet note', 'A single figure moves through a field of floating light.'],
    ['04', 'Morning, almost', 'The image fades into a pale afterglow as the last note lands.'],
  ],
};

const $ = (id) => document.getElementById(id);

function renderScenes(kind = 'default') {
  $('scene-list').innerHTML = scenes[kind].map(([num, title, body]) => `<article class="scene"><span class="scene-number">${num} / 04</span><strong>${title}</strong><p>${body}</p></article>`).join('');
}

document.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
  state.mode = button.dataset.mode;
  document.querySelectorAll('.mode').forEach((item) => item.classList.toggle('active', item === button));
  $('reference-input').classList.toggle('hidden', state.mode !== 'reference');
  $('brief-input').classList.toggle('hidden', state.mode !== 'brief');
}));

document.querySelectorAll('.quick-tags button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.quick-tags button').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  if (button.dataset.tag === 'dreamy') renderScenes('dreamy'); else renderScenes('default');
}));

$('format-toggle').addEventListener('click', () => {
  state.format = state.format === 'short' ? 'wide' : 'short';
  $('format-label').textContent = state.format === 'short' ? 'YouTube Short · 9:16' : 'Music video · 16:9';
  $('format-toggle').innerHTML = state.format === 'short' ? 'Switch to 16:9 <span>→</span>' : 'Switch to 9:16 <span>→</span>';
});

function demoAnalysis(input) {
  const dreamy = input.toLowerCase().includes('dream');
  return { provider: 'demo', title: dreamy ? 'A softer kind of blue' : 'Neon after rain', subtitle: dreamy ? 'An ambient visual study in slow motion' : 'A cinematic study in motion & light', scenes: (dreamy ? scenes.dreamy : scenes.default).map(([, title, description]) => ({ title, description })) };
}

function setBuildPhase(label, detail = '') {
  $('build-status').textContent = detail ? `${label} · ${detail}` : label;
}

function pause(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForGoogle() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) return resolve(window.google);
      if (Date.now() - started > 8000) return reject(new Error('Google sign-in could not load. Check your connection and try again.'));
      window.setTimeout(check, 100);
    };
    check();
  });
}

async function connectYouTube() {
  $('connect-button').textContent = 'Loading Google sign-in…';
  $('connect-button').disabled = true;
  const google = await waitForGoogle();
  tokenClient ||= google.accounts.oauth2.initTokenClient({
    client_id: YOUTUBE_CLIENT_ID,
    scope: YOUTUBE_SCOPE,
    callback: async (response) => {
      try {
        if (response.error) throw new Error(response.error_description || response.error);
        state.accessToken = response.access_token;
        const channelResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${state.accessToken}` } });
        const channelData = await channelResponse.json();
        if (!channelResponse.ok || !channelData.items?.length) throw new Error(channelData.error?.message || 'No YouTube channel was found for this Google account.');
        state.channelTitle = channelData.items[0].snippet.title;
        state.connected = true;
        $('connect-button').innerHTML = `YouTube: ${state.channelTitle} <span>✓</span>`;
        $('connect-button').style.color = 'var(--accent)';
        $('publish-button').disabled = !state.generated;
        $('publish-button').textContent = state.generated ? 'Upload private draft ↗' : 'Build a draft first';
      } catch (error) {
        $('connect-button').disabled = false;
        $('connect-button').textContent = 'Connect YouTube ↗';
        $('connect-button').title = error.message;
        $('draft-pill').textContent = 'AUTH NEEDED';
      }
    },
  });
  tokenClient.requestAccessToken({ prompt: 'select_account consent' });
}

async function requestAnalysis(input) {
  // GitHub Pages is static hosting, so never call the missing server route there.
  if (window.location.hostname.endsWith('github.io')) return demoAnalysis(input);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, format: state.format }) });
    if (!response.ok) return demoAnalysis(input);
    let result;
    try {
      result = await response.json();
    } catch {
      // GitHub Pages returns an HTML 404 for /api/analyze. Treat that as the
      // expected public-demo case instead of surfacing a JSON parse error.
      throw new TypeError('Demo Mode endpoint unavailable');
    }
    if (!response.ok) throw new Error(result.error || 'Analysis failed');
    return result;
  } catch (error) {
    // GitHub Pages has no server runtime. Keep the public demo usable there;
    // the local/server deployment uses the Groq-backed endpoint above.
    if (error instanceof TypeError || /Failed to fetch/i.test(error.message)) {
      return demoAnalysis(input);
    }
    console.warn('Sonora analysis unavailable; using Demo Mode.', error);
    return demoAnalysis(input);
  }
}

$('generate-button').addEventListener('click', async () => {
  const button = $('generate-button');
  const original = button.innerHTML;
  const input = state.mode === 'reference' ? $('source-input').value.trim() : $('brief-text').value.trim();
  if (!input) {
    const field = state.mode === 'reference' ? $('source-input') : $('brief-text');
    field.focus();
    $('draft-pill').textContent = 'ADD A DIRECTION';
    $('draft-pill').title = state.mode === 'reference' ? 'Paste a YouTube music video URL first.' : 'Describe the music video you want first.';
    setBuildPhase('Waiting for input', state.mode === 'reference' ? 'paste a YouTube URL' : 'describe the music');
    return;
  }
  button.disabled = true;
  button.innerHTML = '<span class="button-icon">◌</span> Building your visual world…';
  setBuildPhase('Phase 1/5 · Input received', 'checking your direction');
  try {
    await pause(350);
    setBuildPhase('Phase 2/5 · Analyzing', state.mode === 'reference' ? 'reading the public reference' : 'mapping mood and intent');
    const result = await requestAnalysis(input);
    await pause(650);
    setBuildPhase('Phase 3/5 · Storyboarding', 'arranging four visual scenes');
    await pause(650);
    $('preview-title').textContent = result.title || 'Neon after rain';
    $('preview-subtitle').textContent = result.subtitle || 'A cinematic study in motion & light';
    $('draft-pill').textContent = 'DRAFT 02';
    if (Array.isArray(result.scenes) && result.scenes.length) $('scene-list').innerHTML = result.scenes.map((scene, index) => `<article class="scene"><span class="scene-number">0${index + 1} / 04</span><strong>${scene.title}</strong><p>${scene.description}</p></article>`).join('');
    state.generated = true;
    setBuildPhase('Phase 4/5 · Rendering preview', 'preparing the visual direction');
    state.videoBlob = await canvasVideo($('preview-title').textContent, state.format);
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(state.videoBlob);
    $('preview-video').src = state.previewUrl;
    $('preview-video').classList.add('ready');
    $('visual-preview').classList.add('has-video');
    if (state.connected) $('publish-button').disabled = false;
    $('publish-button').textContent = state.connected ? 'Upload private draft ↗' : 'Connect YouTube to upload';
    await pause(700);
    setBuildPhase('Phase 5/5 · Ready', 'review your visual world below');
  } catch (error) {
    $('draft-pill').textContent = 'DEMO MODE';
    $('draft-pill').title = error.message;
    setBuildPhase('Build stopped', error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});

$('connect-button').addEventListener('click', () => {
  connectYouTube().catch((error) => {
    $('connect-button').disabled = false;
    $('connect-button').textContent = 'Google sign-in unavailable ↻';
    $('connect-button').title = error.message;
    $('draft-pill').textContent = 'AUTH NEEDED';
  });
});

function canvasVideo(title, format) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = format === 'short' ? 720 : 1280;
    canvas.height = format === 'short' ? 1280 : 720;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mime) return reject(new Error('This browser cannot render a demo video.'));
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onerror = () => reject(new Error('Video rendering failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    const started = performance.now();
    const draw = (now) => {
      const progress = Math.min((now - started) / 6000, 1);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#17174b'); gradient.addColorStop(.48, '#6c3f88'); gradient.addColorStop(1, '#f0a16e');
      context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = .22; context.fillStyle = '#d9f55a';
      context.beginPath(); context.arc(canvas.width * (.73 - progress * .12), canvas.height * .28, canvas.width * .12, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1; context.fillStyle = '#f5f1e8'; context.textAlign = 'center';
      context.font = `700 ${Math.round(canvas.width / 14)}px Manrope, sans-serif`; context.fillText(title, canvas.width / 2, canvas.height * .72);
      context.font = `400 ${Math.round(canvas.width / 42)}px DM Mono, monospace`; context.fillStyle = '#d9f55a'; context.fillText('SONORA / ORIGINAL VISUAL STUDY', canvas.width / 2, canvas.height * .78);
      if (progress < 1) requestAnimationFrame(draw); else recorder.stop();
    };
    recorder.start(); requestAnimationFrame(draw);
  });
}

async function uploadToYouTube(blob) {
  const metadata = { snippet: { title: $('preview-title').textContent, description: 'Original visual study created with Sonora AI. Generated from an original creative direction.', categoryId: '10' }, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } };
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type, 'X-Upload-Content-Length': String(blob.size) }, body: JSON.stringify(metadata) });
  if (!init.ok) { const error = await init.json().catch(() => ({})); throw new Error(error.error?.message || `YouTube upload could not start (${init.status}).`); }
  const location = init.headers.get('Location');
  if (!location) throw new Error('YouTube did not return an upload URL.');
  const upload = await fetch(location, { method: 'PUT', headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': blob.type }, body: blob });
  const result = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(result.error?.message || `YouTube upload failed (${upload.status}).`);
  return result;
}

$('publish-button').addEventListener('click', async () => {
  if (!state.connected || !state.generated) return;
  const button = $('publish-button');
  button.disabled = true; button.textContent = 'Rendering private draft…'; $('draft-pill').textContent = 'RENDERING';
  try {
    const blob = state.videoBlob || await canvasVideo($('preview-title').textContent, state.format);
    button.textContent = 'Uploading to YouTube…'; $('draft-pill').textContent = 'UPLOADING';
    const result = await uploadToYouTube(blob);
    const videoId = result.id;
    $('draft-pill').textContent = 'UPLOADED PRIVATE';
    button.textContent = 'Open private upload ↗'; button.disabled = false;
    button.onclick = () => window.open(`https://youtu.be/${videoId}`, '_blank', 'noopener');
  } catch (error) {
    $('draft-pill').textContent = 'UPLOAD FAILED'; $('draft-pill').title = error.message; button.textContent = 'Retry private upload ↗'; button.disabled = false;
  }
});

$('play-button').addEventListener('click', (event) => {
  event.currentTarget.textContent = event.currentTarget.textContent === '▶' ? 'Ⅱ' : '▶';
});

renderScenes();
