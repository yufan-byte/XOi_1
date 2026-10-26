import test from "node:test";
import assert from "node:assert/strict";
import {
  continuitySignature,
  continuityWarnings,
  parseContinuityReview,
  continuityRepairText,
} from "../../../shared/shotContinuity";
import {
  continuityPrompt,
  selectedContinuityAnchor,
} from "./directorContinuity";
import { saveStoryboardImageVersion } from "./storyboardImageHistory";
import knex from "knex";
import { orderedDirectorTrackIds } from "./directorTrackOrder";
import { saveStoryboardContinuity } from './saveStoryboardContinuity';

test('saving a scene layout keeps other actors/actions and server history, rejects stale or foreign edits atomically', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  try {
    await db.schema.createTable('o_storyboard', t => { t.integer('id'); t.integer('index'); t.integer('projectId'); t.integer('scriptId'); t.text('filePath'); t.text('continuity'); });
    await db.schema.createTable('o_assets2Storyboard', t => { t.integer('storyboardId'); t.integer('assetId'); t.integer('sortOrder'); });
    await db.schema.createTable('o_assets', t => { t.integer('id'); t.integer('projectId'); t.integer('imageId'); t.text('name'); t.text('type'); t.text('describe'); });
    await db.schema.createTable('o_image', t => { t.integer('id'); t.text('filePath'); });
    await db('o_assets').insert([{ id: 30, projectId: 7, type: 'scene', name: '卧室' }, { id: 31, projectId: 7, type: 'scene', name: '客厅' }]);
    const original = { ...c, imageHistory: [{ filePath: '/7/old.jpg', createdAt: 1 }] };
    for (const [id, sceneId] of [[1, 30], [2, 30], [3, 31]]) {
      await db('o_storyboard').insert({ id, index: id, projectId: 7, scriptId: 11, filePath: `/7/frame${id}.jpg`, continuity: JSON.stringify(id === 2 ? original : { ...c, sceneId, transition: 'cut', startState: '原有人物站位' }) });
      await db('o_assets2Storyboard').insert({ storyboardId: id, assetId: sceneId, sortOrder: 0 });
    }
    const input = { projectId: 7, scriptId: 11, id: 2, expectedContinuity: original, continuity: { ...c, anchorStoryboardId: 1, spatialLayout: '床沿右墙固定，窗在左墙', imageHistory: [{ filePath: '/someone-else/arbitrary.jpg', createdAt: 2 }] }, applySceneLayout: true };
    const result = await saveStoryboardContinuity(db, input);
    assert.deepEqual(result.continuity.imageHistory, original.imageHistory);
    assert.equal(result.updates.length, 1);
    const first = JSON.parse((await db('o_storyboard').where('id', 1).first()).continuity);
    assert.equal(first.startState, '原有人物站位'); assert.equal(first.spatialLayout, input.continuity.spatialLayout);
    assert.equal(JSON.parse((await db('o_storyboard').where('id', 3).first()).continuity).spatialLayout, c.spatialLayout);
    await assert.rejects(saveStoryboardContinuity(db, input), /其他操作更新/);
    await assert.rejects(saveStoryboardContinuity(db, { ...input, projectId: 8 }), /不属于/);
    await assert.rejects(saveStoryboardContinuity(db, { ...input, expectedContinuity: result.continuity, continuity: { ...result.continuity, sceneId: 31 } }), /关联的场景/);
    const before = (await db('o_storyboard').where('id', 2).first()).continuity;
    await assert.rejects(saveStoryboardContinuity(db, { ...input, expectedContinuity: result.continuity, continuity: { ...result.continuity, spatialLayout: '' } }), /填写固定布局/);
    assert.equal((await db('o_storyboard').where('id', 2).first()).continuity, before);
  } finally { await db.destroy(); }
});

