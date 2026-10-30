import React,{Suspense,lazy,useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {HashRouter,Navigate,Route,Routes,useLocation,useParams} from "react-router-dom";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "sonner";
import {getSelf} from "@/lib/api";
import {bootstrapConsoleSession, SESSION_SIGNAL_KEY} from "@/lib/session";
import {createLoginUrl} from "../../../../shared/loginNavigation";
import {collection} from "./adapters/collections";
import {accountKey,bindAccountSession,assertAccountSession} from "./adapters/request";
import {ActionConfirmationProvider} from './adapters/action-confirmation';
import "./styles.css";
import {prepareMediaSession} from '../../../shared/mediaSession';
const Home=lazy(()=>import("./comic/comic-home").then(m=>({default:m.ComicHome})));
const Workspace=lazy(()=>import("./comic/comic-workspace").then(m=>({default:m.ComicWorkspace})));
const Assets=lazy(()=>import("./comic/asset-library").then(m=>({default:m.ComicAssetLibrary})));
const Studio=lazy(()=>import("./video-studio").then(m=>({default:m.VideoStudio})));
const Clip=lazy(()=>import("./clip/clip-page").then(m=>({default:m.ClipPage})));
const ImageStudio=lazy(()=>import("./image-studio").then(m=>({default:m.ImageStudio})));
const AudioStudio=lazy(()=>import("./audio-studio").then(m=>({default:m.AudioStudio})));
const ChatStudio=lazy(()=>import("./chat-studio").then(m=>({default:m.ChatStudio})));
const PhoneUpload=lazy(()=>import("./studio/qr-upload").then(m=>({default:m.PhoneUploadPage})));
const query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
class RenderBoundary extends React.Component<{children:React.ReactNode},{failed:boolean;detail:string}>{
  state={failed:false,detail:""};
  static getDerivedStateFromError(e:unknown){return {failed:true,detail:e instanceof Error?`${e.message}`:String(e)};}
  componentDidCatch(e:unknown){console.error("[one-stop] 渲染失败",e);if(window.parent!==window)window.parent.postMessage({type:'xoi:one-stop-failed'},window.location.origin);}
  render(){return this.state.failed?<div className="one-stop-loading" role="alert"><h1>暂时无法显示这个项目</h1><p>{this.state.detail||"服务器记录未被删除。请返回列表后重新打开；仍有问题请联系管理员核对。"}</p><a href="/one-stop/#/comic" onClick={()=>this.setState({failed:false,detail:""})}>返回项目列表</a><button onClick={()=>window.location.reload()}>重新加载</button></div>:this.props.children;}
}
function Project(){const {id}=useParams();return <Workspace key={id} id={id!}/>;}
function Boundary(){const location=useLocation(),[state,setState]=useState({ready:false,error:""}),[revision,setRevision]=useState(0);
  useEffect(()=>{if(state.error&&window.parent!==window)window.parent.postMessage({type:'xoi:one-stop-failed'},window.location.origin);},[state.error]);
  useEffect(()=>{let active=true;setState({ready:false,error:""});void(async()=>{
    await bootstrapConsoleSession();
    if(!accountKey()){window.location.replace(createLoginUrl("/one-stop/"+window.location.hash));return;}
    bindAccountSession();
    const owner=assertAccountSession(),self=await getSelf();assertAccountSession(owner);
    if(String(self.id)!==owner.split(":")[0])throw new Error("账号会话不一致，请重新登录");
    await prepareMediaSession();assertAccountSession(owner);const col=collection("comic"),styles=collection("comic-styles");
    if(location.pathname.startsWith("/comic"))await Promise.all([col.state.ready?undefined:col.load(),styles.state.ready?undefined:styles.load()]);
    if(location.pathname==="/clip"){const clips=collection("clip");if(!clips.state.ready)await clips.load();}
    const id=/^\/comic\/([^/]+)$/.exec(location.pathname)?.[1];if(id&&id!=="assets")await col.open(decodeURIComponent(id));
    if(location.pathname==="/comic/assets"){const id=new URLSearchParams(location.search).get("project")||col.items[0]?.id;if(id)await col.open(id);}
    assertAccountSession(owner);if(active)setState({ready:true,error:""});
  })().catch(e=>{if(active)setState({ready:false,error:e instanceof Error?e.message:"服务暂不可用"});});return()=>{active=false;};},[location.pathname,location.search,revision]);
  useEffect(()=>{
    const reload=()=>{document.getElementById("root")?.replaceChildren();window.location.reload();};
    const check=()=>{if(state.ready)try{assertAccountSession();}catch{reload();}};
    const leave=(e:BeforeUnloadEvent)=>{if(["comic","comic-styles","clip"].some(name=>collection(name).state.saving||collection(name).state.saveError)){e.preventDefault();e.returnValue="";}};
    const changed=(e:StorageEvent)=>{if(e.key===SESSION_SIGNAL_KEY||e.key==="token"||e.key===null)reload();};
    window.addEventListener("beforeunload",leave);window.addEventListener("storage",changed);window.addEventListener("focus",check);window.addEventListener("pageshow",check);document.addEventListener("visibilitychange",check);
    return()=>{window.removeEventListener("beforeunload",leave);window.removeEventListener("storage",changed);window.removeEventListener("focus",check);window.removeEventListener("pageshow",check);document.removeEventListener("visibilitychange",check);};
  },[state.ready]);
  if(!state.ready)return <div className="one-stop-loading" role="status"><h1>XOi · AI 一站式</h1><p>{state.error||"正在验证账号并读取云端项目…"}</p>{state.error&&<button onClick={()=>setRevision(v=>v+1)}>重新加载</button>}<a href="/#/project">返回导演创作</a></div>;
  return <Suspense fallback={<div className="one-stop-loading">正在打开创作工作台…</div>}><Routes><Route path="/comic" element={<Home/>}/><Route path="/comic/assets" element={<Assets/>}/><Route path="/comic/:id" element={<Project/>}/><Route path="/video-studio" element={<Studio/>}/><Route path="/image" element={<ImageStudio/>}/><Route path="/audio" element={<AudioStudio/>}/><Route path="/chat" element={<ChatStudio/>}/><Route path="/clip" element={<Clip/>}/><Route path="/upload" element={<PhoneUpload/>}/><Route path="*" element={<Navigate to="/comic" replace/>}/></Routes></Suspense>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={query}><HashRouter><ActionConfirmationProvider><RenderBoundary><Boundary/></RenderBoundary></ActionConfirmationProvider></HashRouter><Toaster richColors position="top-center"/></QueryClientProvider></React.StrictMode>);
