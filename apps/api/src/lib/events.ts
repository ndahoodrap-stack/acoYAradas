import { EventEmitter } from 'node:events';

/**
 * Bus de eventos en memoria para actualizaciones en vivo (SSE).
 * Nota: es por proceso. En despliegues con varias instancias habría que
 * moverlo a Postgres (LISTEN/NOTIFY) o a un canal de Supabase Realtime.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export const channels = {
  order: (orderId: string) => `order:${orderId}`,
  user: (userId: string) => `user:${userId}`,
  store: (storeId: string) => `store:${storeId}`,
  rider: (riderId: string) => `rider:${riderId}`,
  admin: () => 'admin',
};

export type EventPayload = Record<string, unknown>;

export function publish(channel: string, payload: EventPayload): void {
  emitter.emit(channel, payload);
  emitter.emit('*', { channel, ...payload });
}

export function subscribe(channel: string, listener: (payload: EventPayload) => void): () => void {
  emitter.on(channel, listener);
  return () => emitter.off(channel, listener);
}

export function subscribeAll(listener: (payload: EventPayload & { channel: string }) => void): () => void {
  emitter.on('*', listener);
  return () => emitter.off('*', listener);
}
