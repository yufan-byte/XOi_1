/** Verify file signatures as well as extensions. SVG/HTML/XML are deliberately excluded. */
export function isAllowedMedia(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;
  const ascii = (start: number, end: number) => buffer.toString("ascii", start, end);
  switch (ext) {
    case "png": return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "jpg": case "jpeg": return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "gif": return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    case "webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "mp4": return buffer.length >= 12 && ascii(4, 8) === "ftyp";
    // m4a 与 mp4 同属 ISOBMFF，文件头一致；两者都是容器，不构成脚本执行面
    case "m4a": return buffer.length >= 12 && ascii(4, 8) === "ftyp";
    case "webm": return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "mp3": return ascii(0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case "wav": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    case "flac": return ascii(0, 4) === "fLaC";
    case "aiff": return ascii(0, 4) === "FORM" && ["AIFF", "AIFC"].includes(ascii(8, 12));
    default: return false;
  }
}

export function safeInlineMediaType(value: string): string {
  const type = value.split(";")[0].trim().toLowerCase();
  return /^(image\/(png|jpeg|gif|webp|bmp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|wav|x-wav|ogg))$/.test(type)
    ? type : "application/octet-stream";
}
