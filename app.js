const state = { mode: 'reference', format: 'short', connected: false, generated: false };

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
  if (!input) { (state.mode === 'reference' ? $('source-input') : $('brief-text')).focus(); return; }
  button.disabled = true;
  button.innerHTML = '<span class="button-icon">◌</span> Building your visual world…';
  try {
    const result = await requestAnalysis(input);
    $('preview-title').textContent = result.title || 'Neon after rain';
    $('preview-subtitle').textContent = result.subtitle || 'A cinematic study in motion & light';
    $('draft-pill').textContent = 'DRAFT 02';
    if (Array.isArray(result.scenes) && result.scenes.length) $('scene-list').innerHTML = result.scenes.map((scene, index) => `<article class="scene"><span class="scene-number">0${index + 1} / 04</span><strong>${scene.title}</strong><p>${scene.description}</p></article>`).join('');
    state.generated = true;
  } catch (error) {
    $('draft-pill').textContent = 'DEMO MODE';
    $('draft-pill').title = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});

$('connect-button').addEventListener('click', () => {
  $('connect-button').textContent = 'OAuth setup required ↗';
  $('connect-button').title = 'YouTube OAuth is not configured in this GitHub Pages demo. No Google account has been connected.';
});

$('publish-button').addEventListener('click', () => {
  if (!state.connected) return;
  $('publish-button').textContent = 'Upload queued · Demo mode';
  $('publish-button').style.color = 'var(--accent)';
});

$('play-button').addEventListener('click', (event) => {
  event.currentTarget.textContent = event.currentTarget.textContent === '▶' ? 'Ⅱ' : '▶';
});

renderScenes();
