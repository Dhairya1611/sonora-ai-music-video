const state = { mode: 'brief', format: 'short', connected: false, generated: false, accessToken: null, channelTitle: '', videoBlob: null, previewUrl: '' };
const PREVIEW_SECONDS = 10;
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

function inferMusicAnalysis(input) {
  const direction = input.toLowerCase();
  const dreamy = /dream|ambient|soft|ethereal|calm|lo-fi/.test(direction);
  const energetic = /dance|edm|house|techno|upbeat|energetic|club|trap|hip.?hop/.test(direction);
  const acoustic = /acoustic|guitar|piano|folk|organic|indie|jazz|strings/.test(direction);
  const genre = energetic ? 'electronic' : acoustic ? 'acoustic indie' : dreamy ? 'ambient pop' : 'cinematic pop';
  const instruments = acoustic ? ['fingerpicked acoustic guitar', 'warm piano', 'brush drums', 'round bass'] : energetic ? ['analog synth bass', 'bright pluck', 'four-on-the-floor kick', 'claps and hi-hats'] : ['felt piano', 'soft strings', 'sub bass', 'textured drums'];
  const tempo = energetic ? 122 : dreamy ? 82 : acoustic ? 96 : 108;
  return { genre, mood: dreamy ? 'dreamy' : energetic ? 'driving' : acoustic ? 'warm' : 'cinematic', energy: energetic ? 'high' : dreamy ? 'low' : 'building', tempo, instruments, palette: ['violet', 'warm amber', 'midnight blue'], visualThemes: ['motion', 'light', 'atmosphere'] };
}

function demoAnalysis(input) {
  const analysis = inferMusicAnalysis(input);
  const dreamy = analysis.mood === 'dreamy';
  const title = dreamy ? 'A softer kind of blue' : analysis.mood === 'warm' ? 'Woodsmoke in the headlights' : analysis.energy === 'high' ? 'Voltage after dark' : 'Neon after rain';
  return { provider: 'demo', title, subtitle: `${analysis.genre} · ${analysis.tempo} BPM · ${analysis.instruments.slice(0, 2).join(' + ')}`, analysis, scenes: (dreamy ? scenes.dreamy : scenes.default).map(([, title, description]) => ({ title, description })) };
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

async function requestAnalysis(input, reference = '') {
  // GitHub Pages is static hosting, so never call the missing server route there.
  if (window.location.hostname.endsWith('github.io')) return demoAnalysis(input);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, reference, format: state.format }) });
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
  const brief = $('brief-text').value.trim();
  const reference = $('source-input').value.trim();
  const input = [brief, reference ? `Optional reference: ${reference}` : ''].filter(Boolean).join('\n');
  if (!input) {
    $('brief-text').focus();
    $('draft-pill').textContent = 'ADD A DIRECTION';
    $('draft-pill').title = 'Describe the music you want first.';
    setBuildPhase('Waiting for input', 'describe the music');
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
    setBuildPhase('Phase 2/5 · Analyzing', reference ? 'mapping your brief + reference inspiration' : 'mapping genre, mood, tempo and instruments');
    const result = await requestAnalysis(input, reference);
    await pause(650);
    setBuildPhase('Phase 3/5 · Storyboarding', 'arranging four visual scenes');
    await pause(650);
    $('preview-title').textContent = result.title || 'Neon after rain';
    $('preview-subtitle').textContent = result.subtitle || 'A cinematic study in motion & light';
    $('draft-pill').textContent = 'DRAFT 02';
    if (Array.isArray(result.scenes) && result.scenes.length) $('scene-list').innerHTML = result.scenes.map((scene, index) => `<article class="scene"><span class="scene-number">0${index + 1} / 04</span><strong>${scene.title}</strong><p>${scene.description}</p></article>`).join('');
    setBuildPhase('Phase 4/5 · Rendering preview', 'composing original music + visuals');
    state.videoBlob = await canvasVideo($('preview-title').textContent, state.format, input, audioContext, result.analysis || {});
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

function scheduleTone(context, output, frequency, when, duration, volume, type = 'sine', wetOutput = null, pan = 0) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const panner = context.createStereoPanner();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(volume, when + Math.min(0.035, duration / 3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(envelope);
  envelope.connect(panner);
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), when);
  panner.connect(output);
  if (wetOutput) panner.connect(wetOutput);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.05);
}

