import workletURL from "./pcm-worklet.js?url";

const MAX_SECONDS = 30;
const FLUSH_TIMEOUT_MS = 3000;

function canceledError() {
  return new DOMException("Recording was canceled.", "AbortError");
}

function captureError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return new Error("Microphone access was denied. Allow microphone access in your browser, then try again.", { cause: error });
    case "NotFoundError":
      return new Error("No microphone was found. Connect a microphone and try again.", { cause: error });
    case "NotReadableError":
      return new Error("Your microphone could not be opened. Check whether another application is using it.", { cause: error });
    default:
      return error instanceof Error ? error : new Error("The microphone could not start.");
  }
}

export class VoiceRecorder {
  constructor({ onLevel, onSpeechStart, onSpeechEnd, onLimit, onError } = {}) {
    this.onLevel = onLevel;
    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;
    this.onLimit = onLimit;
    this.onError = onError;
    this.session = null;
  }

  start() {
    const previous = this.session;
    if (previous && !previous.closed && !previous.cancelled) {
      if (previous.stopping) {
        return Promise.reject(new Error("The previous recording is still finishing."));
      }
      return previous.startPromise;
    }

    const session = {
      cancelled: false,
      closed: false,
      started: false,
      stopping: false,
      captureEnded: false,
      speechStarted: false,
      failure: null,
      context: null,
      stream: null,
      source: null,
      analyser: null,
      node: null,
      chunks: [],
      sampleCount: 0,
      frame: null,
      trackListeners: [],
      stateListener: null,
      processorListener: null,
      resolveFlush: null,
      rejectFlush: null,
      flushTimer: null,
      stopPromise: null,
      closePromise: null,
    };
    session.cancelSignal = new Promise((resolve) => {
      session.signalCancellation = resolve;
    });
    this.session = session;
    session.startPromise = this.startSession(session);
    return session.startPromise;
  }

  stop() {
    const session = this.session;
    if (!session || session.cancelled) return Promise.resolve(null);
    if (!session.stopPromise) {
      session.stopping = true;
      this.stopAnimation(session);
      session.stopPromise = this.stopSession(session);
    }
    return session.stopPromise;
  }

  async cancel() {
    const session = this.session;
    if (!session || session.cancelled) return;
    session.cancelled = true;
    session.signalCancellation();
    session.rejectFlush?.(canceledError());
    session.chunks = [];
    session.sampleCount = 0;
    await this.release(session);
  }

  assertActive(session) {
    if (session.cancelled || session.closed || this.session !== session) {
      throw canceledError();
    }
  }

  async startSession(session) {
    try {
      if (!globalThis.isSecureContext) {
        throw new Error("Microphone recording requires HTTPS or localhost. Open this app over a secure connection.");
      }
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass || !globalThis.AudioWorkletNode) {
        throw new Error("This browser does not support microphone recording with AudioWorklet. Use an up-to-date Chrome, Edge, Firefox, or Safari.");
      }

      let context;
      try {
        context = new AudioContextClass({ sampleRate: 16000 });
      } catch (error) {
        // Some devices only accept their native rate; it is converted before export.
        if (error.name !== "NotSupportedError") throw error;
        context = new AudioContextClass();
      }
      session.context = context;
      session.maximumSamples = Math.floor(context.sampleRate * MAX_SECONDS);
      if (!context.audioWorklet) {
        throw new Error("AudioWorklet is unavailable. Use an up-to-date browser over HTTPS or localhost.");
      }

      // All promises have handlers before they can settle. A late permission grant
      // after cancellation is stopped here instead of becoming an orphaned stream.
      const ready = Promise.all([
        Promise.resolve().then(() => {
          this.assertActive(session);
          return context.resume();
        }),
        Promise.resolve().then(() => {
          this.assertActive(session);
          return context.audioWorklet.addModule(workletURL);
        }),
        Promise.resolve().then(() => {
          this.assertActive(session);
          return navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: { ideal: 1 },
              sampleRate: { ideal: 16000 },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        }).then((stream) => {
          if (session.cancelled || session.closed || this.session !== session) {
            for (const track of stream.getTracks()) track.stop();
            throw canceledError();
          }
          session.stream = stream;
          return stream;
        }),
      ]);
      await Promise.race([
        ready,
        session.cancelSignal.then(() => { throw canceledError(); }),
      ]);
      this.assertActive(session);
      if (context.state !== "running") {
        throw new Error("The browser could not start audio capture. Return to this tab and press Start again.");
      }
      const tracks = session.stream.getAudioTracks();
      if (!tracks.length || tracks.some((track) => track.readyState !== "live")) {
        throw new Error("The microphone disconnected before recording could start.");
      }

      const node = new AudioWorkletNode(context, "pcm-recorder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
      });
      session.node = node;
      node.port.onmessage = ({ data }) => this.handleMessage(session, data);
      node.port.onmessageerror = () => this.interrupt(session, new Error("The browser could not read the microphone recording."));
      session.processorListener = () => this.interrupt(session, new Error("The audio recording engine stopped unexpectedly. Please start a new recording."));
      node.addEventListener("processorerror", session.processorListener);

