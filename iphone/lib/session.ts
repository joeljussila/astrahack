export type Point = { x: number; y: number };
export type Tool = 'point' | 'draw' | 'lasso' | 'orbit';
export type Message = { type: string; [key: string]: any };
export type Session = {
  id: string;
  token: string;
  phoneUrl: string;
  socketUrl: string;
};
export async function local<T = any>(
  command: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const r = await fetch('/api/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, ...data }),
  });
  const out = (await r.json()) as T & { error?: string };
  if (!r.ok || out.error)
    throw Error(out.error || 'The local studio is unavailable.');
  return out;
}
export function channel(
  url: string,
  id: string,
  token: string,
  onMessage: (m: Message) => void,
  onState: (s: string) => void,
) {
  let socket: WebSocket | undefined,
    closed = false,
    retry: ReturnType<typeof setTimeout>,
    failures = 0;
  function connect() {
    if (closed) return;
    onState('Connecting');
    socket = new WebSocket(url);
    socket.onopen = () => {
      failures = 0;
      socket!.send(JSON.stringify({ type: 'join', id, token }));
    };
    socket.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'joined') onState('Connected');
        onMessage(m);
      } catch {}
    };
    socket.onclose = (e) => {
      if (closed) return;
      if (e.code === 1008) {
        closed = true;
        onState('Pair again with the QR code on your Mac.');
        return;
      }
      onState('Reconnecting');
      retry = setTimeout(connect, Math.min(5000, 400 * 2 ** failures++));
    };
    socket.onerror = () => socket?.close();
  }
  connect();
  return {
    send(m: Message) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      if (m.type === 'pointer' && socket.bufferedAmount > 8000) return false;
      socket.send(JSON.stringify(m));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}
