import test from "node:test";
import assert from "node:assert/strict";
import { loadCreativeSkills } from "./creativeSkills";

test("no selected skills leaves the original workflow unchanged", async () => {
  const result = await loadCreativeSkills([]);
  assert.equal(result.prompt, "");
  assert.deepEqual(result.tools, {});
});

test("selected skills include complete instructions and readable references", async () => {
  const result = await loadCreativeSkills(["community/drama-skills/short-drama-write/SKILL.md"]);
  assert.match(result.prompt, /short-drama-write/);
  assert.match(result.prompt, /XML/);
  const execute = result.tools.read_creative_skill_file!.execute! as any;
  const reference = await execute({ filePath: "short-drama-write/references/dialogue-craft.md" });
  assert.ok(reference.content.length > 100);
  assert.ok((await execute({ filePath: "../../db2.sqlite" })).error);
  assert.ok((await execute({ filePath: "short-drama/scripts/project_tool.py" })).error);
});

test("rejects non-entrypoints and excessive selections", async () => {
  await assert.rejects(loadCreativeSkills(["../../secrets.md"]));
  await assert.rejects(loadCreativeSkills(["script_agent_decision.md"]));
  await assert.rejects(loadCreativeSkills(["a", "b", "c", "d", "e"]));
});
