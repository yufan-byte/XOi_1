export interface ReferenceImage { name: string; dataUrl: string }

// Resize and rasterize locally; the server also decodes and validates every image.
export async function prepareReferenceImages(inputs: ReferenceImage[], signal: AbortSignal): Promise<ReferenceImage[]> {
  const output: ReferenceImage[] = [];
  for (const input of inputs) {
    signal.throwIfAborted();
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); image.onload = image.onerror = null; };
      const abort = () => { cleanup(); image.src = ""; reject(new DOMException("已停止", "AbortError")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("参考图片读取超时")); }, 15000);
      signal.addEventListener("abort", abort, { once: true });
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error("参考图片无法读取，请重新上传")); };
      image.src = input.dataUrl;
    });
    signal.throwIfAborted();
    const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器无法读取参考图片");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    try { output.push({ name: input.name.slice(0, 200), dataUrl: canvas.toDataURL("image/jpeg", 0.75) }); }
    catch { throw new Error("参考图片不允许读取，请下载后上传"); }
    finally { canvas.width = canvas.height = 0; }
  }
  return output;
}
