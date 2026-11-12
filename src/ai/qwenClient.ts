/**
 * Browser side of the private Qwen relay integration. Only mounted after explicit
 * user consent and when VITE_ASR_RELAY_URL is set at build time.
 */
export interface RelayOptions {
  url: string;
  accessCode: string;
  language: string;
  onReady: (provider: string) => void;
  onFinal: (text: string, language: string) => void;
  onPartial: (text: string) => void;
  onError: (message: string) => void;
}

function upstreamLanguage(locale: string): string {
  if (locale.startsWith("zh")) return "zh";
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("es")) return "es";
  if (locale.startsWith("fr")) return "fr";
  return "auto";
}

export function startRelayRecognition(opts: RelayOptions): () => void {
  let disposed = false;
  let started = false;
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let worklet: AudioWorkletNode | null = null;
  let sink: GainNode | null = null;
  const socket = new WebSocket(opts.url);
  socket.binaryType = "arraybuffer";

  async function startMic() {
    if (disposed || started) return;
    started = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
      });
      if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
      context = new AudioContext();
      await context.audioWorklet.addModule("/pcm16-worklet.js");
      if (disposed || socket.readyState !== WebSocket.OPEN) return;
      source = context.createMediaStreamSource(stream);
      worklet = new AudioWorkletNode(context, "ticktock-pcm16");
      sink = context.createGain();
      sink.gain.value = 0;
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (!disposed && socket.readyState === WebSocket.OPEN && event.data instanceof ArrayBuffer) {
          socket.send(event.data);
        }
      };
      source.connect(worklet);
      worklet.connect(sink);
      sink.connect(context.destination);
      await context.resume();
      opts.onReady("Qwen relay");
    } catch (error) {
      opts.onError(error instanceof Error && error.name === "NotAllowedError"
        ? "Microphone access was denied."
        : "Microphone audio capture is unavailable. The timer still works.");
    }
  }

  socket.onopen = () => {
    if (!disposed) socket.send(JSON.stringify({
      type: "start",
      accessCode: opts.accessCode,
      language: upstreamLanguage(opts.language),
    }));
  };
  socket.onmessage = (event) => {
    if (disposed) return;
    let message: { type?: string; text?: string; language?: string; provider?: string; message?: string };
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.type === "ready") void startMic();
    if (message.type === "partial") opts.onPartial(message.text ?? "");
    if (message.type === "final") {
      if (message.text?.trim()) {
        const text = message.text.trim();
        const detected = message.language === "zh" || message.language === "yue" ? "zh-CN"
          : message.language === "en" ? "en-US"
          : message.language === "fr" ? "fr-FR"
          : message.language === "es" ? "es-ES" : "";
        const locale = opts.language === "auto"
          ? (detected || ((text.match(/\p{Script=Han}/gu) ?? []).length >= 4 ? "zh-CN" : "en-US"))
          : opts.language;
        opts.onFinal(text,locale);
      }
      opts.onPartial("");
    }
    if (message.type === "error") opts.onError(message.message ?? "Speech service failed.");
  };
  socket.onerror = () => { if (!disposed) opts.onError("Could not connect to the speech relay."); };
  socket.onclose = () => { if (!disposed) opts.onError("Speech relay disconnected. The timer still works."); };

  return () => {
    disposed = true;
    socket.onclose = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.close();
    if (worklet) worklet.port.onmessage = null;
    source?.disconnect();worklet?.disconnect();sink?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context) void context.close();
  };
}
