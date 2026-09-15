import {useEffect,useRef,useState} from 'react';
type Request={message:string;kind:'alert'|'confirm'|'prompt';value:string;resolve:(value:any)=>void};
let listener:((r:Request)=>void)|null=null;
const queue:Request[]=[];
function ask(kind:Request['kind'],message:string,value=''):Promise<any>{return new Promise(resolve=>{const r={kind,message,value,resolve};if(listener)listener(r);else queue.push(r)})}
export const alert=(message:string)=>ask('alert',message);
export const confirm=(message:string)=>ask('confirm',message);
export const prompt=(message:string,value='')=>ask('prompt',message,value);
export function useModalLock(active=true){
 useEffect(()=>{if(!active)return;const body=document.body,root=document.documentElement;const oldOverflow=body.style.overflow,oldPadding=body.style.paddingRight;const gap=Math.max(0,window.innerWidth-root.clientWidth);body.style.overflow='hidden';if(gap)body.style.paddingRight=`${gap}px`;root.classList.add('modal-open');return()=>{body.style.overflow=oldOverflow;body.style.paddingRight=oldPadding;root.classList.remove('modal-open')}},[active]);
}
export function DialogHost(){
 const [requests,setRequests]=useState<Request[]>([]),[value,setValue]=useState('');const box=useRef<HTMLDivElement>(null);const r=requests[0];
 useEffect(()=>{listener=r=>setRequests(old=>[...old,r]);queue.splice(0).forEach(listener);return()=>{listener=null}},[]);
 useEffect(()=>{setValue(r?.value||'');box.current?.querySelector<HTMLElement>('input,button')?.focus()},[r]);
 useModalLock(Boolean(r));
 const close=(result:any)=>{r.resolve(result);setRequests(old=>old.slice(1))};
 if(!r)return null;
 return <div className="modal themed-modal" onKeyDown={e=>{if(e.key==='Escape')close(r.kind==='prompt'?null:false);if(e.key==='Tab'){const all=box.current?.querySelectorAll<HTMLElement>('input,button');if(!all?.length)return;const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}}><div className="dialog themed-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={box}><div className="eyebrow">MACROTECH · PILOT</div><h2 id="dialog-title">{r.kind==='alert'?'Quotation workspace':r.kind==='confirm'?'Confirm action':'Review details'}</h2><p style={{whiteSpace:'pre-wrap'}}>{r.message}</p>{r.kind==='prompt'&&<input aria-label="Response" value={value} onChange={e=>setValue(e.target.value)}/>}<div className="dialog-actions">{r.kind!=='alert'&&<button className="secondary" onClick={()=>close(r.kind==='prompt'?null:false)}>Keep editing</button>}<button className="primary" onClick={()=>close(r.kind==='prompt'?value:true)}>{r.kind==='alert'?'Got it':'Continue'}</button></div></div></div>
}
