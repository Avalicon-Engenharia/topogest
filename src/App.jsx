// ============================================================
//  TopoGest — Gestão de Serviços de Topografia  v2.0
//  Firebase Firestore · Bugs corrigidos · Otimizado
// ============================================================
//  CONFIGURAÇÃO:
//  1. Acesse https://console.firebase.google.com
//  2. Crie um projeto → "Adicionar app" → Web
//  3. Copie os dados do firebaseConfig e cole abaixo
//  4. No Firebase: Firestore Database → Criar banco → Modo teste
//  5. npm install firebase
// ============================================================

import {
  useState, useEffect, useCallback, useMemo, useRef, memo,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, query, orderBy,
} from "firebase/firestore";

// ▼▼▼ COLE AQUI OS DADOS DO SEU PROJETO FIREBASE ▼▼▼
const firebaseConfig = {
  apiKey:            "AIzaSyCEmi_60w9g7S2brzIaIgbAG0pc14qEW_k",
  authDomain:        "topogest-d078b.firebaseapp.com",
  projectId:         "topogest-d078b",
  storageBucket:     "topogest-d078b.firebasestorage.app",
  messagingSenderId: "937539712250",
  appId:             "1:937539712250:web:90f59a654fce020e858543",
};
// ▲▲▲ FIM DA CONFIGURAÇÃO ▲▲▲

// FIX: guarda contra double-init (React StrictMode) e config vazio
const isConfigured = Object.values(firebaseConfig).every(v => v !== "COLE_AQUI");
const firebaseApp  = isConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;
const db           = firebaseApp ? getFirestore(firebaseApp) : null;
const servicesCol  = db ? collection(db, "services") : null;

const SERVICE_TYPES = [
  "Levantamento Planimétrico","Levantamento Altimétrico",
  "Levantamento Topográfico","Georreferenciamento",
  "Locação de Obra","Perfil Longitudinal/Transversal",
  "Cadastro Técnico","Divisão de Gleba",
  "Levantamento Batimétrico","Outro",
];

const STATUS_CONFIG = {
  Aguardando:      { color:"#6b7280", bg:"#1f2937" },
  "Em Campo":      { color:"#f59e0b", bg:"#451a03" },
  "Em Escritório": { color:"#3b82f6", bg:"#1e3a5f" },
  Concluído:       { color:"#10b981", bg:"#064e3b" },
  Entregue:        { color:"#8b5cf6", bg:"#2e1065" },
  Cancelado:       { color:"#ef4444", bg:"#450a0a" },
};

// FIX: função → data calculada no momento de abertura, não na carga do módulo
function makeEmptyForm() {
  return { name:"",client:"",type:"",status:"Aguardando",
    date:new Date().toISOString().slice(0,10),
    deadline:"",value:"",location:"",notes:"",area:"" };
}

function formatCurrency(val) {
  const n = typeof val==="number" ? val : parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}

function formatDate(d) {
  if (!d) return "—";
  const p=d.split("-");
  if (p.length!==3) return d;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function isOverdue(svc) {
  if (!svc.deadline) return false;
  if (["Concluído","Entregue","Cancelado"].includes(svc.status)) return false;
  return new Date(svc.deadline+"T00:00:00") < new Date();
}

// FIX: memo evita re-render do SVG decorativo a cada mudança de estado
const TopoLines = memo(function TopoLines() {
  const paths = [
    "M0,300 Q200,250 400,310 T800,290","M0,320 Q200,270 400,330 T800,310",
    "M0,340 Q200,290 400,350 T800,330","M0,360 Q200,310 400,370 T800,350",
    "M0,380 Q200,330 400,390 T800,370","M0,280 Q200,230 400,290 T800,270",
    "M0,260 Q200,210 400,270 T800,250","M0,240 Q200,190 400,250 T800,230",
    "M0,220 Q200,170 400,230 T800,210","M0,400 Q200,350 400,410 T800,390",
    "M0,420 Q200,370 400,430 T800,410","M0,200 Q200,150 400,210 T800,190",
  ];
  return (
    <svg style={{position:"fixed",inset:0,width:"100%",height:"100%",
      opacity:0.04,pointerEvents:"none",zIndex:0}}
      viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      {paths.map((d,i)=>(
        <path key={d} d={d} fill="none" stroke="#f59e0b"
          strokeWidth={i%5===0?"1.5":"0.8"}/>
      ))}
    </svg>
  );
});

function SyncIndicator({status}) {
  const map={
    loading:{color:"#6b7280",label:"Carregando..."},
    synced: {color:"#10b981",label:"Sincronizado"},
    syncing:{color:"#f59e0b",label:"Salvando..."},
    error:  {color:"#ef4444",label:"Erro Firebase — revise o config"},
    offline:{color:"#6b7280",label:"Firebase não configurado"},
  };
  const cfg=map[status]||map.synced;
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,
      fontSize:11,color:cfg.color,fontFamily:"'Space Mono',monospace"}}>
      <span style={{width:7,height:7,borderRadius:"50%",flexShrink:0,
        background:cfg.color,boxShadow:`0 0 6px ${cfg.color}`,
        animation:["loading","syncing"].includes(status)?"pulse 1s infinite":"none"}}/>
      {cfg.label}
    </div>
  );
}

