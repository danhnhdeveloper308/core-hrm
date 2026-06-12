'use client';

import type { SocketEventName, SocketEvents } from '@repo/shared';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

/** Map event server→client theo SocketEvents của @repo/shared. */
type ListenEvents = {
  [K in SocketEventName]: (payload: SocketEvents[K]) => void;
};

type TypedSocket = Socket<ListenEvents, Record<string, never>>;

let socket: TypedSocket | null = null;

/** Singleton — handshake auth bằng cookie access_token (withCredentials). */
export function getSocket(): TypedSocket {
  socket ??= io(WS_URL, {
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 2_000,
  });
  return socket;
}

/** Gọi sau logout — server cũng tự disconnect khi session bị revoke. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/**
 * Đăng ký listener typed cho 1 event. Handler giữ qua ref nên truyền
 * inline function thoải mái, không cần useCallback.
 */
export function useSocket<E extends SocketEventName>(
  event: E,
  handler: (payload: SocketEvents[E]) => void,
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    // Generic listener của socket.io không narrow được theo E — cast nội bộ,
    // API bên ngoài vẫn typed chặt theo SocketEvents
    const s = getSocket() as unknown as {
      on: (ev: string, fn: (payload: unknown) => void) => void;
      off: (ev: string, fn: (payload: unknown) => void) => void;
    };
    const listener = (payload: unknown) => {
      handlerRef.current(payload as SocketEvents[E]);
    };
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event]);
}
