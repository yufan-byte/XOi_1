import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';

type Question={title:string;description:string;confirm?:string;danger?:boolean};
const Context=createContext<(question:Question)=>Promise<boolean>>(async()=>false);
/** Confirmation protects replacement/deletion, not a repeated billing-budget prompt. */
export function ActionConfirmationProvider({children}:{children:React.ReactNode}){
  const [question,setQuestion]=useState<Question|null>(null);
  const pending=useRef<((value:boolean)=>void)|null>(null);
  const finish=useCallback((value:boolean)=>{const resolve=pending.current;pending.current=null;setQuestion(null);resolve?.(value);},[]);
  const ask=useCallback((next:Question)=>{
    if(pending.current)return Promise.resolve(false);
    return new Promise<boolean>(resolve=>{pending.current=resolve;setQuestion(next);});
  },[]);
  useEffect(()=>()=>{pending.current?.(false);pending.current=null;},[]);
  return <Context.Provider value={ask}>{children}{question&&<Dialog open onOpenChange={open=>{if(!open)finish(false);}}><DialogContent title={question.title} description={question.description} className="os-action-dialog"><p className="os-dialog-note">关闭或取消不会提交任何生成请求。</p><div className="os-dialog-actions"><Button variant="secondary" onClick={()=>finish(false)}>取消</Button><Button variant={question.danger?'danger':'default'} onClick={()=>finish(true)}>{question.confirm||'确认继续'}</Button></div></DialogContent></Dialog>}</Context.Provider>;
}
export const useActionConfirmation=()=>useContext(Context);
