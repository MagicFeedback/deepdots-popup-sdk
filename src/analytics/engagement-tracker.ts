/**
 * Mide el tiempo ACTIVO (en primer plano), estilo GA4 (engagement time).
 * Acumula mientras está "resumed" (pestaña visible / app en foreground) y pausa en
 * background. `consume()` devuelve los ms activos desde la última lectura y reinicia,
 * dejando el timer corriendo. El consumidor emite un evento `user_engagement` con
 * `engagement_time_msec`; el backend lo suma por sesión → "Average Time Spent per Session" (#8).
 */
export class EngagementTracker {
  private now: () => number;
  private activeMs = 0;
  private lastResumeAt: number | null = null;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** Reanuda el conteo (pestaña visible / app en foreground). Idempotente. */
  resume(): void {
    if (this.lastResumeAt === null) this.lastResumeAt = this.now();
  }

  /** Pausa el conteo (pestaña oculta / app en background), acumulando el tramo activo. */
  pause(): void {
    if (this.lastResumeAt !== null) {
      this.activeMs += this.now() - this.lastResumeAt;
      this.lastResumeAt = null;
    }
  }

  /** Devuelve los ms activos acumulados desde la última lectura y reinicia (sin parar el timer). */
  consume(): number {
    if (this.lastResumeAt !== null) {
      const t = this.now();
      this.activeMs += t - this.lastResumeAt;
      this.lastResumeAt = t;
    }
    const ms = this.activeMs;
    this.activeMs = 0;
    return ms;
  }

  isActive(): boolean {
    return this.lastResumeAt !== null;
  }
}
