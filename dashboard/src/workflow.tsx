import {useEffect,useRef,useState} from 'react';
import {api,type Draft,type Boot} from './App';
import {alert,confirm,prompt} from './dialogs';

export function SaveControl({draft,editable}:{draft:Draft;editable:boolean}){
 const latest=useRef(draft);latest.current=draft;
 const [state,setState]=useState('Saved locally'),[at,setAt]=useState(draft.updated_at),[busy,setBusy]=useState(false);
 const first=useRef(true),generation=useRef(0);
 const save=async()=>{const snapshot=latest.current,version=generation.current;setBusy(true);setState('Saving…');try{const result=await api('save_draft',snapshot);if(version===generation.current){setState('Saved locally');setAt(result.savedAt)}}catch(e){setState('Save failed — retry');await alert(String(e))}finally{setBusy(false)}};
 useEffect(()=>{if(first.current){first.current=false;return}if(!editable)return;generation.current++;setState('Unsaved changes');const timer=setTimeout(()=>{void save()},650);return()=>clearTimeout(timer)},[draft,editable]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(editable)void save()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[editable]);
 return <div className="save-control"><div role="status"><b>{editable?state:'Submitted revision saved'}</b><small>{at?new Date(at).toLocaleTimeString():''} · This computer</small><small>Local pilot · Cloud not connected</small></div>{editable&&<button className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'} <small>Ctrl+S</small></button>}</div>;
}

export function SyncStatus({draft}:{draft:Draft}){
 const sync=draft.pilot_meta?.sync,mirror=draft.pilot_meta?.mirror;
 if(!sync)return null;
 return <div className={`sync-status ${sync.state==='SYNCED'?'synced':'pending'}`} role="status"><b>{sync.state==='SYNCED'?'✓ Test master synchronized':'Quotation saved · Test master update pending'}</b><p>{sync.message}</p><small>{new Date(sync.at).toLocaleString()}{sync.state!=='SYNCED'?' · Contact the pilot administrator; do not create a duplicate.':''}</small>{mirror&&<p>Personal Tracker: {mirror.state==='SYNCED'?'updated':`pending — ${mirror.message}`}. Master synchronization is unaffected.</p>}</div>;
}

export function RecordActions({draft,done}:{draft:Draft;done:()=>void}){
 const removable=!draft.q_code&&!draft.source_q_code&&['QUOTATION_DRAFT','RFQ_RECEIVED'].includes(draft.status);
 const archiveable=(['QUOTATION_DRAFT','RFQ_RECEIVED'].includes(draft.status)&&!!(draft.q_code||draft.source_q_code))||['RETURNED_FOR_CORRECTION','REJECTED','RECALLED','EXPIRED','CLOSED'].includes(draft.status);
 const action=async()=>{try{if(draft.pilot_meta?.archived){await api('set_archived',draft.draft_id,false,'');done();return}if(removable){if(!await confirm('Delete this unassigned local draft? This cannot be undone in the application.'))return;await api('delete_draft',draft.draft_id)}else{const reason=await prompt('Reason for archiving (internal only). The assigned Q-Code, history and Tracker rows will be retained.','');if(!reason?.trim())return;await api('set_archived',draft.draft_id,true,reason)}done()}catch(e){await alert(String(e))}};
 if(!draft.pilot_meta?.archived&&!removable&&!archiveable)return null;
 return <button className="ghost record-action" onClick={()=>void action()}>{draft.pilot_meta?.archived?'Restore quotation':removable?'Delete draft':'Archive quotation'}</button>;
}

export function TrackerSettings({boot,role,refresh,openDraft}:{boot:Boot;role:string;refresh:()=>Promise<void>;openDraft:(d:Draft)=>void}){
 const [sheet,setSheet]=useState(boot.pilotSettings?.employeeSheetId||''),[mirror,setMirror]=useState(false),[lookup,setLookup]=useState('');
 const run=async(fn:()=>Promise<unknown>)=>{try{await fn();await refresh()}catch(e){await alert(String(e))}};
 return <section className="card tracker-settings"><h2>My Tracker</h2><p>Your linked employee test sheet is an optional transition tool. The application remains your main quotation workspace.</p><label>Employee Google Sheets URL or ID<input value={sheet} onChange={e=>setSheet(e.target.value)} placeholder="Paste the entire Google Sheets link"/></label><div className="head-actions"><button className="secondary" onClick={()=>run(()=>api('remember_employee_tracker',sheet))}>Save personal Tracker link</button>{boot.pilotSettings?.employeeSheetId&&<button className="ghost" onClick={()=>run(()=>api('open_employee_tracker'))}>Open my Tracker</button>}</div><div className="field"><label>Import another quotation — Q-Code or exact RFQ</label><input value={lookup} onChange={e=>setLookup(e.target.value)}/><button className="secondary" disabled={!sheet||!lookup} onClick={()=>run(async()=>openDraft(await api("load_employee_sheet",sheet,lookup)))}>Import quotation</button></div><p>Saving a link does not grant write access. Imports are read-only; mirroring requires CEO test setup and a verified template.</p>{role==='CEO'&&<><hr/><h2>Controlled test synchronization</h2><p>Master destination: existing Pilot Dummy only. Live 2026 TR is blocked. This local role selector is a simulation, not production access control.</p><p>Credentials: {boot.pilotSettings?.credentialsAvailable?'available locally':'not configured'} · Automatic sync: {boot.pilotSettings?.dummySyncEnabled?'enabled':'disabled'}</p><label><input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)}/> Also authorize the currently linked employee sheet as a test mirror</label><p>The mirror must have the verified MARK-UP, ACTUAL and _PILOT_CONFIG template. Dependency tabs can be hidden; incompatible templates are never rewritten.</p><button className="primary" onClick={()=>run(async()=>{if(mirror&&!sheet.trim()){await alert('Link an employee test Tracker first.');return}if(await confirm('Enable automatic writes only to the existing Dummy Tracker'+(mirror?' and the linked employee TEST sheet':'')+'? Confirm these are approved test destinations. No existing rows will be cleared.'))await api('configure_pilot_sync',true,mirror?sheet:'')})}>Enable test synchronization</button><button className="ghost" onClick={()=>run(()=>api('configure_pilot_sync',false,''))}>Disable test synchronization</button><p>Enabling does not send queued writes immediately. Submit, approve or use the retry below.</p>{boot.saved.filter(d=>d.pilot_meta?.sync?.state==='PENDING'||d.pilot_meta?.mirror?.state==='PENDING').map(d=><div className="retry-row" key={d.draft_id}><span>{d.q_code} · {d.revision} · {d.customer}</span><button className="secondary" onClick={()=>run(()=>api('sync_dummy',d))}>Retry synchronization</button></div>)}</>}</section>;
}

type Attachment={id:string;name:string;size:number;type:string;available:boolean};
export function ExtraAttachments({draft}:{draft:Draft}){
 const [files,setFiles]=useState<Attachment[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{api('list_attachments',draft.draft_id).then(setFiles).catch(e=>alert(String(e)))},[draft.draft_id]);
 const run=async(method:string,...args:unknown[])=>{setBusy(true);try{setFiles(await api(method,draft.draft_id,...args))}catch(e){await alert(String(e))}finally{setBusy(false)}};
 return <div className="extra-attachments"><div className="head-actions"><b>Additional customer attachments</b><button className="secondary" disabled={busy} onClick={()=>void run('add_attachments')}>+ Attach files</button></div><small>PDF, images, DOCX, XLSX or text · 15 MB combined. Private sourcing data is never attached automatically.</small>{files.map(f=><div className="attachment" key={f.id}><span><b>{f.name}</b><small>{f.type.toUpperCase()} · {(f.size/1024).toFixed(1)} KB · {f.available?'Saved locally':'Missing — remove and attach again'}</small></span><button className="ghost" disabled={busy} onClick={()=>void run('remove_attachment',f.id)}>Remove</button></div>)}</div>;
}