function scheduleNoise(context, output, when, duration, volume, highpass = 0, wetOutput = null, pan = 0) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  const envelope = context.createGain();
  const panner = context.createStereoPanner();
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
  envelope.connect(panner);
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), when);
  panner.connect(output);
  if (wetOutput) panner.connect(wetOutput);
  source.start(when);
  source.stop(when + duration + 0.02);
}

function schedulePluck(context, output, wetOutput, frequency, when, duration, volume, pan) {
  const oscillator = context.createOscillator();
  const harmonic = context.createOscillator();
  const harmonicGain = context.createGain();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const panner = context.createStereoPanner();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, when);
  harmonic.type = 'sine';
  harmonic.frequency.setValueAtTime(frequency * 2.01, when);
  harmonicGain.gain.value = 0.24;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, when);
  filter.frequency.exponentialRampToValueAtTime(900, when + Math.min(0.35, duration));
  filter.Q.value = 0.7;
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(volume, when + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(filter);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(filter);
  filter.connect(envelope);
  envelope.connect(panner);
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), when);
  panner.connect(output);
  if (wetOutput) panner.connect(wetOutput);
  oscillator.start(when);
  harmonic.start(when);
  oscillator.stop(when + duration + 0.05);
  harmonic.stop(when + duration + 0.05);
}

function hashInput(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value ^ (value >>> 15), 1 | value) + 0x6d2b79f5) >>> 0;
    let result = Math.imul(value ^ (value >>> 7), 61 | value) ^ value;
    result = (result ^ (result >>> 14)) >>> 0;
    return result / 4294967296;
  };
}

function midiToFrequency(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

function createReverb(context, output, random) {
  const reverb = context.createConvolver();
  const wet = context.createGain();
  const length = Math.floor(context.sampleRate * 1.2);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const fade = (1 - index / data.length) ** 2;
      data[index] = (random() * 2 - 1) * fade * (channel ? 0.82 : 1);
    }
  }
  reverb.buffer = impulse;
  wet.gain.value = 0.16;
  reverb.connect(wet);
  wet.connect(output);
  return reverb;
}

function scheduleKick(context, output, when, volume) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(150, when);
  oscillator.frequency.exponentialRampToValueAtTime(48, when + 0.16);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(volume, when + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
  oscillator.connect(envelope);
  envelope.connect(output);
  oscillator.start(when);
  oscillator.stop(when + 0.22);
}

function sourceEnergyForFrame(analysis, progress) {
  const energy = String(analysis.energy || '').toLowerCase();
  const base = /high|driving|energetic/.test(energy) ? 0.82 : /low|calm|soft/.test(energy) ? 0.3 : 0.56;
  const tempo = Number(analysis.tempo) || 100;
  return Math.max(0.18, Math.min(1, base + Math.sin(progress * Math.PI * (tempo / 28)) * 0.16));
}

