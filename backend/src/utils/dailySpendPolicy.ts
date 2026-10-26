export function dailySpendWindow(now = Date.now()) {
  const start = Math.floor((now / 1000 + 28800) / 86400) * 86400 - 28800;
  return {
    day: new Date((start + 28800) * 1000).toISOString().slice(0, 10),
    start,
    end: start + 86400,
  };
}
export function shouldWarnDaily(yuan: number, thresholdYuan: number) {
  return (
    Number.isFinite(yuan) &&
    Number.isFinite(thresholdYuan) &&
    thresholdYuan > 0 &&
    yuan >= thresholdYuan
  );
}