const c = {
  sceneId: 30,
  transition: "continue" as const,
  startState: "坐在床沿",
  endState: "起身站在床前",
  screenDirection: "窗侧机位",
  spatialLayout: "床靠右墙，桌子靠左窗",
};
test("clip lists follow storyboard order instead of row insertion or track IDs", () => {
  assert.deepEqual(
    orderedDirectorTrackIds(
      [
        { trackId: 103 },
        { trackId: 103 },
        { trackId: null },
        { trackId: 101 },
        { trackId: 999 },
      ],
      [{ id: 101 }, { id: 102 }, { id: 103 }],
    ),
    [103, 101, 102],
  );
});
test("review signatures detect changed images, action, anchors and videos but ignore URL expiry and review metadata", () => {
  const frame = {
    id: 2,
    src: "/oss/shot.jpg?signature=old",
    prompt: "起身",
    continuity: c,
  };
  const baseline = continuitySignature(frame);
  assert.equal(
    baseline,
    continuitySignature({ ...frame, src: "/oss/shot.jpg?signature=new" }),
  );
  assert.equal(
    baseline,
    continuitySignature({
      ...frame,
      continuity: {
        endState: c.endState,
        transition: c.transition,
        sceneId: 30,
        startState: c.startState,
        screenDirection: c.screenDirection,
        spatialLayout: c.spatialLayout,
        repairNotes: "",
        anchorStoryboardId: null,
      },
    }),
  );
  assert.notEqual(
    baseline,
    continuitySignature({ ...frame, src: "/oss/repaint.jpg" }),
  );
  assert.notEqual(
    baseline,
    continuitySignature({
      ...frame,
      continuity: { ...c, startState: "站在门边" },
    }),
  );
  assert.notEqual(
    continuitySignature(frame, undefined, { id: 1, src: "/anchor1.jpg" }),
    continuitySignature(frame, undefined, { id: 1, src: "/anchor2.jpg" }),
  );
  assert.notEqual(
    continuitySignature(frame, undefined, undefined, ["v1:/a.mp4"]),
    continuitySignature(frame, undefined, undefined, ["v2:/a.mp4"]),
  );
  assert.notEqual(
    continuitySignature(frame, undefined, undefined, undefined, {
      id: 30,
      src: "/room-v1.jpg",
    }),
    continuitySignature(frame, undefined, undefined, undefined, {
      id: 30,
      src: "/room-v2.jpg",
    }),
  );
});
test("malformed AI output cannot become a passed review; accepted issues preserve evidence", () => {
  assert.throws(() => parseContinuityReview("全部正常"), /可解析/);
  assert.throws(
    () =>
      parseContinuityReview(
        '{"summary":"正常","issues":[],"uncertainties":null}',
      ),
    /不完整/,
  );
  assert.throws(
    () =>
      parseContinuityReview(
        JSON.stringify({
          summary: "检查",
          issues: [{ category: "布局", severity: "error", suggestion: "改床" }],
          uncertainties: [],
        }),
      ),
    /字段无效/,
  );
  const result = parseContinuityReview(
    "```json\n" +
      JSON.stringify({
        summary: "对照两图",
        issues: [
          {
            category: "布局",
            severity: "error",
            evidence: "当前床与窗的相对位置改变",
            suggestion: "床恢复到右墙，保留人物姿势",
          },
        ],
        uncertainties: ["反打机位使门不可见"],
      }) +
      "\n```",
  );
  assert.match(continuityRepairText(result.issues), /保留人物姿势/);
  assert.equal(result.uncertainties.length, 1);
});
test("generation carries layout and local repair without treating camera reversal as moving furniture", () => {
  const prompt = continuityPrompt(
    { ...c, repairNotes: "只恢复床的位置" },
    "卧室",
    c,
  );
  for (const text of [
    "床靠右墙",
    "禁止为了新构图移动床",
    "只恢复床的位置",
    "上一镜结束状态",
  ])
    assert.ok(prompt.includes(text));
  assert.ok(
    continuityWarnings({ continuity: c }).some((w) => w.includes("第一镜")),
  );
  assert.ok(
    continuityWarnings(
      { continuity: c },
      { continuity: { ...c, sceneId: 31 } },
    ).some((w) => w.includes("场景未对齐")),
  );
});
test("pinned anchors cannot cross scenes or point to the current/missing picture", () => {
  const first = { id: 1, sceneId: 30, filePath: "/7/one.jpg", continuity: c };
  const current = {
    id: 2,
    sceneId: 30,
    filePath: "/7/two.jpg",
    continuity: { ...c, anchorStoryboardId: 1 },
  };
  assert.equal(selectedContinuityAnchor([first, current], current), first);
  assert.throws(
    () =>
      selectedContinuityAnchor([{ ...first, sceneId: 31 }, current], current),
    /同场景/,
  );
  assert.throws(() => selectedContinuityAnchor([current], current), /同场景/);
});
test("repaint and restore keep prior images, enforce project ownership and do not lose continuity rules", async () => {
  const db = knex({
    client: "better-sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
  });
  try {
    await db.schema.createTable("o_storyboard", (t) => {
      t.integer("id");
      t.integer("projectId");
      t.integer("scriptId");
      t.text("filePath");
      t.text("state");
      t.text("reason");
      t.text("continuity");
    });
    await db("o_storyboard").insert({
      id: 2,
      projectId: 7,
      scriptId: 11,
      filePath: "/7/original.jpg",
      state: "生成中",
      continuity: JSON.stringify(c),
    });
    const result = await saveStoryboardImageVersion(
      db,
      7,
      11,
      2,
      "/7/repaint.jpg",
    );
    assert.equal(result.spatialLayout, c.spatialLayout);
    assert.equal(result.imageHistory?.[0].filePath, "/7/original.jpg");
    await assert.rejects(
      saveStoryboardImageVersion(db, 8, 11, 2, "/7/original.jpg", true),
      /不属于/,
    );
    await assert.rejects(
      saveStoryboardImageVersion(db, 7, 11, 2, "/7/arbitrary.jpg", true),
      /不可恢复/,
    );
    const restored = await saveStoryboardImageVersion(
      db,
      7,
      11,
      2,
      "/7/original.jpg",
      true,
    );
    assert.equal(
      (await db("o_storyboard").first()).filePath,
      "/7/original.jpg",
    );
    assert.equal(restored.imageHistory?.[0].filePath, "/7/repaint.jpg");
    await db("o_storyboard").update({ state: "生成中" });
    await assert.rejects(
      saveStoryboardImageVersion(db, 7, 11, 2, "/7/repaint.jpg", true),
      /正在生成/,
    );
  } finally {
    await db.destroy();
  }
});
