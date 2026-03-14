import { io } from "socket.io-client";

const URL =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:4000" : window.location.origin);

export const socket = io(URL, {
  autoConnect: false,
});