function scheduleMusic(context, destination, input, analysis = {}) {
  const random = seededRandom(hashInput(input));
  const direction = `${input} ${JSON.stringify(analysis)}`.toLowerCase();
  const profiles = [
    { name: 'acoustic pulse', tempo: 94, scale: [0, 2, 3, 5, 7, 10], chord: [0, 3, 5, 4], melody: [0, 2, 4, 2, 5, 4, 2, 0], kit: 'organic', leadType: 'triangle', leadRest: 0.18 },
    { name: 'midnight groove', tempo: 108, scale: [0, 2, 3, 5, 7, 9, 10], chord: [0, 5, 3, 4], melody: [0, 0, 2, 4, 2, 5, 4, 2], kit: 'groove', leadType: 'sawtooth', leadRest: 0.08 },
    { name: 'dream-pop pulse', tempo: 86, scale: [0, 2, 3, 7, 9, 10], chord: [0, 3, 5, 4], melody: [4, 5, 4, 2, 0, 2, 4, 5], kit: 'soft', leadType: 'sine', leadRest: 0.35 },
    { name: 'cinematic motion', tempo: 102, scale: [0, 2, 4, 5, 7, 9, 11], chord: [0, 4, 5, 3], melody: [0, 4, 2, 5, 4, 7, 5, 2], kit: 'wide', leadType: 'triangle', leadRest: 0.22 },
  ];
  const seed = hashInput(direction);
  const requestedGenre = String(analysis.genre || '').toLowerCase();
  const profileIndex = /electronic|dance|house|techno|trap/.test(requestedGenre) ? 1 : /ambient|dream|lo-fi/.test(requestedGenre) ? 2 : /acoustic|folk|indie|jazz/.test(requestedGenre) ? 0 : /cinematic|orchestral|film/.test(requestedGenre) ? 3 : seed % profiles.length;
  const profile = { ...profiles[profileIndex], scale: [...profiles[profileIndex].scale], chord: [...profiles[profileIndex].chord], melody: [...profiles[profileIndex].melody] };
  const requestedTempo = Number(analysis.tempo);
  if (Number.isFinite(requestedTempo)) profile.tempo = Math.max(70, Math.min(150, requestedTempo));
  if (/piano|keys/.test(String(analysis.instruments || '').toLowerCase())) profile.leadType = 'sine';
  if (/guitar|pluck|acoustic/.test(String(analysis.instruments || '').toLowerCase())) profile.leadType = 'triangle';
  if (direction.includes('dream') || direction.includes('ambient') || direction.includes('soft')) profile.tempo = Math.min(profile.tempo, 92);
  const rootChoices = [{ midi: 45, name: 'A' }, { midi: 48, name: 'C' }, { midi: 50, name: 'D' }, { midi: 52, name: 'E' }, { midi: 55, name: 'G' }, { midi: 57, name: 'A' }];
  const rootChoice = rootChoices[Math.floor(random() * rootChoices.length)];
  const root = rootChoice.midi;
  const keyName = `${rootChoice.name} ${profile.scale[2] === 3 ? 'minor' : 'major'}`;
  const beat = 60 / profile.tempo;
  const step = beat / 2;
  const start = context.currentTime + 0.08;
  const length = PREVIEW_SECONDS;
  const steps = Math.ceil(length / step);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  compressor.connect(destination);
  const reverb = createReverb(context, compressor, random);
  const pad = context.createGain();
  pad.gain.value = profile.kit === 'soft' ? 0.09 : 0.055;
  pad.connect(compressor);

  for (let index = 0; index < steps; index += 1) {
    const swing = index % 2 ? (random() - 0.5) * Math.min(0.045, step * 0.12) : 0;
    const when = start + index * step + swing;
    const bar = Math.floor(index / 8);
    const chordRoot = root + profile.chord[bar % profile.chord.length];
    const scaleNote = (stepIndex) => profile.scale[(stepIndex + bar) % profile.scale.length];
    const sourceEnergy = /high|driving|energetic/.test(String(analysis.energy || '').toLowerCase()) ? 0.9 : /low|calm|soft/.test(String(analysis.energy || '').toLowerCase()) ? 0.35 : 0.6;
    if (index % 2 === 0) {
      scheduleTone(context, compressor, midiToFrequency(chordRoot - 12), when, beat * 0.42, 0.055 + sourceEnergy * 0.045, 'sine', reverb, (random() - 0.5) * 0.25);
      scheduleTone(context, compressor, midiToFrequency(chordRoot + 12), when, beat * 0.25, 0.035, 'triangle', reverb, (random() - 0.5) * 0.45);
    }
    const kickHit = profile.kit === 'groove' ? index % 4 === 0 || index % 8 === 6 : profile.kit === 'soft' ? index % 8 === 0 : profile.kit === 'wide' ? index % 4 === 0 || index % 8 === 3 : index % 4 === 0;
    if (kickHit) {
      scheduleKick(context, compressor, when, (profile.kit === 'groove' ? 0.3 : 0.2) + sourceEnergy * 0.12);
      scheduleTone(context, compressor, midiToFrequency(chordRoot + 12), when + step * 0.03, beat * 0.8, 0.028, 'sawtooth', reverb, -0.2);
    }
    const snareHit = profile.kit === 'soft' ? index % 8 === 6 : profile.kit === 'wide' ? index % 8 === 4 : index % 8 === 4 || (profile.kit === 'groove' && index % 8 === 7);
    if (snareHit) scheduleNoise(context, compressor, when, 0.15, profile.kit === 'soft' ? 0.045 : 0.085, 700, reverb, 0.16);
    const hatHit = profile.kit === 'soft' ? index % 4 === 2 : profile.kit === 'wide' ? index % 2 === 1 : index % 2 === 0 || random() > 0.72;
    if (hatHit) scheduleNoise(context, compressor, when + step * 0.16, 0.052, profile.kit === 'soft' ? 0.012 : 0.02, 4200, null, random() > 0.5 ? 0.45 : -0.45);

    // A plucked, acoustic-style arpeggio gives each generated score a musical
    // identity instead of a row of identical electronic beeps.
    const arpeggioNote = chordRoot + scaleNote(index % 4) + (index % 8 > 3 ? 12 : 0);
    schedulePluck(context, compressor, reverb, midiToFrequency(arpeggioNote + 12), when + step * 0.08, step * 0.72, 0.055 + random() * 0.025, (index % 4 - 1.5) * 0.18);
    if (index % 4 === 0) {
      const third = chordRoot + profile.scale[2] + 12;
      const fifth = chordRoot + profile.scale[4] + 12;
      scheduleTone(context, pad, midiToFrequency(third), when, beat * 1.9, 0.12, 'sine', null, -0.3);
      scheduleTone(context, pad, midiToFrequency(fifth), when, beat * 1.9, 0.1, 'triangle', null, 0.3);
    }
    if (index % 2 === 0 && random() > profile.leadRest) {
      const phraseIndex = (index / 2 + Math.floor(seed / 97) % profile.melody.length) % profile.melody.length;
      const melodyNote = chordRoot + profile.scale[profile.melody[phraseIndex] % profile.scale.length] + 24;
      scheduleTone(context, compressor, midiToFrequency(melodyNote), when + step * 0.04, beat * 0.34, 0.045 + random() * 0.025, profile.leadType, reverb, (random() - 0.5) * 0.8);
    }
  }
  return { ...profile, keyName, seed };
}

function canvasVideo(title, format, input, audioContext, analysis = {}) {
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
      const progress = Math.min((now - started) / (PREVIEW_SECONDS * 1000), 1);
      const sourceWave = sourceEnergyForFrame(analysis, progress);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#17174b'); gradient.addColorStop(.48, '#6c3f88'); gradient.addColorStop(1, '#f0a16e');
      context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = .22; context.fillStyle = '#d9f55a';
      context.beginPath(); context.arc(canvas.width * (.73 - progress * .12), canvas.height * .28, canvas.width * (.08 + sourceWave * .09), 0, Math.PI * 2); context.fill();
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
      const profile = scheduleMusic(audioContext, audioDestination, input, analysis);
      $('audio-label').textContent = `AI music score · ${profile.name} · ${profile.keyName} · ${profile.tempo} BPM`;
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

