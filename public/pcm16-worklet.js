/**
 * 16 kHz mono PCM16 chunks (100 ms) for the Qwen WebSocket relay.
 * This AudioWorklet never uploads or stores audio by itself.
 */
class TickTockPCM16 extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.output = new Int16Array(1600);
    this.pos = 0;
  }
  process(inputs, outputs) {
    const samples = inputs[0]?.[0];
    if (samples) {
      for (let i = 0; i < samples.length; i++) {
        this.sum += samples[i];
        this.count++;
        this.phase++;
        if (this.phase >= this.ratio) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.count));
          this.output[this.pos++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          this.phase -= this.ratio;
          this.sum = 0;
          this.count = 0;
          if (this.pos >= 1600) {
            const bytes = this.output.buffer.slice(0);
            this.port.postMessage(bytes, [bytes]);
            this.pos = 0;
          }
        }
      }
    }
    for(const channel of outputs[0] || []) channel.fill(0);
    return true;
  }
}
registerProcessor("ticktock-pcm16", TickTockPCM16);
