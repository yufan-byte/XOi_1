import {useCallback,useEffect,useRef,useState} from "react";
import {accountKey,assertAccountSession,oneStopRequest} from "../adapters/request";
import {useStudio,type Work,type WorkKind} from "./store";
import {MEDIA_HISTORY_POLICY} from "../../../../../shared/mediaHistoryPolicy";
type Page={items:Work[];hiddenTaskIds:string[];hasMore:boolean;nextCursor:number|null;policy:typeof MEDIA_HISTORY_POLICY};
export function useMediaHistory(kind:WorkKind){
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[hasMore,setMore]=useState(false);
  const owner=accountKey(),epoch=useRef<object>({}),cursor=useRef<number|null>(null),busy=useRef(false);
  const load=useCallback(async(more=false)=>{
    if(busy.current)return;const scope=epoch.current;busy.current=true;setLoading(true);
    try{
      assertAccountSession(owner);
      const ids=useStudio.getState().works.filter(w=>w.kind===kind&&w.taskId&&/^[A-Za-z0-9_-]{1,160}$/.test(w.taskId)).slice(-200).reverse().map(w=>w.taskId!);
      const known=ids.reduce((acc,id)=>acc.length+id.length+3<=6000?(acc?`${acc},${id}`:id):acc,"");
      const page=await oneStopRequest<Page>(`/api/one-stop/media-history?kind=${kind}${more&&cursor.current?`&before=${cursor.current}`:""}${known?`&known=${encodeURIComponent(known)}`:""}`);
      if(epoch.current!==scope)return;
      assertAccountSession(owner);useStudio.getState().ingestWorks(page.items,page.hiddenTaskIds,kind);setError("");
      // A burst of more than one page while away must not leave a permanent gap.
      if(more||cursor.current===null||!page.items.some(w=>ids.includes(w.taskId!))){cursor.current=page.nextCursor;setMore(page.hasMore);}
    }catch(e){if(epoch.current===scope)setError((e as Error).message);}
    finally{if(epoch.current===scope){busy.current=false;setLoading(false);}}
  },[kind,owner]);
  useEffect(()=>{
    const scope={};epoch.current=scope;cursor.current=null;busy.current=false;setMore(false);
    void (async()=>{
      try{
        assertAccountSession(owner);
        let legacy:Work[]=[];try{const saved=JSON.parse(localStorage.getItem("xoi-one-stop-studio")||"null");if(Array.isArray(saved?.state?.works))legacy=saved.state.works;}catch{}
        const local=useStudio.getState().works.filter(w=>!w.meta?.cloud||w.meta?.origin==="one-stop");
        const ids=[...new Set([...legacy,...local].filter(w=>w.kind===kind&&w.taskId&&/^[A-Za-z0-9_-]{1,160}$/.test(w.taskId)).map(w=>w.taskId!))];
        for(let i=0;i<ids.length;i+=200){await oneStopRequest("/api/one-stop/media-history/recover-local",{method:"POST",body:JSON.stringify({kind,taskIds:ids.slice(i,i+200)})});if(epoch.current!==scope)return;}
        // Cloud cache from the former mixed-module list is never evidence of origin.
        useStudio.setState(s=>({works:s.works.filter(w=>w.kind!==kind||!w.meta?.cloud||w.meta?.origin==="one-stop")}));
      }catch(e){if(epoch.current===scope)setError((e as Error).message);}
      if(epoch.current===scope)await load();
    })();
    const timer=setInterval(()=>{if(!document.hidden)void load();},30000);
    const focus=()=>{void load();};window.addEventListener("focus",focus);
    return()=>{epoch.current={};clearInterval(timer);window.removeEventListener("focus",focus);};
  },[load]);
  return {loading,error,hasMore,refresh:()=>load(),loadMore:()=>load(true),policy:MEDIA_HISTORY_POLICY};
}