      session.source = context.createMediaStreamSource(session.stream);
      session.analyser = context.createAnalyser();
      session.analyser.fftSize = 1024;
      session.waveform = new Uint8Array(session.analyser.fftSize);
      session.source.connect(session.analyser);
      session.analyser.connect(node);
      node.connect(context.destination);

      for (const track of tracks) {
        const ended = () => this.interrupt(session, new Error("The microphone disconnected. Reconnect it and start a new recording."));
        track.addEventListener("ended", ended);
        session.trackListeners.push([track, ended]);
      }
      session.stateListener = () => {
        if (context.state !== "running") {
          this.interrupt(session, new Error("Audio capture was interrupted by the browser or device. Return to this tab and start a new recording."));
        }
      };
      context.addEventListener("statechange", session.stateListener);
      session.started = true;
      this.startAnimation(session);
    } catch (error) {
      try {
        await this.release(session);
      } catch {
        // Preserve the original setup failure; all microphone tracks are stopped.
      }
      if (session.cancelled) throw canceledError();
      throw captureError(error);
    }
  }

  handleMessage(session, data) {
    if (session.cancelled || session.closed) return;
    if (data.type === "speech-start" && !session.speechStarted) {
      session.speechStarted = true;
      this.onSpeechStart?.();
      return;
    }
    if (data.type === "samples") {
      const remaining = session.maximumSamples - session.sampleCount;
      if (!(data.buffer instanceof ArrayBuffer) || !Number.isInteger(data.length) || data.length <= 0 || data.length > remaining || data.length * 4 > data.buffer.byteLength) {
        this.interrupt(session, new Error("The browser returned an invalid microphone recording. Please try again."));
        return;
      }
      session.chunks.push(new Float32Array(data.buffer, 0, data.length));
      session.sampleCount += data.length;
    } else if (data.type === "stopped") {
      if (data.samples !== session.sampleCount) {
        session.rejectFlush?.(new Error("The browser could not finish the recording without losing audio. Please record again."));
      } else {
        session.resolveFlush?.();
      }
    } else if ((data.type === "speech-end" || data.type === "limit") && !session.captureEnded) {
      session.captureEnded = true;
      this.stopAnimation(session);
      this.stopTracks(session);
      if (data.type === "speech-end") this.onSpeechEnd?.();
      else this.onLimit?.();
    }
  }

  startAnimation(session) {
    if (!this.onLevel) return;
    const frame = () => {
      if (session.closed || session.cancelled || session.stopping || session.captureEnded) return;
      // Schedule first so a consumer callback cannot strand an active capture.
      session.frame = requestAnimationFrame(frame);
      session.analyser.getByteTimeDomainData(session.waveform);
      this.onLevel(session.waveform);
    };
    session.frame = requestAnimationFrame(frame);
  }

  stopAnimation(session) {
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = null;
  }

  stopTracks(session) {
    for (const track of session.stream?.getTracks() || []) track.stop();
  }

  interrupt(session, error) {
    if (session.cancelled || session.closed || session.stopping || session.failure) return;
    session.failure = error;
    session.rejectFlush?.(error);
    // Retain the error for stop(), while releasing the device immediately even
    // when the consumer has not yet reacted to onError.
    void this.release(session).catch(() => {});
    this.onError?.(error);
  }

  async flush(session) {
    const flushed = new Promise((resolve, reject) => {
      session.resolveFlush = resolve;
      session.rejectFlush = reject;
      session.flushTimer = setTimeout(() => {
        reject(new Error("The audio recording engine did not finish responding. Please start a new recording."));
      }, FLUSH_TIMEOUT_MS);
    });
    try {
      session.node.port.postMessage({ type: "stop" });
      await flushed;
    } finally {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
      session.resolveFlush = null;
      session.rejectFlush = null;
    }
  }

  async stopSession(session) {
    try {
      await session.startPromise;
      if (session.cancelled) return null;
      if (session.failure) throw session.failure;
      this.stopTracks(session);
      await this.flush(session);
      if (session.cancelled) return null;
      if (session.failure) throw session.failure;
      // The final PCM message and acknowledgement precede closing the context.
      await this.release(session);
      if (session.cancelled) return null;
      const blob = await encodeWav(session.chunks, session.sampleCount, session.context.sampleRate);
      return session.cancelled ? null : blob;
    } catch (error) {
      if (session.cancelled) return null;
      throw error;
    } finally {
      session.chunks = [];
      await this.release(session);
    }
  }

  release(session) {
    if (session.closePromise) return session.closePromise;
    session.closed = true;
    this.stopAnimation(session);
    this.stopTracks(session);
    for (const [track, listener] of session.trackListeners) {
      track.removeEventListener("ended", listener);
    }
    session.trackListeners = [];
    if (session.stateListener) {
      session.context.removeEventListener("statechange", session.stateListener);
    }
    if (session.node) {
      session.node.port.onmessage = null;
      session.node.port.onmessageerror = null;
      session.node.removeEventListener("processorerror", session.processorListener);
      session.node.port.close();
    }
    session.source?.disconnect();
    session.analyser?.disconnect();
    session.node?.disconnect();
    session.closePromise = session.context && session.context.state !== "closed"
      ? session.context.close()
      : Promise.resolve();
    return session.closePromise;
  }
}

