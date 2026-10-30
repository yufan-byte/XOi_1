import { assertAccountSession } from "../adapters/request";
const key = () => `xoi-one-stop-handoff:${assertAccountSession()}`;
export function sendToVideo(url: string, prompt: string) {
  sessionStorage.setItem(key(), JSON.stringify({ destination: "video", at: Date.now(), url, prompt: prompt.slice(0, 500) }));
}
export function takeVideoHandoff() {
  const name = key(), raw = sessionStorage.getItem(name);
  sessionStorage.removeItem(name);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.destination === "video" && Date.now() >= data.at && Date.now() - data.at < 10 * 60_000 && typeof data.url === "string" && typeof data.prompt === "string") return data as {url: string; prompt: string};
  } catch { /* Ignore malformed local data. */ }
}
