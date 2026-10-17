const state = { type: 'music-video', format: 'short', duration: 30, connected: false, generated: false, accessToken: null, channelTitle: '', videoBlob: null, previewUrl: '', plan: null };
const PREVIEW_SECONDS = 10;
const YOUTUBE_CLIENT_ID = '442084033193-giinlub1bcoh39r5v2ior5nr2aq7oe1r.apps.googleusercontent.com';
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
let authRequestTimer;
let authRequestId = 0;

const typeCopy = {
  'music-video': {
    label: 'Music video',
    prompt: 'An original, melodic indie-pop video at golden hour: intimate vocals, fingerpicked guitar, warm bass, brushed drums, and a road-trip story that opens up into a joyful final chorus...',
    briefLabel: 'Describe the music video you imagine',
    help: 'Include the sound, mood, story, and details that make this yours.',
    music: true,
    narration: false,
  },
  story: {
    label: 'Story',
    prompt: 'A hopeful short story about a tiny robot protecting the last living plant in a quiet, abandoned city. Give it a surprising but warm ending...',
    briefLabel: 'What story should Sonora tell?',
    help: 'Describe the characters, setting, conflict, and the feeling or ending you want.',
    music: true,
    narration: true,
  },
  'animated-short': {
    label: 'Animated short',
    prompt: 'A curious young fox discovers a tiny floating garden above the city. Stylized 3D animation, expressive character acting, playful camera movement, and a gentle ending...',
    briefLabel: 'Describe the animated short',
    help: 'Tell us about the characters, animation style, action, and world.',
    music: true,
    narration: false,
  },
  explainer: {
    label: 'Explainer',
    prompt: 'Explain how a solar panel turns sunlight into electricity for a curious 12-year-old. Use clear visual metaphors, friendly narration, and simple animated diagrams...',
    briefLabel: 'What should the video explain?',
    help: 'Name the topic, who it is for, and the one thing viewers should remember.',
    music: true,
    narration: true,
  },
  custom: {
    label: 'Custom video',
    prompt: 'Describe any video you can imagine—its purpose, audience, characters or subject, tone, and what the viewer should feel...',
    briefLabel: 'What would you like to create?',
    help: 'Start anywhere. Sonora will shape the idea into a production plan.',
    music: true,
    narration: false,
  },
};

const $ = (id) => document.getElementById(id);

function setYouTubeConnectionStatus(message, stateName = '') {
  const status = $('youtube-connection-status');
  status.textContent = message;
  status.dataset.state = stateName;
}

