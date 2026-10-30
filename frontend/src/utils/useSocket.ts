import { ref } from "vue";
import { io, Socket } from "socket.io-client";
import { sessionToken } from "./session";

export interface SocketEventMap {
  //scriptAgent
  getPlanData: (data: any, callback: (response: any) => void) => void;
  setPlanData: (data: any) => void;
  //productionAgent
  getFlowData: (data: any, callback: (response: any) => void) => void;
  setFlowData: (data: any) => void;
  //公共
  message: string;
  setKeyScript: { scriptId: number; key: string };
  stop: string;
  textMessage: { type: "start" | "content" | "end"; messageId: string; delta: string | null; role: "assistant"; name: string };
  systemMessage: { messageId: string; content: string };
  thinkMessage: { type: "start" | "content" | "end"; messageId: string; delta: string | null; role: "assistant"; name: string };
}

export function useSocket<T extends SocketEventMap = SocketEventMap>(url = "", authOptions?: Record<string, any>) {
  let socket: Socket | null = null;
  const connected = ref(false);

  const connect = () => {
    if (socket) {
      if (socket.disconnected) socket.connect();
      return;
    }

    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      // F3：有内存凭据就用它握手；刷新后内存为空，交给后端从同源 cookie 里取（socket/index.ts 已支持）。
      auth: { token: sessionToken() || undefined, ...authOptions },
    });

    socket.on("connect", () => (connected.value = true));
    socket.on("disconnect", () => (connected.value = false));
    socket.on("connect_error", () => (connected.value = false));
  };

  const disconnect = () => {
    socket?.disconnect();
    connected.value = false;
  };

  const send = <E extends keyof T & string>(event: E, ...args: T[E] extends void ? [] : [T[E]]) => socket?.emit(event, ...args);
  const on = <E extends keyof T & string>(event: E, callback: T[E] extends (...args: any[]) => any ? T[E] : (data: T[E]) => void) =>
    socket?.on(event, callback as any);
  const off = <E extends keyof T & string>(event: E, callback?: T[E] extends (...args: any[]) => any ? T[E] : (data: T[E]) => void) =>
    socket?.off(event, callback as any);

  return { connected, socket: { connect, disconnect, send, on, off } };
}
