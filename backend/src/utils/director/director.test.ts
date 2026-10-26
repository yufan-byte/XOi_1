import {BUDGET_OUTPUT_TOKENS} from "../billingBudgetPolicy";
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DIRECTOR_SKILLS, assertDirectorOwner, validateDirectorPlan, validateDirectorScene } from "../../../../shared/directorSkills";
import { appendDirectorShots, lookAtRotation, sceneFromNative } from "../../../../frontend/src/utils/directorScene";
import { loadDirectorSkill, listDirectorSkills } from "./skillRegistry";
import { planDirector, validateDirectorRequest } from "./planner";

const camera = { position: [0, 2, 5], rotation: [0, 0, 0], focalLength: 35, aspectRatio: "16:9" };
const actor = { id: "actor-1", name: "演员", type: "person", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pose: "idle" };
const shot = { id: "shot-01", name: "原镜头", fps: 24, durationSeconds: 5, loopPlayback: true, objects: [actor], camera, lighting: { ambientIntensity: .7 }, reference: { image: "private-image" }, keyframes: [], objectKeyframes: { "actor-1": [{ frame: 40, position: [1, 0, 0], pose: "walk" }] } };
const project: Record<string, any> = { version: 16, settings: { fps: 24, durationSeconds: 5 }, activeShotId: shot.id, shots: [shot], ...Object.fromEntries(["objects", "camera", "lighting", "reference", "keyframes", "objectKeyframes"].map(k => [k, (shot as any)[k]])) };
const scene = sceneFromNative(project, "director3d-u1-test", "测试场景");
const proposal = { name: "推进", purpose: "展示情绪", framing: "中景", movement: "推进", blocking: "保持原站位", performance: "沉默", lighting: "保持原光影", transition: "切入", prompt: "在原场景缓慢推进", camera: { keyframes: [{ t: 0, position: [0, 2, 5], target: [0, 1, 0], focalLength: 35 }, { t: 1, position: [0, 2, 3], target: [0, 1, 0], focalLength: 50 }] } };
const plan = { summary: "缓慢推进", assumptions: ["沿用原布景"], warnings: [], renderPrompt: "导出白模录像作为参考", shots: [proposal] };

test("scene sanitization and account boundaries", () => {
  assertDirectorOwner(scene.projectId, 1);
  assert.throws(() => assertDirectorOwner(scene.projectId, 2));
  assert.throws(() => assertDirectorOwner("director3d-main", 1));
  assert.throws(() => assertDirectorOwner("director3d-u1-../../bad", 1));
  const sanitized = validateDirectorScene({ ...scene, secret: "token", reference: { image: "private" }, lighting: { intensity: .7, image: "secret", invalid: Infinity } });
  assert.equal((sanitized as any).secret, undefined);
  assert.equal((sanitized as any).reference, undefined);
  assert.deepEqual(sanitized.lighting, { intensity: .7 });
  assert.throws(() => validateDirectorScene({ ...scene, objects: [actor, actor] }));
  assert.throws(() => validateDirectorScene({ ...scene, durationSeconds: 61 }));
  assert.throws(() => validateDirectorRequest({ intent: "镜头", skillId: "../../bad", shotCount: 1, scene }));
});

test("validated camera plans preserve original actors, animation and shots", () => {
  const validated = validateDirectorPlan(plan, DIRECTOR_SKILLS[0]);
  const before = JSON.stringify(project);
  const next = appendDirectorShots(project, validated.shots);
  assert.equal(JSON.stringify(project), before, "source must remain unchanged");
  assert.equal(next.shots.length, 2);
  assert.deepEqual(next.shots[0], shot);
  assert.deepEqual(next.objects, project.objects);
  assert.deepEqual(next.objectKeyframes, project.objectKeyframes);
  assert.deepEqual(next.reference, project.reference);
  assert.equal(next.camera.aspectRatio, "16:9");
  assert.deepEqual(next.keyframes.map((k: any) => k.frame), [0, 119]);
  assert.equal(next.keyframes[1].focalLength, 50);
  assert.deepEqual(lookAtRotation([0, 0, 5], [0, 0, 0]), [0, -0, 0]);
  assert.throws(() => appendDirectorShots({ ...project, shots: Array(30).fill(shot) }, validated.shots));
  assert.throws(() => validateDirectorPlan(plan, DIRECTOR_SKILLS.find(s => s.id === "seedance-previz-to-render")!));
  const invalid = structuredClone(plan); invalid.shots[0].camera.keyframes[1].target = [0, 2, 3];
  assert.throws(() => validateDirectorPlan(invalid, DIRECTOR_SKILLS[0]));
  invalid.shots[0].camera.keyframes[1].target = [0, 1, 0]; invalid.shots[0].camera.keyframes[1].focalLength = 999;
  assert.throws(() => validateDirectorPlan(invalid, DIRECTOR_SKILLS[0]));
});

test("complete reference loading, gateway errors and forbidden tool calls", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "director-skills-test-"));
  const dir = path.join(root, DIRECTOR_SKILLS[0].id);
  await fs.mkdir(path.join(dir, "references"), { recursive: true });
  const contents = "完整参考资料\n".repeat(1600);
  try {
    for (const file of ["SKILL.md", "references/cinematography.md", "references/quality-anchors.md"]) await fs.writeFile(path.join(dir, file), contents);
    assert.equal((await listDirectorSkills(root)).filter(s => s.available).length, 1);
    const loaded = await loadDirectorSkill(DIRECTOR_SKILLS[0].id, "推进", scene, root);
    assert.equal(JSON.parse(loaded.context)[1].content, contents);
    const input = validateDirectorRequest({ intent: "推进", skillId: DIRECTOR_SKILLS[0].id, shotCount: 1, scene });
    const options = { config: { baseUrl: "http://test.invalid/v1", apiKey: "fake-key", model: "fake-model" }, input, signal: new AbortController().signal, packagesRoot: root };
    let outcome: any = { finish_reason: "stop", message: { content: JSON.stringify(plan) } };
    let sent: any;
    const fetcher = (async (_url: any, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [outcome] }), { status: 200 }); }) as typeof fetch;
    const result = await planDirector({ ...options, fetcher });
    assert.equal(result.plan.shots.length, 1);
    assert.equal(sent.tools, undefined);assert.equal(sent.max_tokens,BUDGET_OUTPUT_TOKENS);
    assert.match(sent.messages[1].content, /director3d-u1-test/);
    assert.doesNotMatch(sent.messages[1].content, /private-image/);
    assert.equal(sent.messages[0].role, "system");
    outcome = { finish_reason: "length", message: { content: JSON.stringify(plan) } };
    await assert.rejects(planDirector({ ...options, fetcher }), /未完整完成/);
    outcome = { finish_reason: "stop", message: { content: JSON.stringify(plan), tool_calls: [{}] } };
    await assert.rejects(planDirector({ ...options, fetcher }), /未开放工具/);
    outcome = { finish_reason: "stop", message: { content: "not-json" } };
    await assert.rejects(planDirector({ ...options, fetcher }), /格式或参数无效/);
    await assert.rejects(planDirector({ ...options, fetcher: (async () => new Response("private gateway error", { status: 402 })) as typeof fetch }), /额度不足/);
    await fs.unlink(path.join(dir, "references/cinematography.md"));
    await fs.writeFile(path.join(root, "outside.md"), "outside");
    await fs.symlink(path.join(root, "outside.md"), path.join(dir, "references/cinematography.md"));
    await assert.rejects(loadDirectorSkill(DIRECTOR_SKILLS[0].id, "推进", scene, root), /路径无效/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
