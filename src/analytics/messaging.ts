/**
 * Messaging (#18–22): tracking de notificaciones del host (push / in-app).
 * Un único evento reservado `deepdots_message` con un campo `stage` discriminador;
 * el funnel se correlaciona por `message_id` y se agrupa por `message_title`.
 */

export type MessageStage = 'delivered' | 'clicked' | 'converted';

export interface TrackMessageOptions {
  /** Identificador del mensaje/notificación — correlaciona el funnel delivered→clicked→converted. */
  id: string;
  /** Título del mensaje — dimensión de agrupación de #18–22. */
  title: string;
  /** Canal de entrega. */
  channel: 'push' | 'in_app';
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
