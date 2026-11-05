// Redoble de tambores sintetizado con Web Audio (no requiere archivos externos).
export default class MouthDrums {
    constructor() {
        this.context = null;
        this.enabled = false;
        this.lastPlayedAt = 0;
        this.onUnlock = () => this.unlock();
        window.addEventListener("pointerdown", this.onUnlock, { passive: true });
        window.addEventListener("keydown", this.onUnlock);
    }

    async unlock() {
        if (this.enabled) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn("Este navegador no soporta Web Audio.");
            return;
        }
        this.context ||= new AudioContextClass();
        try {
            await this.context.resume();
            this.enabled = this.context.state === "running";
            if (this.enabled) {
                window.removeEventListener("pointerdown", this.onUnlock);
                window.removeEventListener("keydown", this.onUnlock);
                console.info("Sonido de tambores activado.");
            }
        } catch (error) {
            console.warn("No se pudo activar el audio:", error);
        }
    }

    play() {
        if (!this.enabled || !this.context || this.context.state !== "running") return;
        const now = this.context.currentTime;
        // Evita dobles disparos por pequeñas oscilaciones del detector.
        if (now - this.lastPlayedAt < 0.45) return;
        this.lastPlayedAt = now;

        // Redoble corto de cinco golpes de tom grave, con caída de tono y volumen.
        const hits = [0, 0.105, 0.205, 0.300, 0.390, 0.475];
        hits.forEach((offset, index) => {
            const start = now + offset;
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            const filter = this.context.createBiquadFilter();
            osc.type = "sine";
            osc.frequency.setValueAtTime(118 - index * 7, start);
            osc.frequency.exponentialRampToValueAtTime(48, start + 0.16);
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(520, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.42 - index * 0.035, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.context.destination);
            osc.start(start);
            osc.stop(start + 0.2);
        });
    }

    dispose() {
        window.removeEventListener("pointerdown", this.onUnlock);
        window.removeEventListener("keydown", this.onUnlock);
        this.context?.close();
    }
}
