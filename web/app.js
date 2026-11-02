import { VoiceRecorder } from './recorder.js';

const grid = document.querySelector('#persona-grid');
const personaButtons = [...grid.querySelectorAll('[data-persona]')];
const recordButton = document.querySelector('#record-button');
const recordLabel = document.querySelector('#record-label');
const selectedName = document.querySelector('#selected-name');
const recordingHint = document.querySelector('#recording-limit');
const panel = document.querySelector('#recording-panel');
const canvas = document.querySelector('#waveform');
const waveformState = document.querySelector('#waveform-state');
const connection = document.querySelector('#connection-status');
const drawing = canvas.getContext('2d');
const idleSamples = new Uint8Array(256).fill(128);

let selected = personaButtons.find(button => button.getAttribute('aria-checked') === 'true') || personaButtons[0];
let state = 'idle';
let replySamples;
let replySampleRate;
let playbackFrame;
let playbackContext;
let replySource;
let playbackStartedAt;
let speechStarted = false;
let turnId = 0;
const playbackSamples = new Uint8Array(256);
let requestController;
let leaving = false;

function paintWaveform(samples = idleSamples) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  if (!width || !height) return;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawing.clearRect(0, 0, width, height);
  drawing.strokeStyle = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#e2be7c';
  drawing.lineWidth = 2;
  drawing.lineCap = 'round';
  drawing.beginPath();
  for (let i = 0; i < samples.length; i += 1) {
    const x = (i / (samples.length - 1)) * width;
    const y = height / 2 + ((samples[i] - 128) / 128) * height * 0.43;
    if (i === 0) drawing.moveTo(x, y);
    else drawing.lineTo(x, y);
  }
  drawing.stroke();
}

function paintReplyWaveform() {
  if (state !== 'playing' || !playbackContext || !replySamples) return;
  const offset = Math.floor((playbackContext.currentTime - playbackStartedAt) * replySampleRate);
  for (let i = 0; i < playbackSamples.length; i += 1) {
    playbackSamples[i] = Math.round(128 + Math.max(-1, Math.min(1, replySamples[offset + i] || 0)) * 127);
  }
  paintWaveform(playbackSamples);
  playbackFrame = requestAnimationFrame(paintReplyWaveform);
}

function render(nextState, title, detail, error = false) {
  state = nextState;
  document.body.dataset.state = state;
  panel.dataset.state = state;
  recordingHint.textContent = error ? detail : 'Speak. Pause. Stop.';
  recordingHint.dataset.error = String(error);
  recordButton.title = `${title}. ${detail}`;
  if (state !== 'playing') cancelAnimationFrame(playbackFrame);
  const busy = state === 'requesting' || state === 'processing';
  recordButton.disabled = state === 'processing';
  recordButton.setAttribute('aria-busy', String(busy));
  recordButton.setAttribute('aria-pressed', String(['requesting', 'recording', 'playing'].includes(state)));
  recordLabel.textContent = {
    idle: 'Start talking',
    requesting: 'Stop',
    recording: 'Stop',
    processing: 'Creating your reply…',
    playing: 'Stop reply',
  }[state];
  waveformState.textContent = {
    idle: 'YOUR VOICE',
    requesting: 'YOUR VOICE',
    recording: speechStarted ? 'VOICE DETECTED' : 'LISTENING',
    processing: 'MAKING A LITTLE MAGIC',
    playing: 'THEIR VOICE',
  }[state];
  for (const button of personaButtons) button.disabled = state !== 'idle';
  if (state !== 'recording' && state !== 'playing') paintWaveform();
}

function selectPersona(button) {
  if (state !== 'idle') return;
  selected = button;
  for (const candidate of personaButtons) {
    const active = candidate === selected;
    candidate.setAttribute('aria-checked', String(active));
    candidate.tabIndex = active ? 0 : -1;
  }
  selectedName.textContent = selected.dataset.name;
}