function Badge({status}) {
  const cfg=STATUS_CONFIG[status]||STATUS_CONFIG["Aguardando"];
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,
      padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
      letterSpacing:"0.05em",textTransform:"uppercase",
      color:cfg.color,backgroundColor:cfg.bg,
      border:`1px solid ${cfg.color}40`,fontFamily:"'Space Mono',monospace",
      whiteSpace:"nowrap",flexShrink:0}}>
      <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
        backgroundColor:cfg.color,boxShadow:`0 0 6px ${cfg.color}`}}/>
      {status}
    </span>
  );
}

// FIX: dialog customizado substitui window.confirm() — bloqueado em alguns browsers mobile
function ConfirmDialog({open,message,onConfirm,onCancel}) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
      zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#1f2937",border:"1px solid #374151",
        borderRadius:14,padding:28,maxWidth:360,width:"100%",
        textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.8)",
        animation:"modalIn 0.2s ease"}}>
        <div style={{fontSize:36,marginBottom:12}}>🗑</div>
        <p style={{color:"#f1f5f9",fontSize:15,marginBottom:24,lineHeight:1.5}}>{message}</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px 0",
            background:"transparent",border:"1px solid #374151",borderRadius:8,
            color:"#9ca3af",fontWeight:700,cursor:"pointer",fontSize:14,
            fontFamily:"'Space Mono',monospace"}}>Cancelar</button>
          <button onClick={onConfirm} style={{flex:1,padding:"11px 0",
            background:"#ef4444",border:"none",borderRadius:8,color:"#fff",
            fontWeight:800,cursor:"pointer",fontSize:14,
            fontFamily:"'Space Mono',monospace"}}>Excluir</button>
        </div>
      </div>
    </div>
  );
}

function Modal({open,onClose,children}) {
  useEffect(()=>{
    document.body.style.overflow=open?"hidden":"";
    return ()=>{document.body.style.overflow="";};
  },[open]);
  // FIX: fecha com tecla Escape
  useEffect(()=>{
    if (!open) return;
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[open,onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,
      background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",
      zIndex:1000,display:"flex",alignItems:"center",
      justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#111827",border:"1px solid #374151",borderRadius:16,
        width:"100%",maxWidth:580,maxHeight:"90vh",overflowY:"auto",
        padding:28,boxShadow:"0 25px 60px rgba(0,0,0,0.8),0 0 0 1px #f59e0b20",
        animation:"modalIn 0.2s ease"}}>
        {children}
      </div>
    </div>
  );
}

const inputStyle={
  width:"100%",background:"#0f172a",border:"1px solid #1f2937",
  borderRadius:8,color:"#f1f5f9",padding:"10px 14px",fontSize:14,
  fontFamily:"inherit",outline:"none",boxSizing:"border-box",
  transition:"border-color 0.2s",
};

function FormField({label,required,half,children}) {
  return (
    <div style={{gridColumn:half?"span 1":"span 2",marginBottom:4}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,
        letterSpacing:"0.1em",textTransform:"uppercase",color:"#9ca3af",
        marginBottom:6,fontFamily:"'Space Mono',monospace"}}>
        {label} {required&&<span style={{color:"#f59e0b"}}>*</span>}
      </label>
      {children}
    </div>
  );
}

