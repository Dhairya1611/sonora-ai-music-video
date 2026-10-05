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
  let audioContext;
  try {
    // Create the audio context directly from the button gesture. This lets the
    // browser authorize the generated music for the MediaRecorder stream.
    audioContext = createMusicContext();
    setBuildPhase('Phase 1/5 · Input received', 'checking your direction');
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
    setBuildPhase('Phase 4/5 · Rendering preview', 'composing original music + visuals');
    state.videoBlob = await canvasVideo($('preview-title').textContent, state.format, input, audioContext);
    state.generated = true;
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
    if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
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

function createMusicContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser cannot synthesize the music preview.');
  return new AudioContextClass();
}

function scheduleTone(context, output, frequency, when, duration, volume, type = 'sine') {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(volume, when + Math.min(0.035, duration / 3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(envelope);
  envelope.connect(output);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.05);
}

function scheduleNoise(context, output, when, duration, volume, highpass = 0) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  const envelope = context.createGain();
  source.buffer = buffer;
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(volume, when + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  if (highpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    source.connect(filter);
    filter.connect(envelope);
  } else source.connect(envelope);
  envelope.connect(output);
  source.start(when);
  source.stop(when + duration + 0.02);
}

function scheduleMusic(context, destination, input) {
  const direction = input.toLowerCase();
  const dreamy = direction.includes('dream') || direction.includes('ambient') || direction.includes('soft');
  const tempo = dreamy ? 92 : 112;
  const beat = 60 / tempo;
  const step = beat / 2;
  const start = context.currentTime + 0.08;
  const length = 6;
  const steps = Math.ceil(length / step);
  const roots = dreamy ? [220, 174.61, 196, 146.83] : [220, 261.63, 293.66, 196];
  const lead = dreamy ? [440, 523.25, 659.25, 587.33, 523.25, 440] : [440, 523.25, 587.33, 659.25, 783.99, 659.25];
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  compressor.connect(destination);

  for (let index = 0; index < steps; index += 1) {
    const when = start + index * step;
    const bar = Math.floor(index / 8);
    const root = roots[bar % roots.length];
    if (index % 2 === 0) {
      scheduleTone(context, compressor, root / 2, when, beat * 0.42, dreamy ? 0.075 : 0.095, 'sine');
      scheduleTone(context, compressor, root, when, beat * 0.24, dreamy ? 0.035 : 0.045, 'triangle');
    }
    if (index % 4 === 0) {
      scheduleTone(context, compressor, 72, when, 0.16, 0.25, 'sine');
      scheduleTone(context, compressor, root * 2, when + step * 0.03, beat * 0.8, 0.022, 'sawtooth');
    }
    if (index % 8 === 4) scheduleNoise(context, compressor, when, 0.15, 0.075, 900);
    scheduleNoise(context, compressor, when + step * 0.15, 0.045, 0.018, 4200);
    if (index % 2 === 0) scheduleTone(context, compressor, lead[(index / 2) % lead.length], when, beat * 0.33, dreamy ? 0.045 : 0.055, 'triangle');
  }
}

function canvasVideo(title, format, input, audioContext) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = format === 'short' ? 720 : 1280;
    canvas.height = format === 'short' ? 1280 : 720;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mime) return reject(new Error('This browser cannot render a demo video.'));
    if (!audioContext) return reject(new Error('Music synthesis is unavailable for this preview.'));
    const audioDestination = audioContext.createMediaStreamDestination();
    const audioTracks = audioDestination.stream.getAudioTracks();
    if (!audioTracks.length) return reject(new Error('The browser could not create an audio track.'));
    const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioTracks]);
    const recorder = new MediaRecorder(combinedStream, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onerror = () => reject(new Error('Video rendering failed.'));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      combinedStream.getTracks().forEach((track) => track.stop());
      audioContext.close().catch(() => {});
      resolve(new Blob(chunks, { type: mime }));
    };
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
    const begin = () => {
      if (audioContext.state !== 'running') {
        stream.getTracks().forEach((track) => track.stop());
        combinedStream.getTracks().forEach((track) => track.stop());
        audioContext.close().catch(() => {});
        reject(new Error('The browser blocked music playback. Click Build again to authorize the audio preview.'));
        return;
      }
      scheduleMusic(audioContext, audioDestination, input);
      recorder.start();
      requestAnimationFrame(draw);
    };
    if (audioContext.state === 'suspended') audioContext.resume().then(begin).catch(() => reject(new Error('The browser blocked music playback. Click Build again to authorize the audio preview.')));
    else begin();
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
    const blob = state.videoBlob;
    if (!blob) throw new Error('Build the music preview before uploading.');
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
