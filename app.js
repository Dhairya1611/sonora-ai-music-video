const state = {
  type: 'music-video', format: 'short', duration: 30, connected: false,
  generated: false, accessToken: null, channelTitle: '', videoBlob: null,
  previewUrl: '', plan: null, localReady: false, job: null, jobAssets: {},
};
const YOUTUBE_CLIENT_ID = '442084033193-giinlub1bcoh39r5v2ior5nr2aq7oe1r.apps.googleusercontent.com';
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
let authRequestTimer;
let authRequestId = 0;

const typeCopy = {
  'music-video': { label: 'Music video', prompt: 'An original, melodic indie-pop video at golden hour: intimate vocals, fingerpicked guitar, warm bass, brushed drums, and a road-trip story that opens up into a joyful final chorus...', briefLabel: 'Describe the music video you imagine', help: 'Include the sound, mood, story, and details that make this yours.', music: true, narration: false },
  story: { label: 'Story', prompt: 'A hopeful short story about a tiny robot protecting the last living plant in a quiet, abandoned city. Give it a surprising but warm ending...', briefLabel: 'What story should Sonora tell?', help: 'Describe the characters, setting, conflict, and the feeling or ending you want.', music: true, narration: true },
  'animated-short': { label: 'Animated short', prompt: 'A curious young fox discovers a tiny floating garden above the city. Expressive character motion, playful camera movement, and a gentle ending...', briefLabel: 'Describe the animated short', help: 'Tell us about the characters, animation style, action, and world.', music: true, narration: false },
  explainer: { label: 'Explainer', prompt: 'Explain how a solar panel turns sunlight into electricity for a curious 12-year-old. Use clear visual metaphors, friendly narration, and simple animated diagrams...', briefLabel: 'What should the video explain?', help: 'Name the topic, who it is for, and the one thing viewers should remember.', music: true, narration: true },
  custom: { label: 'Custom video', prompt: 'Describe any video you can imagine—its purpose, audience, characters or subject, tone, and what the viewer should feel...', briefLabel: 'What would you like to create?', help: 'Start anywhere. Sonora will shape the idea into a production plan.', music: true, narration: false },
};

const $ = (id) => document.getElementById(id);
const localServiceBase = () => location.hostname.endsWith('github.io') || location.protocol === 'file:'
  ? 'http://127.0.0.1:4173'
  : location.origin;

async function localFetch(path, options = {}) {
  const response = await fetch(`${localServiceBase()}${path}`, {
    ...options,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  });
  return response;
}

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
  $('preview-kicker').textContent = `SONORA / ${copy.label.toUpperCase()}`;
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

function setBuildPhase(phase, label, detail = '') {
  $('build-status').textContent = detail ? `${label} · ${detail}` : label;
  document.querySelectorAll('#phase-list li').forEach((item) => {
    const itemPhase = Number(item.dataset.phase);
    item.classList.toggle('complete', itemPhase < phase || phase === 6);
    item.classList.toggle('current', itemPhase === phase);
  });
}

function setRendererStatus(title, description, status = '') {
  $('renderer-title').textContent = title;
  $('renderer-description').textContent = description;
  $('renderer-status').dataset.state = status;
  $('status-message').textContent = status === 'ready' ? 'Local music engine ready' : status === 'error' ? 'Local renderer unavailable' : 'Local renderer status';
  state.localReady = status === 'ready';
}

