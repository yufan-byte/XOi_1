// Keep managed previz encoding independent of the editor's quality-first download.
// Quality encoders can buffer frames while the muxer waits for its bounded queue.
// A low-latency, software-preferred configuration avoids sharing the 3D GPU queue.
export function installPrevizEncoder() {
  const Native = window.VideoEncoder;
  if (!Native) return;
  const configurations = new Map();
  const managed = () => document.documentElement.dataset.xoiPrevizExport === "true";
  const key = c => `${c.codec}:${c.width}:${c.height}`;
  const realtime = c => ({ ...c, latencyMode: "realtime" });
  class PrevizEncoder extends Native {
    static async isConfigSupported(config) {
      if (!managed()) return Native.isConfigSupported(config);
      const software = { ...realtime(config), hardwareAcceleration: "prefer-software" };
      let result;
      try { result = await Native.isConfigSupported(software); } catch {}
      if (result?.supported) {
        configurations.set(key(config), "prefer-software");
        return result;
      }
      configurations.set(key(config), config.hardwareAcceleration || "no-preference");
      return Native.isConfigSupported(realtime(config));
    }
    configure(config) {
      if (!managed()) return super.configure(config);
      const acceleration = configurations.get(key(config));
      const next = { ...realtime(config), ...(acceleration ? { hardwareAcceleration: acceleration } : {}) };
      document.documentElement.dataset.xoiPrevizEncoder = `${next.latencyMode}/${next.hardwareAcceleration || "no-preference"}`;
      return super.configure(next);
    }
  }
  window.VideoEncoder = PrevizEncoder;
}
