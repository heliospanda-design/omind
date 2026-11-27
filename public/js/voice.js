/**
 * Omind v5 — Walkie-Talkie PTT & Spatial Point-and-Talk Voice Capture (FR-02)
 * Uses Web Speech API (`zh-CN`) when available, with seamless simulated/editable fallback.
 */

class VoiceSessionController {
  constructor() {
    this.recognition = null;
    this.active = false;
    this.startedAt = 0;
    this.transcript = '';
    this.onInterim = null;
  }

  start({ onInterim } = {}) {
    this.stop();
    this.active = true;
    this.startedAt = Date.now();
    this.transcript = '';
    this.onInterim = onInterim || null;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'zh-CN';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event) => {
          let buf = '';
          for (let i = 0; i < event.results.length; i += 1) {
            buf += event.results[i][0].transcript;
          }
          this.transcript = buf.trim();
          this.onInterim?.(this.transcript);
        };
        rec.onerror = () => {
          // Keep session open so user can click "填入示例语音" or finish gracefully
        };
        rec.start();
        this.recognition = rec;
      } catch {
        this.recognition = null;
      }
    }
  }

  injectSimulatedText(sampleText) {
    this.transcript = sampleText;
    this.onInterim?.(this.transcript);
  }

  finish() {
    const durationMs = Math.max(800, Date.now() - this.startedAt);
    const text = this.transcript.trim();
    this.stop();
    return { text, durationMs };
  }

  stop() {
    this.active = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
  }
}

export const voiceController = new VoiceSessionController();
