import {useEffect,useState} from 'react';
import {api,type Draft} from './App';
import {useModalLock} from './dialogs';

export function ApprovalEmailPreview({draft,close}:{draft:Draft;close:()=>void}){
  useModalLock();
  const [html,setHtml]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let active=true;api('approval_email_preview',draft).then(value=>{if(active)setHtml(value)}).catch(e=>{if(active)setError(String(e))});return()=>{active=false}},[draft]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')close()};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[close]);
  return <div className="modal"><section className="dialog email-preview-dialog" role="dialog" aria-modal="true" aria-label="Approval email preview">
    <div className="dialog-head"><h2>Approval email preview</h2><button className="secondary" autoFocus onClick={close}>Close preview</button></div>
    <p role="status">Offline only. No email or approval action is sent.</p>
    {error?<p role="alert">{error}</p>:html?<iframe title="Macrotech approval email" sandbox="" srcDoc={html}/>:<p>Preparing preview…</p>}
  </section></div>;
}
