import { makeRedis } from '../queues/connection.js';

// SSE fan-out via Redis pub/sub (never directly from a worker — otherwise it
// breaks with multiple instances; CLAUDE.md conventions). Events are scoped to
// a channel per entity: `client:<id>` or `set:<id>`.

export type SseEvent =
  | { type: 'status.changed'; scope: string; id: string; status: string }
  | { type: 'run.started'; scope: string; id: string; agentKind: string; runId: string }
  | { type: 'run.finished'; scope: string; id: string; agentKind: string; runId: string }
  | { type: 'message'; scope: string; id: string; runId: string; role: string }
  | { type: 'cost.updated'; scope: string; id: string; spentUsd: number }
  | { type: 'questions.ready'; scope: string; id: string }
  | { type: 'profile.ready'; scope: string; id: string }
  | { type: 'avatars.ready'; scope: string; id: string }
  | { type: 'concept.ready'; scope: string; id: string; setId: string }
  | { type: 'script.ready'; scope: string; id: string; setId: string; scriptId: string }
  | { type: 'notification.sent'; scope: string; id: string };

const pub = makeRedis();

function channel(scope: string, id: string) {
  return `gs:events:${scope}:${id}`;
}

export async function publish(event: SseEvent) {
  await pub.publish(channel(event.scope, event.id), JSON.stringify(event));
}

// Subscribe to one entity's events. Returns an unsubscribe function. Each caller
// gets its own connection (Redis subscriber mode blocks the connection).
export function subscribe(scope: string, id: string, onEvent: (e: SseEvent) => void) {
  const sub = makeRedis();
  const ch = channel(scope, id);
  void sub.subscribe(ch);
  sub.on('message', (_ch, payload) => {
    try {
      onEvent(JSON.parse(payload) as SseEvent);
    } catch {
      // ignore malformed payloads
    }
  });
  return async () => {
    await sub.unsubscribe(ch).catch(() => {});
    sub.disconnect();
  };
}
