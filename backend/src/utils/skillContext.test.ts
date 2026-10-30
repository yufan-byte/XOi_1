import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSkillContext, SkillContextError } from "./skillContext";

test("asset skills load full content, honor trusted category and reject unauthorized private paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "xoi-skill-context-"));
  try {
    await fs.mkdir(path.join(root, "community"));
    const longBody = "脸部设计".repeat(5000) + "END_MARKER";
    await fs.writeFile(path.join(root, "community/person.md"), `---\nname: 捏脸\ncategory: character\n---\n${longBody}`);
    await fs.writeFile(path.join(root, "community/place.md"), "---\nname: 场景\ncategory: scene\n---\n场景规则");
    // Legacy shared caches are not a source of authority for database-owned skills.
    await fs.writeFile(path.join(root, "community/s_private.md"), "SECRET_OLD_CACHE");
    const lookup = async (_id: string, userId: number | null) => userId === 1
      ? { name: "私有", body: "SECRET_CURRENT_BODY", categoryId: "character" } : null;
    const skills = [{ path: "community/person.md", category: "scene" }, { path: "community/place.md", category: "character" }, "community/s_private.md"];
    const person = await buildSkillContext(skills, { root, userId: 1, category: "character", lookupPrivateSkill: lookup });
    assert.match(person, /END_MARKER/);
    assert.match(person, /SECRET_CURRENT_BODY/);
    assert.doesNotMatch(person, /场景规则|SECRET_OLD_CACHE/);
    const scene = await buildSkillContext(skills, { root, userId: 1, category: "scene", lookupPrivateSkill: lookup });
    assert.match(scene, /场景规则/);
    assert.doesNotMatch(scene, /END_MARKER|SECRET_CURRENT_BODY/);
    await assert.rejects(buildSkillContext(skills, { root, userId: 2, category: "character", lookupPrivateSkill: lookup }), /无权使用/);
    await assert.rejects(buildSkillContext(["../secret.md"], { root }), SkillContextError);
    await assert.rejects(buildSkillContext(["community/person.md"], { root, maxCharsPerSkill: 100 }), /不会静默截断/);
    await assert.rejects(buildSkillContext(Array(9).fill("builtin-film"), { root }), /最多选择 8/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
