export function executionWindow(kind:string, body:Record<string,any>, now=Date.now()) {
  if(kind!=='one-stop')return 20*60_000;
  const max=12*60*60_000,deadline=Number(body.deadlineAt);
  return Number.isFinite(deadline)?Math.max(1,Math.min(max,deadline-now)):max;
}