async function checkRenderer() {
  const checkButton = $('check-renderer');
  const localStudioLink = $('open-local-studio');
  checkButton.disabled = true;
  checkButton.textContent = 'Checking…';
  if (localStudioLink) localStudioLink.hidden = true;
  setRendererStatus('Checking for the Sonora local companion…', 'Looking for the service on this Mac at 127.0.0.1:4173.');
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const response = await localFetch('/api/health', { signal: controller.signal });
    window.clearTimeout(timer);
    const status = await response.json();
    if (!response.ok) throw new Error(status.error || `Local service returned ${response.status}.`);
    if (status.ready) {
      setRendererStatus('This Mac’s local music engine is reachable ✓', 'ACE-Step is available. Its first request downloads model weights; later generations use the cached local models.', 'ready');
    } else {
      setRendererStatus('Sonora companion found; music model is not ready yet', 'Start the local companion with “npm start” and wait for ACE-Step to finish loading. Then check again.', 'warming');
    }
  } catch (error) {
    const blocked = error.name === 'AbortError' || error instanceof TypeError;
    const canOpenLocalStudio = location.hostname.endsWith('github.io') || location.protocol === 'file:';
    if (localStudioLink) localStudioLink.hidden = !canOpenLocalStudio;
    setRendererStatus(
      'Local companion not reachable',
      blocked
        ? canOpenLocalStudio
          ? 'This browser could not connect to the local renderer from the hosted page. Keep “npm start” running, then open Sonora directly on this Mac to generate without that cross-site connection.'
          : 'Run “npm start” from Sonora’s folder on this Mac, then check again.'
        : error.message,
      'error',
    );
  } finally {
    checkButton.disabled = false;
    checkButton.textContent = 'Check local engine ↻';
  }
}

$('check-renderer').addEventListener('click', checkRenderer);

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

function updatePublishButton() {
  const button = $('publish-button');
  const canPublish = state.connected && state.generated;
  button.disabled = !canPublish;
  if (button.dataset.done === 'true') return;
  button.textContent = canPublish
    ? 'Upload this video privately to YouTube ↗'
    : state.connected ? 'Render a preview before uploading' : 'Connect YouTube and render a preview first';
}

function connectYouTube() {
  const button = $('connect-button');
  const requestId = ++authRequestId;
  button.textContent = 'Loading Google sign-in…';
  button.disabled = true;
  button.title = '';
  setYouTubeConnectionStatus('Waiting for Google account selection…');
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
          button.textContent = 'YouTube connected ✓';
          button.style.color = 'var(--accent)';
          button.title = 'Authorized for this browser session.';
          setYouTubeConnectionStatus('Connected for this browser session. Videos upload privately only when you press Upload.', 'connected');
          updatePublishButton();
        } catch (error) {
          failYouTubeConnection(error);
        }
      },
    });
    authRequestTimer = window.setTimeout(() => {
      if (requestId !== authRequestId) return;
      authRequestId += 1;
      failYouTubeConnection(new Error('Google sign-in did not respond. Allow pop-ups for this site, then retry.'));
    }, 30_000);
    requestClient.requestAccessToken({ prompt: 'select_account consent' });
  } catch (error) {
    window.clearTimeout(authRequestTimer);
    failYouTubeConnection(error);
  }
}

$('connect-button').addEventListener('click', connectYouTube);

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

