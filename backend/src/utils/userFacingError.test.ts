import assert from "node:assert/strict";
import test from "node:test";
import { userFacingError, isInternalDbError } from "./userFacingError";

test("数据库错误不把 SQL 泄给用户", () => {
  const pgError = Object.assign(
    new Error('insert into "o_tasks" ("describe", "relatedObjects") values ($1, $2) returning "id" - value too long for type character varying(255)'),
    { code: "22001" },
  );
  assert.equal(isInternalDbError(pgError), true);
  assert.equal(userFacingError(pgError, "图片生成失败"), "图片生成失败");
});

test("没有 code 但消息像 SQL 也要拦", () => {
  assert.equal(
    userFacingError(new Error('duplicate key value violates unique constraint "o_tasks_id_unique"'), "保存失败"),
    "保存失败",
  );
});

test("业务错误原样透出", () => {
  assert.equal(userFacingError(new Error("积分不足，需要 10 积分，当前余额 3"), "生成失败"), "积分不足，需要 10 积分，当前余额 3");
  assert.equal(userFacingError(new Error("请先与导演助理核对分镜表"), "生成失败"), "请先与导演助理核对分镜表");
});

test("上游 HTTP 错误不是数据库错误（不误伤）", () => {
  const axiosLike = Object.assign(new Error("接口调用失败，请稍后重试"), { code: "ERR_BAD_REQUEST" });
  assert.equal(isInternalDbError(axiosLike), false);
  assert.equal(userFacingError(axiosLike, "生成失败"), "接口调用失败，请稍后重试");
});

test("空错误走兜底", () => {
  assert.equal(userFacingError(new Error(""), "生成失败"), "生成失败");
  assert.equal(userFacingError(undefined, "生成失败"), "生成失败");
});
