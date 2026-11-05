// Percusion sintetizada con Web Audio. Se activa con el boton de la interfaz.
export default class MouthDrums {
    constructor() {
        this.context = null;
        this.enabled = false;
        this.lastPlayedAt = -Infinity;
    }

    async unlock() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn("Este navegador no soporta Web Audio.");
            return false;
        }
        try {
            this.context ||= new AudioContextClass();
            if (this.context.state !== "running") await this.context.resume();
            this.enabled = this.context.state === "running";
            if (this.enabled) {
                // Reproduce un redoble de prueba dentro del gesto del usuario.
                // Así confirmamos que Web Audio quedó desbloqueado antes de detectar la boca.
                this.lastPlayedAt = -Infinity;
                this.play();
            }
            return this.enabled;
        } catch (error) {
            console.error("No se pudo activar el audio:", error);
            return false;
        }
    }

    play() {
        if (!this.enabled || !this.context || this.context.state !== "running") return false;
        const now = this.context.currentTime;
        if (now - this.lastPlayedAt < 0.55) return false;
        this.lastPlayedAt = now;

        // Buffer de ruido corto para el golpe de parche + tono grave para el cuerpo del tambor.
        const duration = 0.22;
        const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * duration), this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            const fade = Math.exp(-i / (this.context.sampleRate * 0.045));
            data[i] = (Math.random() * 2 - 1) * fade;
        }

        [0, 0.105, 0.205, 0.305, 0.405, 0.505].forEach((offset, index) => {
            const start = now + offset;
            const volume = 0.72 - index * 0.075;

            const noise = this.context.createBufferSource();
            noise.buffer = buffer;
            const noiseFilter = this.context.createBiquadFilter();
            noiseFilter.type = "bandpass";
            noiseFilter.frequency.value = 850 + index * 90;
            noiseFilter.Q.value = 0.8;
            const noiseGain = this.context.createGain();
            noiseGain.gain.setValueAtTime(0.0001, start);
            noiseGain.gain.exponentialRampToValueAtTime(volume * 0.42, start + 0.004);
            noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(this.context.destination);
            noise.start(start);
            noise.stop(start + 0.14);

            const drum = this.context.createOscillator();
            const drumGain = this.context.createGain();
            drum.type = "sine";
            drum.frequency.setValueAtTime(105 - index * 5, start);
            drum.frequency.exponentialRampToValueAtTime(42, start + 0.17);
            drumGain.gain.setValueAtTime(0.0001, start);
            drumGain.gain.exponentialRampToValueAtTime(volume * 0.8, start + 0.006);
            drumGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
            drum.connect(drumGain);
            drumGain.connect(this.context.destination);
            drum.start(start);
            drum.stop(start + 0.21);
        });
        return true;
    }

    dispose() {
        this.context?.close();
        this.enabled = false;
    }
}
