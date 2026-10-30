export function executionWindow(kind:string, body:Record<string,any>, now=Date.now()) {
  // 视频供应商最多 2 分钟提交、20 分钟轮询、10 分钟下载，执行窗口须覆盖整条链路。
  if(kind==='video')return 35*60_000;
  if(kind!=='one-stop')return 20*60_000;
  const max=12*60*60_000,deadline=Number(body.deadlineAt);
  return Number.isFinite(deadline)?Math.max(1,Math.min(max,deadline-now)):max;
}
