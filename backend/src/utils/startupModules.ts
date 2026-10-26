type State = "pending" | "starting" | "ready" | "failed";
export class StartupModules {
  private states = new Map<string, State>();
  constructor(names: string[]) { for (const name of names) this.states.set(name,"pending"); }
  ready() { return [...this.states.values()].every(state=>state==="ready"); }
  snapshot() { return Object.fromEntries(this.states); }
  async start(name: string, initialize: () => Promise<void>, options: { attempts?: number; pause?: (ms:number)=>Promise<void>; warn?: (name:string,attempt:number)=>void } = {}) {
    if (!this.states.has(name)) throw Error("Unknown startup module");
    this.states.set(name,"starting");
    const attempts = options.attempts ?? 3;
    const pause = options.pause ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    for (let attempt=1;attempt<=attempts;attempt++) {
      try { await initialize(); this.states.set(name,"ready"); return; }
      catch {
        options.warn?.(name,attempt);
        if (attempt<attempts) await pause(Math.min(1000*2**(attempt-1),5000));
      }
    }
    this.states.set(name,"failed");
    throw Error(`${name} 初始化失败，服务尚未就绪`);
  }
}