// FIX: useEffect sincroniza form quando `initial` muda entre edições
//      Antes: editar A → fechar → abrir B → ainda mostrava dados de A
function ServiceForm({initial,onSave,onClose,saving}) {
  const [form,setForm]=useState(()=>initial?{...initial}:makeEmptyForm());
  useEffect(()=>{setForm(initial?{...initial}:makeEmptyForm());},[initial]);
  const set=useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[]);
  const valid=form.name.trim()&&form.client.trim()&&form.type;

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,color:"#f59e0b",
          fontFamily:"'Space Mono',monospace",margin:0}}>
          {initial?.id?"✎ Editar Serviço":"+ Novo Serviço"}
        </h2>
        <button onClick={onClose} aria-label="Fechar" style={{background:"none",
          border:"none",color:"#6b7280",fontSize:24,cursor:"pointer",
          lineHeight:1,padding:4}}>×</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <FormField label="Nome do Serviço" required half>
          <input style={inputStyle} value={form.name}
            onChange={e=>set("name",e.target.value)}
            placeholder="Ex: Levantamento Fazenda Santa Clara"/>
        </FormField>
        <FormField label="Cliente" required half>
          <input style={inputStyle} value={form.client}
            onChange={e=>set("client",e.target.value)}
            placeholder="Nome do cliente ou empresa"/>
        </FormField>
        <FormField label="Tipo de Serviço" required>
          <select style={{...inputStyle,cursor:"pointer"}} value={form.type}
            onChange={e=>set("type",e.target.value)}>
            <option value="">Selecionar...</option>
            {SERVICE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Status" half>
          <select style={{...inputStyle,cursor:"pointer"}} value={form.status}
            onChange={e=>set("status",e.target.value)}>
            {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Área (ha ou m²)" half>
          <input style={inputStyle} value={form.area}
            onChange={e=>set("area",e.target.value)} placeholder="Ex: 12,5 ha"/>
        </FormField>
        <FormField label="Data de Início" half>
          <input style={inputStyle} type="date" value={form.date}
            onChange={e=>set("date",e.target.value)}/>
        </FormField>
        <FormField label="Prazo de Entrega" half>
          <input style={inputStyle} type="date" value={form.deadline}
            onChange={e=>set("deadline",e.target.value)}/>
        </FormField>
        <FormField label="Localização / Município">
          <input style={inputStyle} value={form.location}
            onChange={e=>set("location",e.target.value)}
            placeholder="Ex: Ribeirão Preto - SP"/>
        </FormField>
        <FormField label="Valor do Serviço (R$)">
          <input style={inputStyle} type="number" min="0" step="0.01"
            value={form.value} onChange={e=>set("value",e.target.value)}
            placeholder="0,00"/>
        </FormField>
        <FormField label="Observações">
          <textarea style={{...inputStyle,minHeight:70,resize:"vertical"}}
            value={form.notes} onChange={e=>set("notes",e.target.value)}
            placeholder="Informações adicionais..."/>
        </FormField>
      </div>
      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button onClick={onClose} disabled={saving}
          style={{flex:1,padding:"12px 0",background:"transparent",
            border:"1px solid #374151",borderRadius:8,color:"#9ca3af",
            fontWeight:700,cursor:"pointer",fontSize:14,
            fontFamily:"'Space Mono',monospace"}}>Cancelar</button>
        <button onClick={()=>valid&&onSave(form)} disabled={!valid||saving}
          style={{flex:2,padding:"12px 0",
            background:valid&&!saving?"linear-gradient(135deg,#d97706,#f59e0b)":"#1f2937",
            border:"none",borderRadius:8,
            color:valid&&!saving?"#000":"#4b5563",
            fontWeight:800,cursor:valid&&!saving?"pointer":"not-allowed",
            fontSize:14,fontFamily:"'Space Mono',monospace",
            letterSpacing:"0.05em",transition:"all 0.2s"}}>
          {saving?"SALVANDO...":"SALVAR NA NUVEM ☁"}
        </button>
      </div>
    </>
  );
}

