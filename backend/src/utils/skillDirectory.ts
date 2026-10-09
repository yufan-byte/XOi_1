import fs from "node:fs";
import path from "node:path";

/** Shared skill mutations accept one directory component, with no symlink traversal. */
export function skillDirectory(root: string, value: string): string {
  if (typeof value !== "string" || !/^[\p{L}\p{N}_ .-]{1,80}$/u.test(value) || value.trim() !== value || value.includes("..") || value === "." || /^\d+$/.test(value)) {
    throw Object.assign(new Error("手册目录名称无效"), { status: 400 });
  }
  const target = path.join(root, value);
  if (fs.existsSync(target) && (!fs.lstatSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink())) {
    throw Object.assign(new Error("手册目录无效"), { status: 400 });
  }
  if (fs.existsSync(target)) {
    // Existing nested paths must also be actual directories/files before handlers overwrite/remove them.
    const rejectLinks = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw Object.assign(new Error("手册目录不能包含符号链接"), { status: 400 });
        if (entry.isDirectory()) rejectLinks(path.join(directory, entry.name));
      }
    };
    rejectLinks(target);
  }
  return target;
}
