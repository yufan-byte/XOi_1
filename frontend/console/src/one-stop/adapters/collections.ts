import {useSyncExternalStore} from "react";
import {CloudCollection,type CloudDocument,type CloudRow} from "./collection-core";
import {accountKey,oneStopRequest} from "./request";
const stores=new Map<string,CloudCollection<CloudDocument>>();let owner="";
export function collection<T extends {id:string;updatedAt?:number}>(name:string){
  if(!["comic","comic-styles","clip"].includes(name))throw new Error("不支持的项目类型");
  const token=accountKey();if(owner!==token){stores.forEach(s=>s.dispose());stores.clear();owner=token;}
  let existing=stores.get(name);if(!existing){const query=`collection=${encodeURIComponent(name)}`;
    const request=<R>(url:string,init?:RequestInit)=>{if(accountKey()!==token)throw new Error("账号已切换，请重新加载");return oneStopRequest<R>(url,init);};
    existing=new CloudCollection<CloudDocument>({
      list:page=>request(`/api/one-stop/documents?${query}&page=${page}&pageSize=20`),get:id=>request(`/api/one-stop/documents/${encodeURIComponent(id)}?${query}`),
      put:(id,revision,payload)=>request<CloudRow<CloudDocument>>(`/api/one-stop/documents/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({collection:name,revision,title:String((payload as {name?:unknown}).name||"未命名项目").slice(0,160),payload})}),
      remove:(id,revision)=>request(`/api/one-stop/documents/${encodeURIComponent(id)}`,{method:"DELETE",body:JSON.stringify({collection:name,revision})}),
    });stores.set(name,existing);
  }
  const store=existing as unknown as CloudCollection<T>;
  return {get items(){return store.state.items;},list:()=>store.state.items,get:store.get.bind(store),upsert:store.upsert.bind(store),remove:store.remove.bind(store),flush:store.flush.bind(store),flushAll:store.flushAll.bind(store),load:store.load.bind(store),open:store.open.bind(store),subscribe:store.subscribe,snapshot:store.snapshot,get state(){return store.state;},unsaved:store.unsaved.bind(store)};
}
export function useCollection<T extends {id:string;updatedAt?:number}>(name:string){const col=collection<T>(name);const state=useSyncExternalStore(col.subscribe,col.snapshot);return {...col,items:state.items as T[]};}
export async function flushCollections(){await Promise.all([...stores.values()].map(s=>s.flushAll()));}
