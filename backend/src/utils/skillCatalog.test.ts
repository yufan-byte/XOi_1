import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listSkillCatalog } from "./skillCatalog";

test("skill catalog returns metadata, excludes helper documents and does not follow symlinks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-skill-catalog-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-skill-outside-"));
  try {
    await fs.mkdir(path.join(root, "film"));
    await fs.mkdir(path.join(root, "community"));
    await fs.writeFile(path.join(root, "film/SKILL.md"), '---\nname: 品牌短片\ndescription: "按阶段规划"\n---\nPRIVATE_BODY_MUST_NOT_BE_RETURNED');
    await fs.writeFile(path.join(root, "film/reference.md"), "not a root skill");
    await fs.writeFile(path.join(root, "community/legacy.md"), "legacy content");
    await fs.writeFile(path.join(outside, "SKILL.md"), "OUTSIDE_SECRET");
    await fs.symlink(outside, path.join(root, "linked"));
    await fs.symlink(path.join(outside, "SKILL.md"), path.join(root, "community/linked.md"));
    const result = await listSkillCatalog(root);
    assert.deepEqual(result.map(item => item.path), ["community/legacy.md", "film/SKILL.md"]);
    assert.equal(result[1].name, "品牌短片");
    assert.equal(result[1].description, "按阶段规划");
    assert.equal(result[1].hasFiles, true);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_BODY|OUTSIDE_SECRET/);
    assert.ok(result.every(item => !("content" in item)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