function paletteColor(value, fallback) {
  const color = String(value || '').trim().toLowerCase();
  if (/^#[\da-f]{6}$/i.test(color)) return color;
  const names = { violet: '#5e54b7', purple: '#5e54b7', amber: '#d6964b', orange: '#d6964b', blue: '#385f95', midnight: '#252b56', green: '#55906d', teal: '#3e8791', pink: '#b45f85', red: '#a64f59', gold: '#be9350', warm: '#b47756' };
  return Object.entries(names).find(([name]) => color.includes(name))?.[1] || fallback;
}

function wrapText(context, text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else current = candidate;
  }
  if (current) lines.push(current);
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:!?]?$/, '')}…`;
  return lines;
}

function drawMotionFrame(context, width, height, progress, scene, sceneIndex, plan, request, random, amplitude) {
  const colors = plan.analysis?.palette || [];
  const first = paletteColor(colors[0], '#34366f');
  const second = paletteColor(colors[1], '#805070');
  const third = paletteColor(colors[2], '#e5a66e');
  const gradient = context.createLinearGradient(width * (0.1 + progress * 0.18), 0, width * (0.9 - progress * 0.15), height);
  gradient.addColorStop(0, first);
  gradient.addColorStop(0.52, second);
  gradient.addColorStop(1, third);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const phase = (progress * 0.8 + sceneIndex * 0.19) * Math.PI * 2;
  const centerX = width * (0.5 + Math.sin(phase) * 0.05);
  const centerY = height * (0.43 + Math.cos(phase * 0.7) * 0.04);
  const scale = Math.min(width, height);
  context.save();
  context.globalAlpha = 0.13;
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, scale * 0.0015);
  for (let line = 1; line <= 8; line += 1) {
    const y = height * 0.3 + line * scale * 0.035;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y + Math.sin(phase + line) * scale * 0.018); context.stroke();
  }
  context.restore();

  for (let item = 0; item < 26; item += 1) {
    const x = random() * width;
    const baseY = random() * height;
    const y = (baseY - progress * height * (0.08 + random() * 0.18) + height) % height;
    const radius = scale * (0.0015 + random() * 0.0045) * (1 + amplitude * 2.4);
    context.globalAlpha = 0.16 + amplitude * 0.23;
    context.fillStyle = item % 3 ? '#f5f2df' : '#d9f55a';
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;

  const orbRadius = scale * (0.105 + amplitude * 0.035);
  const orbGradient = context.createRadialGradient(centerX - orbRadius * 0.3, centerY - orbRadius * 0.4, orbRadius * 0.08, centerX, centerY, orbRadius);
  orbGradient.addColorStop(0, '#fff2ce'); orbGradient.addColorStop(0.45, '#f5bd8b'); orbGradient.addColorStop(1, '#e78c95');
  context.fillStyle = orbGradient;
  context.globalAlpha = 0.78;
  context.beginPath(); context.arc(centerX, centerY, orbRadius, 0, Math.PI * 2); context.fill();
  context.globalAlpha = 1;

  const type = request.type;
  if (type === 'explainer') {
    const nodeY = height * 0.58;
    const nodeXs = [width * 0.25, width * 0.5, width * 0.75];
    context.strokeStyle = 'rgba(255,255,255,.7)'; context.lineWidth = scale * 0.005;
    context.beginPath(); context.moveTo(nodeXs[0], nodeY); context.lineTo(nodeXs[2], nodeY); context.stroke();
    nodeXs.forEach((x, index) => {
      context.fillStyle = index === sceneIndex % 3 ? '#d9f55a' : '#f5f2df';
      context.beginPath(); context.arc(x, nodeY, scale * 0.027, 0, Math.PI * 2); context.fill();
    });
  } else if (type === 'animated-short') {
    const characterX = width * (0.5 + Math.sin(phase * 1.4) * 0.14);
    const characterY = height * 0.59 + Math.abs(Math.sin(phase * 2)) * scale * 0.03;
    context.fillStyle = '#d9f55a';
    context.beginPath(); context.ellipse(characterX, characterY, scale * 0.055, scale * 0.07, 0, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(characterX, characterY - scale * 0.071, scale * 0.037, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#28233f'; context.beginPath(); context.arc(characterX + scale * 0.012, characterY - scale * 0.079, scale * 0.004, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(characterX + scale * 0.028, characterY - scale * 0.079, scale * 0.004, 0, Math.PI * 2); context.fill();
  } else if (type === 'story') {
    context.globalAlpha = 0.77;
    context.fillStyle = '#252548';
    context.beginPath(); context.ellipse(width * 0.5, height * 0.67, width * 0.52, height * 0.18, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#d9f55a';
    context.beginPath(); context.arc(width * (0.39 + Math.sin(phase) * 0.04), height * 0.61, scale * 0.033, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#f5f2df';
    context.beginPath(); context.arc(width * (0.6 - Math.sin(phase) * 0.04), height * 0.62, scale * 0.026, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 1;
  } else if (type === 'music-video') {
    const bars = 34;
    const barWidth = width * 0.008;
    for (let bar = 0; bar < bars; bar += 1) {
      const x = (width - bars * barWidth * 1.7) / 2 + bar * barWidth * 1.7;
      const wave = Math.abs(Math.sin(bar * 0.7 + phase)) * (0.025 + amplitude * 0.08);
      const barHeight = height * wave;
      context.fillStyle = bar % 5 === 0 ? '#d9f55a' : 'rgba(255,255,255,.78)';
      context.fillRect(x, height * 0.67 - barHeight / 2, barWidth, Math.max(scale * 0.004, barHeight));
    }
  } else {
    context.strokeStyle = 'rgba(255,255,255,.74)'; context.lineWidth = scale * 0.004;
    context.beginPath(); context.arc(centerX, centerY, orbRadius * (1.4 + amplitude * 0.12), phase, phase + Math.PI * 1.5); context.stroke();
  }

  const lower = height * 0.74;
  const titleSize = Math.round(scale * (width < height ? 0.061 : 0.052));
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#fffaf0';
  context.font = `700 ${titleSize}px Manrope, Arial, sans-serif`;
  const titleLines = wrapText(context, scene?.title || plan.title || typeCopy[type].label, width * 0.82, 2);
  titleLines.forEach((line, index) => context.fillText(line, width / 2, lower + index * titleSize * 1.16));
  if (request.sound.captions) {
    const caption = String(scene?.description || request.input).split(/\s+Direction:/i)[0];
    context.font = `500 ${Math.round(scale * 0.022)}px Manrope, Arial, sans-serif`;
    context.fillStyle = 'rgba(255,250,240,.86)';
    const lines = wrapText(context, caption, width * 0.76, 2);
    lines.forEach((line, index) => context.fillText(line, width / 2, lower + titleLines.length * titleSize * 1.15 + scale * 0.035 + index * scale * 0.03));
  }
  context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  context.fillStyle = '#d9f55a'; context.font = `500 ${Math.round(scale * 0.014)}px "DM Mono", monospace`;
  context.fillText(`SONORA · ${typeCopy[type].label.toUpperCase()} · ${String(sceneIndex + 1).padStart(2, '0')}`, width * 0.055, height * 0.075);
}

function decodeAudio(context, arrayBuffer) {
  return new Promise((resolve, reject) => context.decodeAudioData(arrayBuffer.slice(0), resolve, () => reject(new Error('The generated audio could not be decoded by this browser.'))));
}

async function fetchJobAsset(jobId, asset) {
  const response = await localFetch(`/api/jobs/${jobId}/${asset}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Could not load generated ${asset}.`);
  }
  return response.arrayBuffer();
}

function renderPlan(result, request) {
  state.plan = result;
  $('preview-title').textContent = result.title || 'Your idea, taking shape';
  $('preview-subtitle').textContent = result.subtitle || `${typeCopy[request.type].label} · ${request.duration}s`;
  $('preview-kicker').textContent = `SONORA / ${typeCopy[request.type].label.toUpperCase()}`;
  $('treatment-summary').textContent = result.treatment || request.input;
  $('visual-language').textContent = result.visualStyle || request.visualStyle || 'Guided by your brief.';
  $('sound-plan').textContent = result.audioDirection || (request.sound.music ? 'Original score requested.' : 'No score requested.');
  $('voice-plan').textContent = [result.narration || (request.sound.narration ? 'A local system voice will narrate the scene beats.' : 'No narration requested.'), result.captions || (request.sound.captions ? 'Captions requested.' : 'Captions are off.')].join(' ');
  $('treatment-details').hidden = false;
  $('audio-label').textContent = request.sound.music ? 'Waiting for the original local score…' : request.sound.narration ? 'Preparing local voice narration…' : 'Silent video as requested';
  $('provider-label').textContent = result.provider === 'groq' ? 'GROQ + ACE-STEP' : 'TEMPLATE + ACE-STEP';
  $('draft-pill').textContent = result.provider === 'groq' ? 'PLAN READY' : 'TEMPLATE PLAN';
  $('draft-pill').title = result.provider === 'groq' ? 'The configured text model prepared this treatment; audio is generated separately.' : 'No text-model key is configured, so scene beats use a template. Local ACE-Step still generates original audio.';
  $('scene-count').textContent = `${result.scenes?.length || 0} SCENES · ${request.duration}s`;
  $('scene-list').replaceChildren();
  (result.scenes || []).forEach((scene, index) => {
    const article = document.createElement('article');
    article.className = 'scene';
    const number = document.createElement('span'); number.className = 'scene-number'; number.textContent = `SCENE ${String(index + 1).padStart(2, '0')} · ${scene.durationSeconds || ''}s`;
    const title = document.createElement('strong'); title.textContent = scene.title || `Scene ${index + 1}`;
    const description = document.createElement('p'); description.textContent = scene.description || '';
    const cue = document.createElement('small'); cue.className = 'scene-cue'; cue.textContent = scene.audioCue || '';
    article.append(number, title, description, cue); $('scene-list').append(article);
  });
  $('download-plan').hidden = false;
}

function currentRequest() {
  return {
    input: $('brief-text').value.trim(),
    reference: $('source-input').value.trim(),
    visualStyle: $('visual-style').value.trim(),
    type: state.type,
    format: $('format-select').value,
    duration: Number($('duration-select').value),
    sound: { music: $('music-enabled').checked, narration: $('narration-enabled').checked, captions: $('captions-enabled').checked },
  };
}

async function pollJob(jobId, request) {
  const started = Date.now();
  while (Date.now() - started < Math.max(65 * 60_000, request.duration * 65_000)) {
    const response = await localFetch(`/api/jobs/${jobId}`);
    const job = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(job.error || `Local job status failed (${response.status}).`);
    state.job = job;
    if (job.status === 'failed') throw new Error(job.error || job.message || 'The local generation stopped.');
    if (job.phase === 'plan') setBuildPhase(2, 'Phase 2/5 · Shaping the production plan', job.message);
    else if (job.phase === 'music') setBuildPhase(3, 'Phase 3/5 · Generating original music', job.message);
    else if (job.phase === 'narration') setBuildPhase(3, 'Phase 3/5 · Preparing narration', job.message);
    else if (job.phase === 'ready') return job;
    else setBuildPhase(2, 'Phase 2/5 · Preparing your idea', job.message);
    await new Promise((resolve) => window.setTimeout(resolve, 2200));
  }
  throw new Error('The local job took too long to respond. Check the engine status and retry.');
}

function resetVideoPreview() {
  state.generated = false;
  state.videoBlob = null;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = '';
  $('preview-video').removeAttribute('src');
  $('preview-video').load();
  $('preview-video').classList.remove('ready');
  $('visual-preview').classList.remove('has-video');
  $('download-video').hidden = true;
  $('draft-pill').textContent = 'GENERATING';
  $('publish-button').dataset.done = 'false';
  updatePublishButton();
}

async function startGeneration(request) {
  const button = $('generate-button');
  state.format = request.format;
  state.duration = request.duration;
  state.plan = null;
  state.job = null;
  state.request = request;
  state.jobAssets = {};
  resetVideoPreview();
  $('treatment-details').hidden = true;
  $('download-plan').hidden = true;
  button.disabled = true;
  button.textContent = 'Preparing your creation…';
  setBuildPhase(1, 'Phase 1/5 · Brief received', `${typeCopy[request.type].label} · ${request.duration} seconds · ${request.format}`);
  try {
    const response = await localFetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    const initial = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(initial.error || `Local renderer rejected this brief (${response.status}).`);
    setBuildPhase(2, 'Phase 2/5 · Preparing the production plan', 'waiting for the local creative pipeline');
    const finished = await pollJob(initial.id, request);
    state.job = finished;
    state.plan = finished.plan;
    if (!state.plan) throw new Error('The local plan step finished without returning a storyboard.');
    renderPlan(state.plan, request);
    if (request.sound.music) state.jobAssets.music = await fetchJobAsset(finished.id, 'audio');
    if (request.sound.narration) state.jobAssets.narration = await fetchJobAsset(finished.id, 'narration');
    $('audio-label').textContent = [request.sound.music ? 'Original ACE-Step music ready' : '', request.sound.narration ? 'Mac voice ready' : ''].filter(Boolean).join(' · ') || 'Silent video as requested';
    $('provider-label').textContent = `${finished.plan.provider === 'groq' ? 'GROQ + ' : ''}${request.sound.music ? 'ACE-STEP' : 'MOTION GRAPHICS'}`;
    $('draft-pill').textContent = 'AUDIO READY';
    $('draft-pill').title = 'Audio is prepared. Press Render video preview to assemble it with your motion graphics.';
    setBuildPhase(4, 'Phase 3/5 · Sound ready', 'review the plan, then render a preview');
    button.disabled = false;
    button.textContent = 'Render video preview · ' + request.duration + 's';
  } catch (error) {
    $('draft-pill').textContent = 'GENERATION FAILED';
    $('draft-pill').title = error.message;
    setBuildPhase(0, 'Generation stopped', error.message);
    button.disabled = false;
    button.innerHTML = '<span class="button-icon">✦</span> Try again <span class="arrow">↗</span>';
  }
}

async function renderVideo(request) {
  const button = $('generate-button');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioContext = null;
  const canvas = document.createElement('canvas');
  if (request.format === 'short') { canvas.width = 720; canvas.height = 1280; }
  else if (request.format === 'square') { canvas.width = 960; canvas.height = 960; }
  else { canvas.width = 1280; canvas.height = 720; }
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This browser could not create the video canvas.');
  const videoStream = canvas.captureStream(30);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mime) throw new Error('This browser cannot encode a WebM preview. Open the GitHub Pages site in Chrome or Edge.');
  let recorder;
  let audioDestination;
  let master;
  let musicSource;
  let narrationSource;
  const streams = [videoStream];
  try {
    if (request.sound.music || request.sound.narration) {
      if (!AudioContextClass) throw new Error('This browser does not support audio rendering.');
      audioContext = new AudioContextClass();
      // Invoke resume inside the user click that starts the render, so browser
      // autoplay policies do not discard the real generated audio track.
      const resumed = audioContext.resume();
      const decodedMusic = request.sound.music ? await decodeAudio(audioContext, state.jobAssets.music) : null;
      const decodedNarration = request.sound.narration ? await decodeAudio(audioContext, state.jobAssets.narration) : null;
      await resumed;
      if (decodedMusic && decodedMusic.duration < request.duration - 1.25) {
        throw new Error(`The model returned ${Math.round(decodedMusic.duration)} seconds of music for a ${request.duration}-second video. Try a shorter video or retry generation.`);
      }
      audioDestination = audioContext.createMediaStreamDestination();
      master = audioContext.createGain();
      master.gain.value = 0.9;
      if (decodedMusic) {
        musicSource = audioContext.createBufferSource(); musicSource.buffer = decodedMusic;
        const musicGain = audioContext.createGain(); musicGain.gain.value = 0.78;
        musicSource.connect(musicGain); musicGain.connect(master);
      }
      if (decodedNarration) {
        narrationSource = audioContext.createBufferSource(); narrationSource.buffer = decodedNarration;
        const voiceGain = audioContext.createGain(); voiceGain.gain.value = 1;
        narrationSource.connect(voiceGain); voiceGain.connect(master);
      }
      const audioTracks = audioDestination.stream.getAudioTracks();
      if ((decodedMusic || decodedNarration) && !audioTracks.length) throw new Error('The browser could not attach audio to the rendered video.');
      streams.push(audioDestination.stream);
    }
    const combinedStream = new MediaStream(streams.flatMap((stream) => stream.getTracks()));
    recorder = new MediaRecorder(combinedStream, { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 192_000 });
    const chunks = [];
    await new Promise((resolve, reject) => {
      let animationFrame = 0;
      let startAt = 0;
      const random = seededRandom(hashInput(`${request.input}|${request.visualStyle}|${request.type}`));
      const scenes = state.plan.scenes?.length ? state.plan.scenes : [{ title: state.plan.title, description: request.input, durationSeconds: request.duration }];
      let durationTotal = scenes.reduce((total, scene) => total + (Number(scene.durationSeconds) || request.duration / scenes.length), 0);
      if (Math.abs(durationTotal - request.duration) > 0.5) {
        const factor = request.duration / durationTotal;
        scenes.forEach((scene) => { scene.durationSeconds = (Number(scene.durationSeconds) || request.duration / scenes.length) * factor; });
      }
      const cumulative = [];
      durationTotal = 0;
      scenes.forEach((scene) => { durationTotal += Number(scene.durationSeconds) || request.duration / scenes.length; cumulative.push(durationTotal); });
      const frequencyData = new Uint8Array(128);
      const analyser = audioContext && master ? audioContext.createAnalyser() : null;
      if (analyser) { analyser.fftSize = 256; master.connect(analyser); analyser.connect(audioDestination); }
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error('The video encoder stopped unexpectedly.'));
      recorder.onstop = () => resolve();
      const draw = (now) => {
        const progress = Math.min((now - startAt) / (request.duration * 1000), 1);
        const elapsed = progress * request.duration;
        let sceneIndex = cumulative.findIndex((edge) => elapsed < edge);
        if (sceneIndex < 0) sceneIndex = scenes.length - 1;
        let amplitude = 0;
        if (analyser) {
          analyser.getByteTimeDomainData(frequencyData);
          for (const value of frequencyData) amplitude += Math.abs(value - 128) / 128;
          amplitude /= frequencyData.length;
        }
        drawMotionFrame(context, canvas.width, canvas.height, progress, scenes[sceneIndex], sceneIndex, state.plan, request, random, amplitude);
        if (progress < 1) animationFrame = requestAnimationFrame(draw);
        else if (recorder.state === 'recording') recorder.stop();
      };
      try {
        recorder.start(1000);
        startAt = performance.now();
        if (audioContext) {
          const audioStart = audioContext.currentTime + 0.08;
          if (musicSource) musicSource.start(audioStart);
          if (narrationSource) narrationSource.start(audioStart);
        }
        animationFrame = requestAnimationFrame(draw);
      } catch (error) {
        cancelAnimationFrame(animationFrame);
        reject(error);
      }
    });
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) throw new Error('The browser produced an empty video file.');
    return blob;
  } finally {
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    if (audioDestination) audioDestination.stream.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => {});
  }
}

async function uploadToYouTube(blob) {
  const isMusic = state.type === 'music-video';
  const metadata = {
    snippet: {
      title: $('preview-title').textContent.slice(0, 100),
      description: 'Created with Sonora. Review the video preview in the app before uploading. Visuals are motion graphics assembled from the creative brief.',
      categoryId: isMusic ? '10' : '22',
    },
    status: { privacyStatus: 'private' },
  };
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type, 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(metadata),
  });
  if (!init.ok) { const error = await init.json().catch(() => ({})); throw new Error(error.error?.message || `YouTube upload could not start (${init.status}).`); }
  const location = init.headers.get('Location');
  if (!location) throw new Error('YouTube did not return an upload URL.');
  const upload = await fetch(location, { method: 'PUT', headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': blob.type }, body: blob });
  const result = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(result.error?.message || `YouTube upload failed (${upload.status}).`);
  return result;
}

async function buildClickHandler() {
  const button = $('generate-button');
  if (state.job?.status === 'ready' && state.plan && state.jobAssets) {
    button.disabled = true;
    button.textContent = 'Rendering your video…';
    $('draft-pill').textContent = 'RENDERING';
    setBuildPhase(5, 'Phase 4/5 · Rendering motion graphics', `${state.duration} seconds · keep this tab open`);
    try {
      const request = state.request || currentRequest();
      state.videoBlob = await renderVideo(request);
      state.generated = true;
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(state.videoBlob);
      const video = $('preview-video');
      video.src = state.previewUrl;
      video.classList.add('ready');
      $('visual-preview').classList.add('has-video');
      $('download-video').href = state.previewUrl;
      $('download-video').download = `sonora-${request.type}-${request.duration}s.webm`;
      $('download-video').hidden = false;
      $('draft-pill').textContent = 'PREVIEW READY';
      $('draft-pill').title = 'The video contains the generated soundtrack and locally rendered motion graphics. Play it before upload.';
      setBuildPhase(6, 'Phase 5/5 · Preview ready', `${Math.round(state.videoBlob.size / 1024 / 1024 * 10) / 10} MB · play it above before upload`);
      updatePublishButton();
      button.disabled = false;
      button.textContent = 'Create a different video';
      state.job = null;
    } catch (error) {
      $('draft-pill').textContent = 'RENDER FAILED';
      $('draft-pill').title = error.message;
      setBuildPhase(0, 'Video render stopped', error.message);
      button.disabled = false;
      button.textContent = 'Retry video render';
    }
    return;
  }
  const request = currentRequest();
  if (!request.input) {
    $('brief-text').focus();
    $('draft-pill').textContent = 'ADD AN IDEA';
    setBuildPhase(0, 'Waiting for your idea', 'Describe the video you want to make.');
    return;
  }
  await startGeneration(request);
}

$('generate-button').addEventListener('click', buildClickHandler);

$('download-plan').addEventListener('click', () => {
  if (!state.plan) return;
  const plan = state.plan;
  const lines = [
    `# ${plan.title || 'Sonora treatment'}`, '', plan.subtitle || '', '',
    `## Treatment\n${plan.treatment || ''}`, `## Visual language\n${plan.visualStyle || ''}`,
    `## Sound plan\n${plan.audioDirection || ''}`,
    `## Voice & captions\n${[plan.narration, plan.captions].filter(Boolean).join('\n')}`,
    '## Scenes', ...(plan.scenes || []).flatMap((scene, index) => [`### ${index + 1}. ${scene.title} (${scene.durationSeconds || '?'}s)`, scene.description || '', scene.audioCue || '']),
    '', 'Planning note: this treatment does not represent generated footage. The finished preview uses locally rendered motion graphics.',
  ];
  const file = new Blob([lines.join('\n\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = url; link.download = 'sonora-treatment.md'; link.click();
  URL.revokeObjectURL(url);
});

$('publish-button').addEventListener('click', async () => {
  if ($('publish-button').dataset.done === 'true') return;
  if (!state.connected || !state.generated || !state.videoBlob) return;
  const button = $('publish-button');
  button.disabled = true; button.textContent = 'Uploading private video…'; $('draft-pill').textContent = 'UPLOADING';
  try {
    const result = await uploadToYouTube(state.videoBlob);
    const videoId = result.id;
    if (!videoId) throw new Error('YouTube did not confirm the uploaded video.');
    $('draft-pill').textContent = 'UPLOADED PRIVATELY';
    button.textContent = 'Open private YouTube video ↗'; button.disabled = false; button.dataset.done = 'true';
    button.onclick = () => window.open(`https://youtu.be/${videoId}`, '_blank', 'noopener');
  } catch (error) {
    $('draft-pill').textContent = 'UPLOAD FAILED'; $('draft-pill').title = error.message;
    button.textContent = 'Retry private upload ↗'; button.disabled = false;
    $('build-status').textContent = `Upload failed: ${error.message}`;
  }
});

selectCreationType(state.type);
updatePublishButton();
checkRenderer();