// FIX: memo evita re-render de cards não alterados
// FIX: hover via useState (sem manipulação direta do DOM — anti-pattern React)
// FIX: useRef + listener global fecha menu ao clicar fora (funciona no mobile)
const ServiceCard=memo(function ServiceCard({svc,onEdit,onDelete,onStatusChange}) {
  const [menu,setMenu]=useState(false);
  const [hover,setHover]=useState(false);
  const menuRef=useRef(null);
  const overdue=isOverdue(svc);

  useEffect(()=>{
    if (!menu) return;
    const h=e=>{
      if (menuRef.current&&!menuRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener("mousedown",h);
    document.addEventListener("touchstart",h);
    return ()=>{
      document.removeEventListener("mousedown",h);
      document.removeEventListener("touchstart",h);
    };
  },[menu]);

  return (
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{background:"#111827",
        border:`1px solid ${hover?"#374151":"#1f2937"}`,
        borderLeft:`3px solid ${STATUS_CONFIG[svc.status]?.color||"#6b7280"}`,
        borderRadius:12,padding:"16px 18px",position:"relative",
        transform:hover?"translateY(-2px)":"none",
        boxShadow:hover?"0 8px 24px rgba(0,0,0,0.4)":"none",
        transition:"transform 0.15s,box-shadow 0.15s,border-color 0.15s",
        animation:"fadeIn 0.3s ease both"}}>

      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9",
            marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {overdue&&<span title="Prazo vencido" style={{marginRight:5}}>⚠️</span>}
            {svc.name}
          </div>
          <div style={{fontSize:12,color:"#6b7280",fontFamily:"'Space Mono',monospace"}}>
            {svc.client}
          </div>
        </div>
        <div ref={menuRef} style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <Badge status={svc.status}/>
          <button onClick={e=>{e.stopPropagation();setMenu(m=>!m);}}
            aria-label="Opções"
            style={{background:"none",border:"none",color:"#6b7280",
              cursor:"pointer",fontSize:18,padding:"2px 6px",borderRadius:6}}>⋮</button>
          {menu&&(
            <div style={{position:"absolute",top:44,right:12,
              background:"#1f2937",border:"1px solid #374151",
              borderRadius:10,overflow:"hidden",zIndex:10,minWidth:175,
              boxShadow:"0 10px 30px rgba(0,0,0,0.6)"}}>
              {Object.keys(STATUS_CONFIG).map(s=>(
                <button key={s}
                  onClick={e=>{e.stopPropagation();onStatusChange(svc.id,s);setMenu(false);}}
                  style={{display:"block",width:"100%",padding:"9px 14px",
                    background:svc.status===s?"#374151":"none",
                    border:"none",color:STATUS_CONFIG[s].color,fontSize:12,
                    textAlign:"left",cursor:"pointer",
                    fontFamily:"'Space Mono',monospace",fontWeight:600}}>
                  {s}
                </button>
              ))}
              <div style={{height:1,background:"#374151"}}/>
              <button onClick={e=>{e.stopPropagation();onEdit(svc);setMenu(false);}}
                style={{display:"block",width:"100%",padding:"9px 14px",
                  background:"none",border:"none",color:"#f59e0b",fontSize:12,
                  textAlign:"left",cursor:"pointer",
                  fontFamily:"'Space Mono',monospace",fontWeight:600}}>
                ✎ Editar
              </button>
              <button onClick={e=>{e.stopPropagation();onDelete(svc.id,svc.name);setMenu(false);}}
                style={{display:"block",width:"100%",padding:"9px 14px",
                  background:"none",border:"none",color:"#ef4444",fontSize:12,
                  textAlign:"left",cursor:"pointer",
                  fontFamily:"'Space Mono',monospace",fontWeight:600}}>
                🗑 Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:"6px 16px",
        marginTop:12,fontSize:12,color:"#9ca3af",fontFamily:"'Space Mono',monospace"}}>
        {svc.type&&<span style={{color:"#60a5fa"}}>◈ {svc.type}</span>}
        {svc.location&&<span>📍 {svc.location}</span>}
        {svc.area&&<span>⬡ {svc.area}</span>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginTop:12,paddingTop:10,borderTop:"1px solid #1f2937"}}>
        <div style={{fontSize:11,color:"#6b7280",fontFamily:"'Space Mono',monospace"}}>
          {formatDate(svc.date)}
          {svc.deadline&&(
            <span style={{marginLeft:8,color:overdue?"#ef4444":"#6b7280"}}>
              → {formatDate(svc.deadline)}{overdue&&" ⚠"}
            </span>
          )}
        </div>
        {svc.value!=null&&svc.value!==""&&(
          <div style={{fontSize:14,fontWeight:800,color:"#10b981",
            fontFamily:"'Space Mono',monospace"}}>
            {formatCurrency(svc.value)}
          </div>
        )}
      </div>
    </div>
  );
});