async function encodeWav(chunks, sampleCount, inputRate) {
  if (!sampleCount) {
    throw new Error("No audio was captured. Press Start and speak for a moment before stopping.");
  }

  let samples = chunks;
  let sampleRate = inputRate;
  let outputCount = sampleCount;
  if (inputRate > 16000) {
    const OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OfflineContext) {
      throw new Error("This browser cannot convert the microphone sample rate to WAV. Use an up-to-date browser.");
    }
    sampleRate = 16000;
    outputCount = Math.max(1, Math.floor(sampleCount * sampleRate / inputRate));
    const renderer = new OfflineContext(1, outputCount, sampleRate);
    const input = renderer.createBuffer(1, sampleCount, inputRate);
    const channel = input.getChannelData(0);
    let offset = 0;
    for (const chunk of chunks) {
      channel.set(chunk, offset);
      offset += chunk.length;
    }
    const source = renderer.createBufferSource();
    source.buffer = input;
    source.connect(renderer.destination);
    source.start();
    try {
      const rendered = await renderer.startRendering();
      samples = [rendered.getChannelData(0)];
    } finally {
      source.disconnect();
      source.buffer = null;
    }
  }

  const buffer = new ArrayBuffer(44 + outputCount * 2);
  const view = new DataView(buffer);
  const ascii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + outputCount * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, outputCount * 2, true);
  let offset = 44;
  for (const chunk of samples) {
    for (let index = 0; index < chunk.length; index += 1) {
      const value = Math.max(-1, Math.min(1, chunk[index]));
      view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
