export class AudioManager {
  private ctx: AudioContext | null = null

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // ignore
      })
    }
    return this.ctx
  }

  /** Plays a simple synthesized tone (no external audio files required). */
  playTone(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ensureCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.value = 0.15
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  }

  hitSound(): void {
    this.playTone(880, 0.15, 'triangle')
  }

  revealSound(): void {
    this.playTone(523, 0.2, 'sine')
  }

  teleportSound(): void {
    this.playTone(330, 0.3, 'square')
  }
}