const StatCard=memo(function StatCard({label,value,color,icon}) {
  return (
    <div style={{background:"#111827",border:"1px solid #1f2937",
      borderRadius:12,padding:"16px 20px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,right:0,fontSize:48,
        opacity:0.06,lineHeight:1,padding:8,pointerEvents:"none"}}>{icon}</div>
      <div style={{fontSize:22,fontWeight:900,color,fontFamily:"'Space Mono',monospace"}}>{value}</div>
      <div style={{fontSize:11,color:"#6b7280",marginTop:4,
        letterSpacing:"0.08em",textTransform:"uppercase"}}>{label}</div>
    </div>
  );
});

function SkeletonCard() {
  return (
    <div style={{background:"#111827",border:"1px solid #1f2937",
      borderLeft:"3px solid #1f2937",borderRadius:12,padding:"16px 18px"}}>
      {[["70%","15px","0"],["40%","12px","8px"],["100%","6px","20px"]].map(([w,h,mt],i)=>(
        <div key={i} style={{width:w,height:h,background:"#1f2937",
          borderRadius:4,marginTop:mt,animation:"shimmer 1.5s infinite alternate"}}/>
      ))}
    </div>
  );
}

export default function App() {
  const [services,     setServices]     = useState([]);
  const [syncStatus,   setSyncStatus]   = useState(isConfigured?"loading":"offline");
  const [loading,      setLoading]      = useState(isConfigured);
  const [modal,        setModal]        = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [view,         setView]         = useState("cards");
  const [tab,          setTab]          = useState("servicos");
  const [confirmDel,   setConfirmDel]   = useState(null);

  useEffect(()=>{
    if (!servicesCol) return;
    const q=query(servicesCol,orderBy("createdAt","desc"));
    const unsub=onSnapshot(q,
      snap=>{
        setServices(snap.docs.map(d=>({id:d.id,...d.data()})));
        setSyncStatus("synced");
        setLoading(false);
      },
      err=>{
        console.error("Firestore:",err);
        setSyncStatus("error");
        setLoading(false);
      }
    );
    return ()=>unsub();
  },[]);

  const saveService=useCallback(async(form)=>{
    if (!db) return;
    setSaving(true);
    setSyncStatus("syncing");
    try {
      const {id,...data}=form;
      // FIX: value salvo como número no Firestore
      const payload={...data,
        value:data.value!==""&&data.value!=null?parseFloat(data.value):null};
      if (id) {
        await updateDoc(doc(db,"services",id),{...payload,updatedAt:serverTimestamp()});
      } else {
        await addDoc(servicesCol,{...payload,createdAt:serverTimestamp()});
      }
      setModal(null);
    } catch(e) {
      console.error(e);
      alert("Erro ao salvar. Verifique a configuração do Firebase.");
      setSyncStatus("error");
    } finally {
      setSaving(false);
    }
  },[]);

  const requestDelete=useCallback((id,name)=>setConfirmDel({id,name}),[]);

  const confirmDelete=useCallback(async()=>{
    if (!confirmDel||!db) return;
    setSyncStatus("syncing");
    try {
      await deleteDoc(doc(db,"services",confirmDel.id));
    } catch(e) {
      console.error(e);
      setSyncStatus("error");
    }
    setConfirmDel(null);
  },[confirmDel]);

  // FIX: setSyncStatus("synced") após changeStatus (antes ficava preso em "syncing")
  const changeStatus=useCallback(async(id,status)=>{
    if (!db) return;
    setSyncStatus("syncing");
    try {
      await updateDoc(doc(db,"services",id),{status,updatedAt:serverTimestamp()});
      setSyncStatus("synced");
    } catch(e) {
      console.error(e);
      setSyncStatus("error");
    }
  },[]);

  const openEdit=useCallback((svc)=>setModal(svc),[]);
  const closeModal=useCallback(()=>{if(!saving)setModal(null);},[saving]);

  // FIX: useMemo evita recalcular filtro a cada render
  const filtered=useMemo(()=>{
    const q=search.toLowerCase();
    return services.filter(s=>{
      const matchQ=!q||[s.name,s.client,s.location,s.type].some(v=>v?.toLowerCase().includes(q));
      return matchQ&&(filterStatus==="Todos"||s.status===filterStatus);
    });
  },[services,search,filterStatus]);

  // FIX: stats em passagem única O(n) em vez de múltiplos .filter separados
  const stats=useMemo(()=>{
    let pendentes=0,emCampo=0,atrasados=0,faturamento=0;
    const statusMap=Object.fromEntries(Object.keys(STATUS_CONFIG).map(k=>[k,0]));
    for (const s of services) {
      statusMap[s.status]=(statusMap[s.status]||0)+1;
      if (["Aguardando","Em Campo","Em Escritório"].includes(s.status)) pendentes++;
      if (s.status==="Em Campo") emCampo++;
      if (isOverdue(s)) atrasados++;
      if (s.status!=="Cancelado"&&s.value) faturamento+=parseFloat(s.value)||0;
    }
    return {pendentes,emCampo,atrasados,faturamento,statusMap};
  },[services]);

  const typeStats=useMemo(()=>SERVICE_TYPES.map(type=>{
    const list=services.filter(s=>s.type===type);
    if (!list.length) return null;
    const revenue=list.filter(s=>s.status!=="Cancelado")
      .reduce((a,s)=>a+(parseFloat(s.value)||0),0);
    return {type,count:list.length,revenue};
  }).filter(Boolean),[services]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0a0f1a}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:#0a0f1a}
        ::-webkit-scrollbar-thumb{background:#1f2937;border-radius:3px}
        select option{background:#111827;color:#f1f5f9}
        @keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(10px)}to{opacity:1;transform:none}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes shimmer{from{opacity:0.4}to{opacity:0.7}}
        input:focus,select:focus,textarea:focus{border-color:#f59e0b!important;box-shadow:0 0 0 2px #f59e0b20}
        button:focus-visible{outline:2px solid #f59e0b;outline-offset:2px}
      `}</style>
      <div style={{minHeight:"100vh",background:"#0a0f1a",color:"#f1f5f9",
        fontFamily:"'Syne',sans-serif",position:"relative"}}>
        <TopoLines/>

        <header style={{position:"sticky",top:0,
          background:"rgba(10,15,26,0.92)",backdropFilter:"blur(12px)",
          borderBottom:"1px solid #1f2937",zIndex:100,padding:"0 20px"}}>
          <div style={{maxWidth:1100,margin:"0 auto",display:"flex",
            alignItems:"center",justifyContent:"space-between",height:60,gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <div style={{width:36,height:36,
                background:"linear-gradient(135deg,#d97706,#f59e0b)",
                borderRadius:8,display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:18,fontWeight:900,color:"#000"}}>⬡</div>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:"#f1f5f9",
                  lineHeight:1.1,letterSpacing:"-0.02em"}}>TopoGest</div>
                <SyncIndicator status={syncStatus}/>
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              {[["servicos","Serviços"],["dashboard","Resumo"]].map(([key,label])=>(
                <button key={key} onClick={()=>setTab(key)} style={{
                  padding:"6px 14px",borderRadius:8,border:"none",
                  background:tab===key?"#f59e0b":"transparent",
                  color:tab===key?"#000":"#9ca3af",
                  fontWeight:700,cursor:"pointer",fontSize:13,
                  fontFamily:"'Syne',sans-serif",transition:"all 0.2s"}}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={()=>setModal("new")} style={{
              padding:"8px 16px",
              background:"linear-gradient(135deg,#d97706,#f59e0b)",
              border:"none",borderRadius:8,color:"#000",
              fontWeight:800,fontSize:13,cursor:"pointer",
              fontFamily:"'Space Mono',monospace",whiteSpace:"nowrap"}}>
              + Novo
            </button>
          </div>
        </header>

        <main style={{maxWidth:1100,margin:"0 auto",
          padding:"24px 16px 60px",position:"relative",zIndex:1}}>

          {!isConfigured&&(
            <div style={{background:"#451a03",border:"1px solid #f59e0b40",
              borderRadius:12,padding:"14px 18px",marginBottom:20,
              display:"flex",alignItems:"center",gap:12,fontSize:13}}>
              <span style={{fontSize:20}}>⚙️</span>
              <div>
                <strong style={{color:"#f59e0b"}}>Firebase não configurado.</strong>
                <span style={{color:"#d1d5db",marginLeft:6}}>
                  Cole os dados do seu projeto no topo do App.jsx para ativar a nuvem.
                </span>
              </div>
            </div>
          )}

          {tab==="servicos"&&(<>
            <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200,position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",
                  transform:"translateY(-50%)",color:"#6b7280",fontSize:14,
                  pointerEvents:"none"}}>🔍</span>
                <input style={{...inputStyle,paddingLeft:36,background:"#111827"}}
                  placeholder="Buscar por nome, cliente, local..."
                  value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              <select style={{...inputStyle,width:"auto",background:"#111827",cursor:"pointer"}}
                value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="Todos">Todos os status</option>
                {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{display:"flex",gap:4}}>
                {["cards","list"].map(v=>(
                  <button key={v} onClick={()=>setView(v)}
                    aria-label={v==="cards"?"Vista cards":"Vista lista"}
                    style={{padding:"0 12px",height:40,borderRadius:8,
                      border:"1px solid #1f2937",
                      background:view===v?"#f59e0b":"#111827",
                      color:view===v?"#000":"#9ca3af",
                      cursor:"pointer",fontSize:16}}>
                    {v==="cards"?"⊞":"≡"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{fontSize:11,color:"#4b5563",
              fontFamily:"'Space Mono',monospace",marginBottom:14,letterSpacing:"0.08em"}}>
              {loading?"CARREGANDO..."
                :`${filtered.length} SERVIÇO${filtered.length!==1?"S":""} ENCONTRADO${filtered.length!==1?"S":""}`}
            </div>

            {loading&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {[1,2,3].map(i=><SkeletonCard key={i}/>)}
              </div>
            )}

            {!loading&&filtered.length===0&&(
              <div style={{textAlign:"center",padding:"60px 20px",
                color:"#4b5563",fontFamily:"'Space Mono',monospace"}}>
                <div style={{fontSize:48,marginBottom:16}}>⬡</div>
                <div style={{fontSize:14}}>
                  {search||filterStatus!=="Todos"
                    ?"Nenhum resultado com esses filtros"
                    :"Nenhum serviço cadastrado ainda"}
                </div>
                {!search&&filterStatus==="Todos"&&(
                  <button onClick={()=>setModal("new")} style={{
                    marginTop:20,padding:"10px 24px",background:"#f59e0b",
                    border:"none",borderRadius:8,color:"#000",fontWeight:800,
                    cursor:"pointer",fontSize:13,fontFamily:"'Space Mono',monospace"}}>
                    + Criar primeiro serviço
                  </button>
                )}
              </div>
            )}

            {!loading&&filtered.length>0&&view==="cards"&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {filtered.map(s=>(
                  <ServiceCard key={s.id} svc={s}
                    onEdit={openEdit} onDelete={requestDelete} onStatusChange={changeStatus}/>
                ))}
              </div>
            )}

            {!loading&&filtered.length>0&&view==="list"&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {filtered.map(s=>(
                  <div key={s.id} style={{background:"#111827",
                    border:"1px solid #1f2937",
                    borderLeft:`3px solid ${STATUS_CONFIG[s.status]?.color||"#6b7280"}`,
                    borderRadius:10,padding:"12px 16px",display:"flex",
                    alignItems:"center",gap:14,flexWrap:"wrap",
                    animation:"fadeIn 0.3s ease both"}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{fontWeight:700,fontSize:14}}>
                        {isOverdue(s)&&<span style={{marginRight:5}}>⚠️</span>}
                        {s.name}
                      </div>
                      <div style={{fontSize:12,color:"#6b7280",
                        fontFamily:"'Space Mono',monospace"}}>{s.client}</div>
                    </div>
                    <div style={{fontSize:12,color:"#60a5fa",whiteSpace:"nowrap"}}>{s.type}</div>
                    <Badge status={s.status}/>
                    <div style={{fontSize:12,color:"#6b7280",
                      fontFamily:"'Space Mono',monospace",whiteSpace:"nowrap"}}>
                      {formatDate(s.date)}
                    </div>
                    {s.value!=null&&s.value!==""&&(
                      <div style={{fontWeight:800,color:"#10b981",
                        fontFamily:"'Space Mono',monospace",fontSize:13}}>
                        {formatCurrency(s.value)}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>openEdit(s)} aria-label="Editar"
                        style={{padding:"5px 10px",background:"#1f2937",border:"none",
                          borderRadius:6,color:"#f59e0b",cursor:"pointer",fontSize:12,
                          fontFamily:"'Space Mono',monospace"}}>✎</button>
                      <button onClick={()=>requestDelete(s.id,s.name)} aria-label="Excluir"
                        style={{padding:"5px 10px",background:"#1f2937",border:"none",
                          borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:12}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {tab==="dashboard"&&(
            <div>
              <h2 style={{fontSize:22,fontWeight:900,marginBottom:20,
                color:"#f1f5f9",letterSpacing:"-0.02em"}}>Resumo Operacional</h2>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",
                gap:12,marginBottom:28}}>
                <StatCard label="Total"        value={services.length}                   color="#f1f5f9" icon="⬡"/>
                <StatCard label="Em Andamento" value={stats.pendentes}                   color="#f59e0b" icon="🏗"/>
                <StatCard label="Em Campo"     value={stats.emCampo}                     color="#f59e0b" icon="📡"/>
                <StatCard label="Atrasados"    value={stats.atrasados}                   color="#ef4444" icon="⚠"/>
                <StatCard label="Faturamento"  value={formatCurrency(stats.faturamento)} color="#10b981" icon="$"/>
              </div>

              <div style={{background:"#111827",border:"1px solid #1f2937",
                borderRadius:14,padding:"22px 24px",marginBottom:20}}>
                <h3 style={{fontSize:13,fontWeight:700,color:"#6b7280",
                  fontFamily:"'Space Mono',monospace",letterSpacing:"0.1em",
                  textTransform:"uppercase",marginBottom:18}}>Distribuição por Status</h3>
                {Object.entries(stats.statusMap).map(([status,count])=>(
                  <div key={status} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      marginBottom:5,fontSize:13}}>
                      <span style={{color:"#9ca3af"}}>{status}</span>
                      <span style={{fontWeight:700,color:STATUS_CONFIG[status]?.color,
                        fontFamily:"'Space Mono',monospace"}}>{count}</span>
                    </div>
                    <div style={{height:6,background:"#1f2937",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:3,
                        background:STATUS_CONFIG[status]?.color,
                        width:services.length?`${(count/services.length)*100}%`:"0%",
                        transition:"width 0.8s ease",
                        boxShadow:`0 0 8px ${STATUS_CONFIG[status]?.color}60`}}/>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{background:"#111827",border:"1px solid #1f2937",
                borderRadius:14,padding:"22px 24px"}}>
                <h3 style={{fontSize:13,fontWeight:700,color:"#6b7280",
                  fontFamily:"'Space Mono',monospace",letterSpacing:"0.1em",
                  textTransform:"uppercase",marginBottom:18}}>Por Tipo de Serviço</h3>
                {typeStats.length===0?(
                  <div style={{color:"#4b5563",fontSize:13,
                    fontFamily:"'Space Mono',monospace",textAlign:"center",padding:16}}>
                    Nenhum serviço cadastrado ainda.
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {typeStats.map(({type,count,revenue})=>(
                      <div key={type} style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",padding:"8px 12px",
                        background:"#0f172a",borderRadius:8,border:"1px solid #1f2937"}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#60a5fa"}}>{type}</div>
                          <div style={{fontSize:11,color:"#6b7280",
                            fontFamily:"'Space Mono',monospace"}}>
                            {count} serviço{count!==1?"s":""}
                          </div>
                        </div>
                        {revenue>0&&(
                          <div style={{fontSize:13,fontWeight:800,color:"#10b981",
                            fontFamily:"'Space Mono',monospace"}}>
                            {formatCurrency(revenue)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <Modal open={!!modal} onClose={closeModal}>
          <ServiceForm
            initial={modal==="new"?null:modal}
            onSave={saveService}
            onClose={closeModal}
            saving={saving}/>
        </Modal>

        <ConfirmDialog
          open={!!confirmDel}
          message={`Excluir "${confirmDel?.name}" permanentemente? Esta ação não pode ser desfeita.`}
          onConfirm={confirmDelete}
          onCancel={()=>setConfirmDel(null)}/>
      </div>
    </>
  );
}