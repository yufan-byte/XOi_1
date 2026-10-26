import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readSkillDocument } from "./skillDocument";

test("skill reads allow bounded documents, reject traversal/hidden files/scripts and symlink escapes", async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-skill-security-"));
  t.after(() => fs.rm(base,{recursive:true,force:true}));
  const root = path.join(base,"skills"); await fs.mkdir(path.join(root,"approved"),{recursive:true});
  await fs.writeFile(path.join(root,"approved/SKILL.md"),"只读文本");
  await fs.writeFile(path.join(base,"secret.md"),"secret");
  await fs.writeFile(path.join(root,".env"),"secret");
  await fs.writeFile(path.join(root,"execute.js"),"process.exit()");
  await fs.writeFile(path.join(root,"large.md"),"x".repeat(256_001));
  await fs.symlink(path.join(base,"secret.md"),path.join(root,"link.md"));
  await fs.symlink(base,path.join(root,"nested"));
  assert.equal(await readSkillDocument(root,"approved/SKILL.md"),"只读文本");
  for (const name of ["../secret.md",path.join(base,"secret.md"),".env","execute.js","large.md","link.md","nested/secret.md","approved/../approved/SKILL.md","approved\\SKILL.md"]) await assert.rejects(readSkillDocument(root,name));
});