function selectCreationType(type) {
  state.type = typeCopy[type] ? type : 'custom';
  document.querySelectorAll('.type-card').forEach((button) => {
    const selected = button.dataset.type === state.type;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const copy = typeCopy[state.type];
  $('brief-label').textContent = copy.briefLabel;
  $('brief-help').textContent = copy.help;
  $('brief-text').placeholder = copy.prompt;
  $('music-enabled').checked = copy.music;
  $('narration-enabled').checked = copy.narration;
  $('preview-kicker').textContent = `SONORA / ${copy.label.toUpperCase()} TREATMENT`;
}

document.querySelectorAll('.type-card').forEach((button) => button.addEventListener('click', () => selectCreationType(button.dataset.type)));

document.querySelectorAll('.quick-tags button').forEach((button) => button.addEventListener('click', () => {
  const style = $('visual-style');
  const selection = button.dataset.style;
  style.value = style.value === selection ? '' : selection;
  document.querySelectorAll('.quick-tags button').forEach((item) => item.classList.toggle('selected', item === button && style.value));
  style.focus();
}));

$('format-select').addEventListener('change', (event) => { state.format = event.target.value; });
$('duration-select').addEventListener('change', (event) => { state.duration = Number(event.target.value); });

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

function demoAnalysis(request) {
  const analysis = inferMusicAnalysis(`${request.input} ${request.visualStyle}`);
  const title = request.input.split(/[.!?\n]/)[0].trim().split(/\s+/).slice(0, 7).join(' ').replace(/[,;:]$/, '') || typeCopy[request.type].label;
  const sceneTypes = {
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
      ['The playful challenge', 'Escalate the action while preserving the character design and screen direction.'],
      ['A little wonder', 'Finish with a memorable, emotionally clear animated payoff.'],
    ],
    explainer: [
      ['The question', 'Start with the viewer’s question and a concrete visual hook.'],
      ['The simple model', 'Introduce one visual metaphor that makes the main idea intuitive.'],
      ['How it works', 'Show the key steps in order, with narration and captions kept in sync.'],
      ['The takeaway', 'Repeat the core idea and close with a practical, memorable summary.'],
    ],
    custom: [
      ['Set the scene', 'Establish the subject, audience, tone, and visual world.'],
      ['Build the idea', 'Develop the central action or message with a distinct visual progression.'],
      ['Make the moment', 'Deliver the most important reveal, change, or emotional beat.'],
      ['Leave an impression', 'Resolve the idea with a strong final image or call to action.'],
    ],
  };
  const titles = sceneTypes[request.type] || sceneTypes.custom;
  const sceneSeconds = Math.floor(request.duration / titles.length);
  const musicEnabled = request.sound?.music !== false;
  const narrationEnabled = request.sound?.narration === true;
  const captionsEnabled = request.sound?.captions !== false;
  const musicDirection = musicEnabled
    ? request.type === 'music-video'
      ? `${analysis.genre} at about ${analysis.tempo} BPM, with ${analysis.instruments.join(', ')}; a distinct melody and arrangement that follow the brief.`
      : `An original ${analysis.mood} underscore with ${analysis.instruments.slice(0, 3).join(', ')}; leave space for the story and dialogue.`
    : 'No score requested. Preserve dialogue and natural sound, with intentional quiet where it helps.';
  return {
    provider: 'demo',
    type: request.type,
    title,
    subtitle: `${typeCopy[request.type].label} · ${request.duration}s · ${request.format === 'wide' ? '16:9' : request.format === 'square' ? '1:1' : '9:16'}`,
    treatment: `A ${request.duration}-second ${typeCopy[request.type].label.toLowerCase()} built from the user’s direction: ${request.input}`,
    visualStyle: request.visualStyle || 'Let the brief guide a coherent visual style, color palette, and camera language.',
    audioDirection: musicDirection,
    narration: narrationEnabled ? 'Plan original narration or character dialogue; mix it clearly above the score.' : 'No narration requested.',
    captions: captionsEnabled ? 'Add readable, synchronized captions with safe margins for the selected aspect ratio.' : 'Captions are off.',
    analysis,
    scenes: titles.map(([sceneTitle, description], index) => ({ title: sceneTitle, description: `${description} Direction: ${request.input}`, durationSeconds: index === titles.length - 1 ? request.duration - sceneSeconds * (titles.length - 1) : sceneSeconds, audioCue: index === 0 ? 'Opening cue' : index === titles.length - 1 ? 'Resolve and fade' : 'Transition cue' })),
  };
}

function setBuildPhase(phase, label, detail = '') {
  $('build-status').textContent = detail ? `${label} · ${detail}` : label;
  document.querySelectorAll('#phase-list li').forEach((item) => {
    const itemPhase = Number(item.dataset.phase);
    item.classList.toggle('complete', itemPhase < phase);
    item.classList.toggle('current', itemPhase === phase);
  });
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

function failYouTubeConnection(error) {
  state.connected = false;
  state.accessToken = null;
  $('connect-button').disabled = false;
  $('connect-button').textContent = 'Connect YouTube ↗';
  $('connect-button').style.color = '';
  $('connect-button').title = error.message;
  setYouTubeConnectionStatus(`Connection failed: ${error.message}`, 'error');
}

function connectYouTube() {
  const button = $('connect-button');
  const requestId = ++authRequestId;
  button.textContent = 'Loading Google sign-in…';
  button.disabled = true;
  button.title = '';
  setYouTubeConnectionStatus('Waiting for Google authorization…');
  const google = window.google?.accounts?.oauth2 ? window.google : null;
  if (!google) {
    waitForGoogle().then(() => {
      if (requestId !== authRequestId) return;
      button.disabled = false;
      button.textContent = state.connected ? 'YouTube connected ✓' : 'Connect YouTube ↗';
      setYouTubeConnectionStatus('Google sign-in is ready. Click Connect YouTube again.');
    }).catch(failYouTubeConnection);
    return;
  }
  try {
    const requestClient = google.accounts.oauth2.initTokenClient({
      client_id: YOUTUBE_CLIENT_ID,
      scope: YOUTUBE_SCOPE,
      callback: async (response) => {
        if (requestId !== authRequestId) return;
        window.clearTimeout(authRequestTimer);
        try {
          if (response.error) throw new Error(response.error_description || response.error);
          if (!response.access_token) throw new Error('Google did not return an upload authorization token.');
          state.accessToken = response.access_token;
          state.connected = true;
          button.disabled = false;
          button.innerHTML = 'YouTube connected <span>✓</span>';
          button.style.color = 'var(--accent)';
          button.title = '';
          setYouTubeConnectionStatus('Upload access authorized for this session.', 'connected');
          $('publish-button').disabled = true;
          $('publish-button').textContent = 'Available after a real video is rendered';
        } catch (error) {
          failYouTubeConnection(error);
        }
      },
    });
    authRequestTimer = window.setTimeout(() => {
      if (requestId !== authRequestId) return;
      authRequestId += 1;
      failYouTubeConnection(new Error('Google sign-in did not respond. Allow pop-ups for this site, then retry.'));
    }, 30000);
    requestClient.requestAccessToken({ prompt: 'select_account consent' });
  } catch (error) {
    window.clearTimeout(authRequestTimer);
    failYouTubeConnection(error);
  }
}

async function requestPlan(request) {
  // GitHub Pages cannot run a private server-side model. Keep the treatment
  // builder honest and label its local plan as a demo instead of claiming AI.
  if (window.location.hostname.endsWith('github.io')) return demoAnalysis(request);
  try {
    const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The creative plan could not be prepared.');
    return result;
  } catch (error) {
    if (error instanceof TypeError || /Failed to fetch/i.test(error.message)) return demoAnalysis(request);
    throw error;
  }
}

$('generate-button').addEventListener('click', async () => {
  const button = $('generate-button');
  const input = $('brief-text').value.trim();
  const reference = $('source-input').value.trim();
  if (!input) {
    $('brief-text').focus();
    $('draft-pill').textContent = 'ADD AN IDEA';
    $('draft-pill').title = 'Describe what you want Sonora to create.';
    setBuildPhase(0, 'Waiting for your idea', 'Describe the video you want to make.');
    return;
  }
  const request = {
    input,
    reference,
    visualStyle: $('visual-style').value.trim(),
    type: state.type,
    format: $('format-select').value,
    duration: Number($('duration-select').value),
    sound: {
      music: $('music-enabled').checked,
      narration: $('narration-enabled').checked,
      captions: $('captions-enabled').checked,
    },
  };
  state.format = request.format;
  state.duration = request.duration;
  state.plan = null;
  state.generated = false;
  state.videoBlob = null;
  $('treatment-details').hidden = true;
  $('download-plan').hidden = true;
  $('publish-button').disabled = true;
  button.disabled = true;
  button.innerHTML = '<span class="button-icon">◌</span> Shaping your treatment…';
  try {
    setBuildPhase(1, 'Phase 1/3 · Brief received', `${typeCopy[state.type].label} · ${request.duration} seconds · ${request.format}`);
    await pause(120);
    setBuildPhase(2, 'Phase 2/3 · Building treatment', reference ? 'the reference is inspiration only' : 'turning your idea into a production plan');
    const result = await requestPlan(request);
    renderPlan(result, request);
    setBuildPhase(4, 'Phase 3/3 · Treatment ready', result.provider === 'groq' ? 'review the AI-written plan below' : 'sample plan only — no media has been rendered');
  } catch (error) {
    $('draft-pill').textContent = 'PLAN FAILED';
    $('draft-pill').title = error.message;
    setBuildPhase(0, 'Plan stopped', error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = `<span class="button-icon">✦</span> ${state.plan ? 'Refine my treatment' : 'Create my treatment'} <span class="arrow">↗</span>`;
  }
});

function renderPlan(result, request) {
  state.plan = result;
  $('preview-title').textContent = result.title || 'Your idea, taking shape';
  $('preview-subtitle').textContent = result.subtitle || `${typeCopy[state.type].label} · ${request.duration}s`;
  $('preview-kicker').textContent = `SONORA / ${typeCopy[state.type].label.toUpperCase()} TREATMENT`;
  $('treatment-summary').textContent = result.treatment || request.input;
  $('visual-language').textContent = result.visualStyle || request.visualStyle || 'Guided by your brief.';
  $('sound-plan').textContent = result.audioDirection || (request.sound.music ? 'Original score planned; not yet rendered.' : 'No score requested.');
  $('voice-plan').textContent = [result.narration || (request.sound.narration ? 'Dialogue or narration planned.' : 'No narration requested.'), result.captions || (request.sound.captions ? 'Captions requested.' : 'Captions are off.')].join(' ');
  $('treatment-details').hidden = false;
  $('audio-label').textContent = request.sound.music ? 'Music direction planned · no audio rendered' : 'No music requested';
  $('provider-label').textContent = result.provider === 'groq' ? 'GROQ TREATMENT' : 'DEMO TREATMENT';
  $('draft-pill').textContent = result.provider === 'groq' ? 'PLAN READY' : 'SAMPLE PLAN';
  $('draft-pill').title = result.provider === 'groq' ? 'Treatment prepared by the configured text model. No media has been rendered.' : 'A template-based sample plan. No AI media has been generated.';
  $('scene-count').textContent = `${result.scenes?.length || 0} SCENES · ${request.duration}s`;
  $('scene-list').replaceChildren();
  (result.scenes || []).forEach((scene, index) => {
    const article = document.createElement('article');
    article.className = 'scene';
    const number = document.createElement('span');
    number.className = 'scene-number';
    number.textContent = `SCENE ${String(index + 1).padStart(2, '0')} · ${scene.durationSeconds || ''}s`;
    const title = document.createElement('strong');
    title.textContent = scene.title || `Scene ${index + 1}`;
    const description = document.createElement('p');
    description.textContent = scene.description || '';
    const cue = document.createElement('small');
    cue.className = 'scene-cue';
    cue.textContent = scene.audioCue || '';
    article.append(number, title, description, cue);
    $('scene-list').append(article);
  });
  $('download-plan').hidden = false;
  $('status-message').textContent = result.provider === 'groq' ? 'Groq treatment' : 'Sample treatment';
}

$('download-plan').addEventListener('click', () => {
  if (!state.plan) return;
  const plan = state.plan;
  const lines = [
    `# ${plan.title || 'Sonora treatment'}`,
    '',
    plan.subtitle || '',
    '',
    `## Treatment\n${plan.treatment || ''}`,
    `## Visual language\n${plan.visualStyle || ''}`,
    `## Sound plan\n${plan.audioDirection || ''}`,
    `## Voice & captions\n${[plan.narration, plan.captions].filter(Boolean).join('\n')}`,
    '## Scenes',
    ...(plan.scenes || []).flatMap((scene, index) => [`### ${index + 1}. ${scene.title} (${scene.durationSeconds || '?'}s)`, scene.description || '', scene.audioCue || '']),
    '',
    'Planning document only. No audio or video was rendered.',
  ];
  const file = new Blob([lines.join('\n\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sonora-treatment.md';
  link.click();
  URL.revokeObjectURL(url);
});

$('connect-button').addEventListener('click', () => {
  connectYouTube();
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

selectCreationType(state.type);
