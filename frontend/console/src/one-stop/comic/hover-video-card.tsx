import {useEffect,useRef,useState,type ReactNode} from 'react';

/** Local decorative previews only: no src or model request until deliberate interaction. */
export function HoverVideoCard({kind,label,selected,className,onSelect,children}:{kind:'premium'|'batch';label:string;selected:boolean;className:string;onSelect:()=>void;children:ReactNode}){
  const button=useRef<HTMLButtonElement>(null),video=useRef<HTMLVideoElement>(null),wanted=useRef(false),hovered=useRef(false),focused=useRef(false);
  const [playing,setPlaying]=useState(false),[failed,setFailed]=useState(false);
  const asset=kind==='premium'?'premium':'fast';
  const stop=()=>{wanted.current=false;video.current?.pause();setPlaying(false);};
  const start=(pointer=false)=>{
    const connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection;
    if(failed||document.hidden||connection?.saveData||matchMedia('(prefers-reduced-motion: reduce)').matches||(pointer&&!matchMedia('(hover: hover) and (pointer: fine)').matches))return;
    const v=video.current;if(!v)return;wanted.current=true;
    if(!v.getAttribute('src')){v.src=`/one-stop/brand/comic-mode-${asset}.mp4`;v.load();}
    void v.play().then(()=>{if(!wanted.current||document.hidden)v.pause();else setPlaying(true);}).catch(()=>setPlaying(false));
  };
  useEffect(()=>{const node=button.current,v=video.current;const hidden=()=>{if(document.hidden){wanted.current=false;v?.pause();setPlaying(false);}};
    const observer=new IntersectionObserver(entries=>{if(!entries[0]?.isIntersecting){wanted.current=false;v?.pause();setPlaying(false);}});if(node)observer.observe(node);document.addEventListener('visibilitychange',hidden);
    return()=>{wanted.current=false;v?.pause();observer.disconnect();document.removeEventListener('visibilitychange',hidden);};
  },[]);
  return <button ref={button} type="button" role="tab" aria-selected={selected} aria-label={label} onClick={onSelect} className={className}
    onMouseEnter={()=>{hovered.current=true;start(true);}} onMouseLeave={()=>{hovered.current=false;if(!focused.current)stop();}}
    onFocus={()=>{focused.current=true;start();}} onBlur={()=>{focused.current=false;if(!hovered.current)stop();}}>
    <span className="cs-mode-bg"><img src={`/one-stop/brand/comic-mode-${asset}.webp`} alt="" loading="eager" decoding="async"/><video ref={video} className={playing?'is-playing':''} aria-hidden="true" loop muted playsInline preload="none" disablePictureInPicture onError={()=>{setFailed(true);stop();}} onPause={()=>setPlaying(false)}/></span>
    {children}
  </button>;
}
