/**
 * Messaging (#18–22): tracking de notificaciones del host (push / in-app).
 * Un único evento reservado `deepdots_message` con un campo `stage` discriminador;
 * el funnel se correlaciona por `message_id` y se agrupa por `message_title`.
 */

export type MessageStage = 'delivered' | 'clicked' | 'converted';

/** Canales válidos. Un mensaje tiene UN canal: se valida en runtime porque el host puede no ser TS. */
export const MESSAGE_CHANNELS = ['push', 'in_app'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export interface TrackMessageOptions {
  /** Identificador del mensaje/notificación — correlaciona el funnel delivered→clicked→converted. */
  id: string;
  /** Título del mensaje — dimensión de agrupación de #18–22. */
  title: string;
  /** Canal de entrega. */
  channel: MessageChannel;
  /** Nombre de la campaña (opcional). */
  campaign?: string;
  /** Valor de conversión (opcional, típico en `stage: 'converted'`). */
  value?: number;
  currency?: string;
  /** Parámetros libres adicionales. */
  params?: Record<string, unknown>;
}

/** Construye los params del evento `deepdots_message` (omite opcionales ausentes). */
export function buildMessageParams(stage: MessageStage, o: TrackMessageOptions): Record<string, unknown> {
  const p: Record<string, unknown> = {
    stage,
    message_id: o.id,
    message_title: o.title,
    channel: o.channel,
  };
  if (o.campaign) p.campaign = o.campaign;
  if (o.value !== undefined) p.value = o.value;
  if (o.currency) p.currency = o.currency;
  return { ...p, ...(o.params ?? {}) };
}

/** Techo de `message_id` vigilados por sesión; los más antiguos se evictan (memoria acotada). */
export const MAX_TRACKED_MESSAGES = 500;

export type MessageRejectionReason = 'invalid_channel' | 'duplicate_stage' | 'channel_conflict';

export type MessageGuardVerdict =
  | { emit: true }
  | { emit: false; reason: MessageRejectionReason; detail: string };

/**
 * Protege el funnel de Messaging de las formas imposibles que el host puede producir por error
 * (visto en producción: CTR > 100% por falta de `delivered` + el mismo `message_id` reportado en
 * dos canales). Tres reglas, todas dentro de la sesión (se reinicia en cada `init()`):
 *
 *  1. `channel` fuera de `MESSAGE_CHANNELS` → se descarta el evento.
 *  2. Un `(message_id, stage)` ya emitido → se emite una sola vez.
 *  3. Un `message_id` ya visto en un canal → se descartan los eventos de otro canal.
 *
 * Los eventos rechazados NO mutan el estado: un rechazo nunca "consume" el stage bueno.
 * Lo que el SDK no puede arreglar es la ausencia de `delivered`: eso lo instrumenta el host.
 */
export class MessageGuard {
  /** message_id → canal fijado + stages ya emitidos. El orden de inserción marca la eviction. */
  private seen = new Map<string, { channel: MessageChannel; stages: Set<MessageStage> }>();

  constructor(private maxTrackedMessages: number = MAX_TRACKED_MESSAGES) {}

  evaluate(stage: MessageStage, options: TrackMessageOptions): MessageGuardVerdict {
    const channel = options.channel;
    if (!(MESSAGE_CHANNELS as readonly string[]).includes(channel)) {
      return {
        emit: false,
        reason: 'invalid_channel',
        detail: `channel "${channel}" no válido (esperado ${MESSAGE_CHANNELS.join(' | ')})`,
      };
    }

    const entry = this.seen.get(options.id);
    if (!entry) {
      this.remember(options.id, channel, stage);
      return { emit: true };
    }
    if (entry.channel !== channel) {
      return {
        emit: false,
        reason: 'channel_conflict',
        detail: `message_id "${options.id}" ya se reportó en channel "${entry.channel}"; se descarta "${channel}"`,
      };
    }
    if (entry.stages.has(stage)) {
      return {
        emit: false,
        reason: 'duplicate_stage',
        detail: `stage "${stage}" ya emitido para message_id "${options.id}"`,
      };
    }
    entry.stages.add(stage);
    return { emit: true };
  }

  /** Olvida todo lo vigilado (nueva sesión). */
  reset(): void {
    this.seen.clear();
  }

  private remember(id: string, channel: MessageChannel, stage: MessageStage): void {
    this.seen.set(id, { channel, stages: new Set([stage]) });
    while (this.seen.size > this.maxTrackedMessages) {
      const oldest = this.seen.keys().next();
      if (oldest.done) break;
      this.seen.delete(oldest.value);
    }
  }
}