for (const button of personaButtons) {
  button.addEventListener('click', () => selectPersona(button));
  button.addEventListener('keydown', event => {
    const directions = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
    let index;
    if (event.key in directions) {
      index = (personaButtons.indexOf(button) + directions[event.key] + personaButtons.length) % personaButtons.length;
    } else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = personaButtons.length - 1;
    else return;
    event.preventDefault();
    selectPersona(personaButtons[index]);
    selected.focus({ preventScroll: true });
    selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
selectPersona(selected);

function microphoneError(error) {
  const messages = {
    NotAllowedError: 'Microphone access was denied. Allow it in your browser’s site settings, then try again.',
    NotFoundError: 'No microphone was found. Connect a microphone and try again.',
    NotReadableError: 'Your microphone is unavailable. Check that another app is not using it.',
    SecurityError: 'Microphone access needs HTTPS or localhost. Open this page using a secure connection.',
  };
  return messages[error.name] || error.message || 'Something went wrong. Please try again.';
}

function showError(message) {
  render('idle', 'Let’s try that again', message, true);
}

const recorder = new VoiceRecorder({
  onLevel(samples) {
    if (state === 'recording') paintWaveform(samples);
  },
  onSpeechStart() {
    speechStarted = true;
    if (state === 'recording') {
      render('recording', 'Voice detected. Go ahead…', 'Pause for a moment to send automatically. Stop discards this recording.');
    }
  },
  onSpeechEnd() {
    if (state === 'recording') void finishRecording();
  },
  onLimit() {
    if (state === 'recording') void finishRecording();
  },
  onError(error) {
    void recorder.cancel();
    clearReply();
    if (!leaving) showError(microphoneError(error));
  },
});

function clearReply() {
  cancelAnimationFrame(playbackFrame);
  if (replySource) {
    replySource.onended = null;
    replySource.stop();
    replySource.disconnect();
    replySource = undefined;
  }
  replySamples = undefined;
  const context = playbackContext;
  playbackContext = undefined;
  if (context && context.state !== 'closed') void context.close();
}

async function startRecording() {
  const thisTurn = ++turnId;
  speechStarted = false;
  render('requesting', 'One little permission…', 'Allow microphone access to begin, or press Stop to cancel.');
  clearReply();
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser does not support voice conversations.');
    // Unlock playback in the Start gesture, before awaiting microphone or network access.
    playbackContext = new AudioContextClass();
    await Promise.all([playbackContext.resume(), recorder.start()]);
    if (leaving || thisTurn !== turnId) return;
    render('recording', `Listening for your voice, ${selected.dataset.name} is ready`, 'Start speaking. A short silence sends your turn automatically; Stop discards it.');
  } catch (error) {
    if (thisTurn !== turnId) return;
    await recorder.cancel();
    clearReply();
    if (!leaving) showError(microphoneError(error));
  }
}

async function cancelRecording() {
  ++turnId;
  const canceled = recorder.cancel();
  clearReply();
  render('idle', 'Recording stopped', 'Your captured audio was discarded and was not sent.');
  await canceled;
}

async function finishRecording() {
  if (state !== 'recording') return;
  const thisTurn = turnId;
  const persona = selected.dataset.persona;
  const name = selected.dataset.name;
  render('processing', `${name} is thinking…`, 'Turning your words into a reply. The microphone is off.');
  try {
    const audio = await recorder.stop();
    if (leaving || thisTurn !== turnId) return;
    if (!audio || audio.size <= 44) throw new Error('No speech was captured. Please try again.');
    const form = new FormData();
    form.append('audio_file', audio, 'recording.wav');
    form.append('persona', persona);
    form.append('language_code', 'indic-auto');
    requestController = new AbortController();
    const response = await fetch('/talk', { method: 'POST', body: form, signal: requestController.signal });
    if (!response.ok) {
      let message = `The request failed (${response.status}). Please try again.`;
      try {
        const body = await response.json();
        if (typeof body.detail === 'string') message = body.detail;
      } catch { /* Non-JSON server errors still get a useful status message. */ }
      throw new Error(message);
    }
    if (!response.headers.get('content-type')?.startsWith('audio/')) {
      throw new Error('The server did not return an audio reply. Please try again.');
    }
    const reply = await response.arrayBuffer();
    if (leaving || thisTurn !== turnId) return;
    const context = playbackContext;
    const decoded = await context.decodeAudioData(reply);
    await context.resume();
    if (leaving || thisTurn !== turnId) return;
    replySamples = decoded.getChannelData(0);
    replySampleRate = decoded.sampleRate;
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    source.onended = () => {
      if (leaving || thisTurn !== turnId) return;
      clearReply();
      render('idle', 'Your turn, whenever you’re ready', 'Press Start talking for a new conversation.');
    };
    playbackStartedAt = context.currentTime;
    source.start();
    replySource = source;
    render('playing', `${name} is speaking`, 'Press Stop reply to end playback. The microphone is off.');
    paintReplyWaveform();
  } catch (error) {
    if (thisTurn !== turnId) return;
    await recorder.cancel();
    clearReply();
    if (!leaving) {
      showError(error instanceof TypeError
        ? 'Could not reach the server. Check your connection and try again.'
        : microphoneError(error));
    }
  } finally {
    if (thisTurn === turnId) requestController = undefined;
  }
}

recordButton.addEventListener('click', () => {
  if (state === 'idle') void startRecording();
  else if (state === 'recording' || state === 'requesting') void cancelRecording();
  else if (state === 'playing') {
    clearReply();
    render('idle', 'Reply stopped', 'Press Start talking when you’re ready for another conversation.');
  }
});

new ResizeObserver(() => paintWaveform()).observe(canvas);
render('idle', 'Ready when you are', 'Your microphone stays off until you press start.');

async function checkHealth() {
  try {
    const response = await fetch('/health', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Unhealthy API');
    const result = await response.json();
    if (result.status !== 'ok') throw new Error('Unhealthy API');
    connection.textContent = 'API online';
    connection.dataset.state = 'online';
  } catch {
    connection.textContent = 'API offline';
    connection.dataset.state = 'offline';
  }
}
void checkHealth();

window.addEventListener('pagehide', () => {
  leaving = true;
  ++turnId;
  void recorder.cancel();
  requestController?.abort();
  clearReply();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    leaving = false;
    render('idle', 'Ready when you are', 'Your microphone stays off until you press start.');
    void checkHealth();
  }
});
