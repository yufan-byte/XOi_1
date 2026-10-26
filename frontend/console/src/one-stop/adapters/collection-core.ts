export interface CloudDocument {id:string;updatedAt?:number}
export interface CloudRow<T> {id:string;revision:number;updatedAt:number;payload:T}
export interface CollectionTransport<T>{list:(page:number)=>Promise<{items:CloudRow<T>[];hasMore:boolean}>;get:(id:string)=>Promise<CloudRow<T>>;put:(id:string,revision:number,payload:T)=>Promise<CloudRow<T>>;remove:(id:string,revision:number)=>Promise<unknown>}
type Dirty<T>={payload:T;version:number;revision:number;timer?:ReturnType<typeof setTimeout>;flight?:Promise<void>;error?:Error};
/** Memory mirror only; authoritative writes require an acknowledged server revision. Never prunes user data. */
export class CloudCollection<T extends CloudDocument>{
  private rows=new Map<string,CloudRow<T>>();private dirty=new Map<string,Dirty<T>>();private listeners=new Set<()=>void>();private page=0;private pendingLoad?:Promise<void>;private active=true;
  state:{items:T[];loading:boolean;ready:boolean;hasMore:boolean;error:string;saving:boolean;saveError:string}={items:[],loading:false,ready:false,hasMore:false,error:"",saving:false,saveError:""};
  constructor(private api:CollectionTransport<T>,private debounceMs=250){}
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  snapshot=()=>this.state;
  private emit(){if(!this.active)return;this.state={...this.state,items:[...this.rows.values()].map(r=>r.payload),saving:[...this.dirty.values()].some(d=>!d.error),saveError:[...this.dirty.values()].find(d=>d.error)?.error?.message||""};this.listeners.forEach(fn=>fn());}
  dispose(){this.active=false;for(const d of this.dirty.values())clearTimeout(d.timer);this.listeners.clear();}
  get(id:string){return this.rows.get(id)?.payload;}
  load(){if(this.pendingLoad)return this.pendingLoad;this.state={...this.state,loading:true,error:""};this.emit();
    const page=this.page+1;const promise=this.api.list(page).then(result=>{if(!this.active)return;for(const row of result.items)if(!this.dirty.has(row.id))this.rows.set(row.id,row);this.page=page;this.state={...this.state,ready:true,hasMore:result.hasMore};}).catch(e=>{if(this.active)this.state={...this.state,error:e instanceof Error?e.message:"项目读取失败"};throw e;}).finally(()=>{if(this.active){this.pendingLoad=undefined;this.state={...this.state,loading:false};this.emit();}});this.pendingLoad=promise;return promise;}
  async open(id:string){if(this.dirty.has(id))return this.get(id);const row=await this.api.get(id);if(!this.active)return;if(!this.dirty.has(id)){this.rows.set(id,row);this.emit();}return this.get(id);}
  upsert(item:T):T{
    if(!this.active||!this.state.ready)throw new Error("项目尚未加载，请稍后重试");
    const previous=this.dirty.get(item.id);
    const payload={...item,updatedAt:Date.now()},revision=this.rows.get(item.id)?.revision??0;
    const d:Dirty<T>=previous??{payload,revision,version:0};d.payload=payload;d.version++;clearTimeout(d.timer);this.dirty.set(item.id,d);
    this.rows.set(item.id,{id:item.id,revision,updatedAt:payload.updatedAt!,payload});
    if(!d.error)d.timer=setTimeout(()=>{void this.flush(item.id).catch(()=>{});},this.debounceMs);this.emit();return payload;
  }
  async flush(id:string):Promise<void>{
    const d=this.dirty.get(id);if(!d)return;if(d.error)throw d.error;clearTimeout(d.timer);if(d.flight)return d.flight;
    d.flight=(async()=>{try{while(this.active&&this.dirty.get(id)===d){const version=d.version,payload=d.payload;const row=await this.api.put(id,d.revision,payload);if(!this.active)return;d.revision=row.revision;
      if(version===d.version){this.rows.set(id,row);this.dirty.delete(id);break;}this.rows.set(id,{...row,payload:d.payload});
    }}catch(e){d.error=e instanceof Error?e:new Error("保存结果待核对，请勿重复提交");throw d.error;}finally{d.flight=undefined;this.emit();}})();return d.flight;
  }
  async flushAll(){await Promise.all([...this.dirty.keys()].map(id=>this.flush(id)));}
  async remove(id:string){await this.flush(id);const row=this.rows.get(id);if(!row)throw new Error("项目不存在");await this.api.remove(id,row.revision);if(this.active){this.rows.delete(id);this.emit();}}
  unsaved(){return [...this.dirty.values()].map(d=>d.payload);}
}
