import { test } from "node:test";
import assert from "node:assert/strict";
import { modelPickerLayout } from "../../../frontend/src/utils/modelPickerLayout";
import { quotaToPoints, pointsToQuota, QUOTA_PER_YUAN } from "./creditUnits";
import { yuanToPoints, formatPointsFromYuan } from "../../../frontend/src/utils/points";

test("picker fits the viewport near the bottom, on small windows and after keyboard resize", () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 640 }, { width: 390, height: 280, top: 120 }, { width: 1280, height: 900 }]) {
    for (const anchor of [{ left: 1180, top: 660, bottom: 700 }, { left: 100, top: 320, bottom: 360 }, { left: 8, top: 18, bottom: 58 }]) {
      const rect = modelPickerLayout(anchor, viewport);
      assert.ok(rect.left >= 12);
      assert.ok(rect.left + rect.width <= viewport.width - 12);
      assert.ok(rect.top >= (viewport.top || 0) + 12);
      assert.ok(rect.top + rect.height <= (viewport.top || 0) + viewport.height - 12);
    }
  }
  const above = modelPickerLayout({ left: 300, top: 620, bottom: 660 }, { width: 1280, height: 720 });
  assert.ok(above.top + above.height < 620);
});

test("one yuan is ten points, preserving fractional and signed ledger values", () => {
  assert.equal(quotaToPoints(QUOTA_PER_YUAN), 10);
  assert.equal(quotaToPoints(QUOTA_PER_YUAN / 2), 5);
  assert.equal(quotaToPoints(QUOTA_PER_YUAN * 5.625), 56.25);
  assert.equal(quotaToPoints(-QUOTA_PER_YUAN * 0.1), -1);
  assert.equal(pointsToQuota(10), QUOTA_PER_YUAN);
  assert.equal(pointsToQuota(56.25), QUOTA_PER_YUAN * 5.625);
  assert.equal(yuanToPoints(0.5), 5);
  assert.equal(formatPointsFromYuan(0.5), "5 积分");
  assert.equal(formatPointsFromYuan(0.5 * 5), "25 积分");
  assert.equal(formatPointsFromYuan(0.5 * 5 * 1.5), "37.5 积分");
});
