const CHUNK_SAMPLES = 4096;
const MAX_SECONDS = 30;
const SILENCE_SECONDS = 1.2;
const MIN_VOICE_SECONDS = 0.16;
const PRE_ROLL_SECONDS = 0.4;

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.maximumSamples = Math.floor(sampleRate * MAX_SECONDS);
    this.silenceLimit = Math.ceil(sampleRate * SILENCE_SECONDS);
    this.minimumVoice = Math.ceil(sampleRate * MIN_VOICE_SECONDS);
    this.preRoll = new Float32Array(Math.ceil(sampleRate * PRE_ROLL_SECONDS));
    this.preRollOffset = 0;
    this.preRollCount = 0;
    this.candidateVoice = 0;
    this.candidateGap = 0;
    this.noiseFloor = 0.002;
    this.silenceSamples = 0;
    this.totalSamples = 0;
    this.buffer = null;
    this.bufferLength = 0;
    this.speechStarted = false;
    this.recording = true;

    this.port.onmessage = ({ data }) => {
      if (data.type !== "stop") return;
      this.recording = false;
      this.flush();
      this.port.postMessage({ type: "stopped", samples: this.totalSamples });
    };
  }

  flush() {
    if (this.bufferLength === 0) return;
    this.port.postMessage(
      { type: "samples", buffer: this.buffer.buffer, length: this.bufferLength },
      [this.buffer.buffer],
    );
    this.buffer = null;
    this.bufferLength = 0;
  }

  append(sample) {
    if (!this.buffer) this.buffer = new Float32Array(CHUNK_SAMPLES);
    this.buffer[this.bufferLength++] = sample;
    this.totalSamples += 1;
    if (this.bufferLength === CHUNK_SAMPLES) this.flush();
  }

  beginSpeech() {
    this.speechStarted = true;
    this.port.postMessage({ type: "speech-start" });
    // Preserve the onset while rejecting brief clicks and leading silence.
    const first = (this.preRollOffset - this.preRollCount + this.preRoll.length) % this.preRoll.length;
    for (let i = 0; i < this.preRollCount; i += 1) {
      this.append(this.preRoll[(first + i) % this.preRoll.length]);
    }
  }

  finish(type) {
    this.recording = false;
    this.flush();
    this.port.postMessage({ type, samples: this.totalSamples });
  }

  process(inputs) {
    // The node requests one downmixed channel; output stays silent to avoid echo.
    if (!this.recording) return true;
    const samples = inputs[0]?.[0];
    if (!samples?.length) return true;

    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / samples.length);

    if (!this.speechStarted) {
      const threshold = Math.max(0.012, this.noiseFloor * 3);
      if (rms >= threshold) {
        this.candidateVoice += samples.length;
        this.candidateGap = 0;
      } else {
        this.candidateGap += samples.length;
        if (this.candidateGap > sampleRate * 0.2) this.candidateVoice = 0;
        this.noiseFloor = Math.min(0.01, this.noiseFloor * 0.98 + rms * 0.02);
      }
      for (const sample of samples) {
        this.preRoll[this.preRollOffset] = sample;
        this.preRollOffset = (this.preRollOffset + 1) % this.preRoll.length;
        this.preRollCount = Math.min(this.preRollCount + 1, this.preRoll.length);
      }
      if (this.candidateVoice >= this.minimumVoice) this.beginSpeech();
      return true;
    }

    const frames = Math.min(samples.length, this.maximumSamples - this.totalSamples);
    for (let i = 0; i < frames; i += 1) this.append(samples[i]);
    if (this.totalSamples === this.maximumSamples) {
      this.finish("limit");
      return true;
    }

    const threshold = Math.max(0.008, this.noiseFloor * 2);
    this.silenceSamples = rms >= threshold ? 0 : this.silenceSamples + frames;
    if (this.silenceSamples >= this.silenceLimit) this.finish("speech-end");
    // Keep the port alive until stop() acknowledges the final PCM buffer.
    return true;
  }
}

registerProcessor("pcm-recorder", PCMRecorderProcessor);
