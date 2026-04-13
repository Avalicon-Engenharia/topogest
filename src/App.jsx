// ============================================================
//  TopoGest v5 — Design refinado
//  Globe UTM · DM Sans + JetBrains Mono · Fundo geodésico
// ============================================================

import {
  useState, useEffect, useCallback, useMemo, useRef, memo,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc,
  deleteDoc, doc, onSnapshot, serverTimestamp,
  query, orderBy, setDoc, getDoc,
} from "firebase/firestore";

// ▼▼▼ FIREBASE CONFIG ▼▼▼
const firebaseConfig = {
  apiKey:            "AIzaSyCEmi_60w9g7S2brzIaIgbAG0pc14qEW_k",
  authDomain:        "topogest-d078b.firebaseapp.com",
  projectId:         "topogest-d078b",
  storageBucket:     "topogest-d078b.firebasestorage.app",
  messagingSenderId: "937539712250",
  appId:             "1:937539712250:web:90f59a654fce020e858543",
};
// ▲▲▲ FIM DA CONFIGURAÇÃO ▲▲▲

const isConfigured = Object.values(firebaseConfig).every(v => v !== "COLE_AQUI");
const firebaseApp  = isConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig)) : null;
const db          = firebaseApp ? getFirestore(firebaseApp) : null;
const servicesCol = db ? collection(db, "services") : null;

// ─── Constantes ───────────────────────────────────────────

const SERVICE_TYPES = [
  "Levantamento Planimétrico","Levantamento Altimétrico",
  "Levantamento Topográfico","Georreferenciamento",
  "Locação de Obra","Perfil Longitudinal/Transversal",
  "Cadastro Técnico","Divisão de Gleba",
  "Levantamento Batimétrico","Retificação de Área",
  "Revisão de Serviço","Outro",
];

const STATUS_CONFIG = {
  Aguardando:      { color:"#94a3b8", bg:"#1e293b", icon:"○", label:"Aguardando" },
  "Em Campo":      { color:"#fbbf24", bg:"#3d2200", icon:"◉", label:"Em Campo" },
  "Em Escritório": { color:"#60a5fa", bg:"#172554", icon:"◈", label:"Em Escritório" },
  Concluído:       { color:"#34d399", bg:"#022c22", icon:"✓", label:"Concluído" },
  Entregue:        { color:"#a78bfa", bg:"#1e1147", icon:"★", label:"Entregue" },
  Cancelado:       { color:"#f87171", bg:"#2d0606", icon:"✕", label:"Cancelado" },
};

const DONE = new Set(["Concluído","Entregue","Cancelado"]);

const MESES      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const SORT_OPTIONS = [
  { value:"createdAt_desc", label:"Mais recentes" },
  { value:"deadline_asc",   label:"Prazo próximo" },
  { value:"name_asc",       label:"Nome A→Z" },
  { value:"value_desc",     label:"Maior valor" },
  { value:"status_asc",     label:"Por status" },
];

// Paleta
const C = {
  bg:      "#080e1a",
  surface: "#0d1526",
  card:    "#111d35",
  border:  "#1a2947",
  border2: "#243358",
  amber:   "#f59e0b",
  amberD:  "#d97706",
  text:    "#e2e8f0",
  muted:   "#64748b",
  dim:     "#334155",
};

// ─── Helpers ──────────────────────────────────────────────

const makeEmptyForm = () => ({
  name:"", client:"", type:"", status:"Aguardando",
  date: new Date().toISOString().slice(0,10),
  deadline:"", value:"", location:"", notes:"", area:"",
});

const fmt$ = v => {
  const n = parseFloat(v);
  return isNaN(n) ? "—" : n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
};
const fmtDate = d => {
  if (!d) return "—";
  const [y,m,day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const isOverdue = s =>
  s.deadline && !DONE.has(s.status) &&
  new Date(s.deadline+"T00:00:00") < new Date();
const daysLeft = deadline => {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline+"T00:00:00") - new Date()) / 86400000);
};
const getServiceYear  = s => s.date ? parseInt(s.date.slice(0,4)) : null;
const getServiceMonth = s => s.date ? parseInt(s.date.slice(5,7)) : null;

function useClickOutside(ref, fn) {
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) fn(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
    };
  }, [ref, fn]);
}

// ─── Toast ────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(t => [...t, {id, msg, type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const remove = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  return { toasts, toast: add, remove };
}

function ToastContainer({ toasts, remove }) {
  const colors = {
    success: { bg:"#022c22", border:"#34d399", icon:"✓" },
    error:   { bg:"#2d0606", border:"#f87171", icon:"✕" },
    info:    { bg:"#172554", border:"#60a5fa", icon:"i" },
  };
  return (
    <div style={{position:"fixed",bottom:90,right:16,zIndex:9999,
      display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
      {toasts.map(t => {
        const c = colors[t.type]||colors.success;
        return(
          <div key={t.id} onClick={()=>remove(t.id)} style={{
            display:"flex",alignItems:"center",gap:10,
            background:c.bg, border:`1px solid ${c.border}30`,
            borderLeft:`3px solid ${c.border}`,
            borderRadius:10,padding:"11px 16px",minWidth:240,maxWidth:340,
            boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
            animation:"toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents:"all",cursor:"pointer",
          }}>
            <div style={{width:20,height:20,borderRadius:"50%",
              background:c.border,display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:11,fontWeight:700,
              color:"#000",flexShrink:0}}>
              {c.icon}
            </div>
            <span style={{fontSize:13,color:C.text,flex:1,lineHeight:1.4,
              fontFamily:"'DM Sans',sans-serif"}}>{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Globe UTM ────────────────────────────────────────────

const GlobeUTM = memo(() => (
  <svg width="38" height="38" viewBox="0 0 38 38" fill="none"
    style={{flexShrink:0}}>
    {/* Glow */}
    <defs>
      <radialGradient id="globeGrad" cx="42%" cy="38%" r="58%">
        <stop offset="0%" stopColor="#1d4ed8"/>
        <stop offset="55%" stopColor="#1e3a8a"/>
        <stop offset="100%" stopColor="#0f172a"/>
      </radialGradient>
      <radialGradient id="globeShine" cx="35%" cy="30%" r="40%">
        <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.25"/>
        <stop offset="100%" stopColor="#93c5fd" stopOpacity="0"/>
      </radialGradient>
      <clipPath id="globeClip">
        <circle cx="19" cy="19" r="16"/>
      </clipPath>
    </defs>
    {/* Shadow */}
    <ellipse cx="20" cy="35" rx="13" ry="3" fill="#000" opacity="0.3"/>
    {/* Globe base */}
    <circle cx="19" cy="19" r="16" fill="url(#globeGrad)"/>
    {/* UTM grid lines — meridianos */}
    <g clipPath="url(#globeClip)" stroke="#60a5fa" strokeWidth="0.5" opacity="0.5">
      {/* Equador */}
      <ellipse cx="19" cy="19" rx="16" ry="5.5"/>
      {/* Paralelos */}
      <ellipse cx="19" cy="13" rx="14" ry="4"/>
      <ellipse cx="19" cy="25" rx="14" ry="4"/>
      <ellipse cx="19" cy="8"  rx="9"  ry="2.5"/>
      <ellipse cx="19" cy="30" rx="9"  ry="2.5"/>
      {/* Meridianos */}
      <ellipse cx="19" cy="19" rx="5"  ry="16"/>
      <ellipse cx="19" cy="19" rx="10" ry="16"/>
      <line x1="19" y1="3" x2="19" y2="35"/>
    </g>
    {/* Continentes — forma simplificada América do Sul / Brasil */}
    <g clipPath="url(#globeClip)" fill="#22c55e" opacity="0.45">
      <path d="M14,13 L17,12 L20,13 L21,17 L20,22 L18,26 L16,27 L14,25 L13,20 L12,16 Z"/>
      <path d="M21,14 L24,13 L25,16 L24,19 L22,20 L21,17 Z"/>
    </g>
    {/* Shine */}
    <circle cx="19" cy="19" r="16" fill="url(#globeShine)"/>
    {/* Border */}
    <circle cx="19" cy="19" r="16" stroke="#3b82f6" strokeWidth="1" opacity="0.6"/>
    {/* Amber dot — localização */}
    <circle cx="18" cy="18" r="1.8" fill="#f59e0b" opacity="0.9"/>
    <circle cx="18" cy="18" r="1.2" fill="#fef3c7"/>
  </svg>
));

// ─── Fundo geodésico ──────────────────────────────────────

const GeoBackground = memo(() => (
  <div style={{position:"fixed",inset:0,zIndex:0,overflow:"hidden",pointerEvents:"none"}}>
    {/* Gradiente base */}
    <div style={{position:"absolute",inset:0,
      background:"radial-gradient(ellipse 80% 60% at 50% 0%, #0d1f4a18 0%, transparent 70%)"}}/>
    {/* Grade UTM sutil */}
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.04}}
      viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="utmGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#60a5fa" strokeWidth="0.5"/>
        </pattern>
        <pattern id="utmGrid2" width="300" height="300" patternUnits="userSpaceOnUse">
          <path d="M 300 0 L 0 0 0 300" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#utmGrid)"/>
      <rect width="100%" height="100%" fill="url(#utmGrid2)"/>
    </svg>
    {/* Curvas de nível */}
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.03}}
      viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
      {[
        "M0,400 Q300,340 600,420 T1200,380",
        "M0,430 Q300,370 600,450 T1200,410",
        "M0,460 Q300,400 600,480 T1200,440",
        "M0,370 Q300,310 600,390 T1200,350",
        "M0,340 Q300,280 600,360 T1200,320",
        "M0,490 Q300,430 600,510 T1200,470",
        "M0,310 Q300,250 600,330 T1200,290",
        "M0,520 Q300,460 600,540 T1200,500",
      ].map((d,i)=>(
        <path key={i} d={d} fill="none" stroke="#f59e0b"
          strokeWidth={i%4===0?"1.2":"0.6"}/>
      ))}
    </svg>
    {/* Glow cantos */}
    <div style={{position:"absolute",top:-200,left:-200,width:600,height:600,
      background:"radial-gradient(circle, #1d4ed808 0%, transparent 70%)",borderRadius:"50%"}}/>
    <div style={{position:"absolute",bottom:-200,right:-200,width:500,height:500,
      background:"radial-gradient(circle, #d9780608 0%, transparent 70%)",borderRadius:"50%"}}/>
  </div>
));

// ─── SyncDot ──────────────────────────────────────────────

function SyncDot({ status }) {
  const map = {
    loading:{ color:"#64748b", label:"Carregando" },
    synced: { color:"#34d399", label:"Sincronizado" },
    syncing:{ color:"#fbbf24", label:"Salvando" },
    offline:{ color:"#fbbf24", label:"Offline" },
    error:  { color:"#f87171", label:"Erro" },
  };
  const c = map[status]||map.synced;
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,
      fontSize:10,color:c.color,fontFamily:"'JetBrains Mono',monospace",
      letterSpacing:"0.04em"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:c.color,
        boxShadow:`0 0 5px ${c.color}`,flexShrink:0,
        animation:status==="syncing"||status==="loading"?"pulse 1.2s infinite":"none"}}/>
      {c.label}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────

function Badge({ status, onClick, small }) {
  const cfg = STATUS_CONFIG[status]||STATUS_CONFIG["Aguardando"];
  return (
    <span onClick={onClick}
      style={{display:"inline-flex",alignItems:"center",gap:5,
        padding:small?"2px 8px":"4px 11px",borderRadius:6,
        fontSize:small?10:11,fontWeight:600,
        letterSpacing:"0.04em",
        color:cfg.color,backgroundColor:cfg.bg,
        border:`1px solid ${cfg.color}25`,
        fontFamily:"'JetBrains Mono',monospace",
        cursor:onClick?"pointer":"default",
        transition:"all 0.15s",userSelect:"none"}}
      onMouseEnter={e=>{if(onClick){e.currentTarget.style.opacity="0.75";e.currentTarget.style.borderColor=`${cfg.color}60`;}}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.borderColor=`${cfg.color}25`;}}>
      <span style={{fontSize:10}}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

// ─── Modais ───────────────────────────────────────────────

function ConfirmModal({ open, message, onConfirm, onCancel }) {
  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(e.key==="Escape")onCancel();};
    document.addEventListener("keydown",h);
    return()=>document.removeEventListener("keydown",h);
  },[open,onCancel]);
  if(!open)return null;
  return(
    <div onClick={onCancel} style={{position:"fixed",inset:0,
      background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)",
      zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.card,border:`1px solid ${C.border2}`,
        borderRadius:16,padding:32,maxWidth:380,width:"100%",
        animation:"modalIn 0.2s ease",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"#2d0606",
            border:"1px solid #f8717130",margin:"0 auto 14px",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:22}}>🗑</div>
          <h3 style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:8}}>
            Confirmar exclusão
          </h3>
          <p style={{fontSize:14,color:C.muted,lineHeight:1.6}}>{message}</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px 0",
            background:"transparent",border:`1px solid ${C.border2}`,borderRadius:10,
            color:C.muted,fontWeight:600,cursor:"pointer",fontSize:14,
            fontFamily:"'DM Sans',sans-serif"}}>Cancelar</button>
          <button onClick={onConfirm} style={{flex:1,padding:"11px 0",
            background:"#7f1d1d",border:"1px solid #f8717130",borderRadius:10,
            color:"#fca5a5",fontWeight:700,cursor:"pointer",fontSize:14,
            fontFamily:"'DM Sans',sans-serif"}}>Excluir</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ open, onClose, children }) {
  useEffect(()=>{
    document.body.style.overflow=open?"hidden":"";
    return()=>{document.body.style.overflow="";};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",h);
    return()=>document.removeEventListener("keydown",h);
  },[open,onClose]);
  if(!open)return null;
  return(
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",
        backdropFilter:"blur(8px)",zIndex:1000,display:"flex",
        alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.card,border:`1px solid ${C.border2}`,
        borderRadius:20,width:"100%",maxWidth:620,maxHeight:"92vh",
        overflowY:"auto",padding:32,
        boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
        animation:"modalIn 0.2s ease"}}>
        {children}
      </div>
    </div>
  );
}

// ─── Input styles ─────────────────────────────────────────

const inp = {
  width:"100%",background:"#0a1020",
  border:`1px solid ${C.border2}`,
  borderRadius:10,color:C.text,padding:"10px 14px",fontSize:14,
  fontFamily:"'DM Sans',sans-serif",outline:"none",
  boxSizing:"border-box",transition:"border-color 0.2s, box-shadow 0.2s",
};

function Field({ label, children, full, required, hint }) {
  return(
    <div style={{gridColumn:full?"1 / -1":"span 1",marginBottom:2}}>
      <label style={{display:"flex",alignItems:"center",gap:6,
        fontSize:11,fontWeight:600,letterSpacing:"0.08em",
        textTransform:"uppercase",color:C.muted,
        marginBottom:7,fontFamily:"'JetBrains Mono',monospace"}}>
        {label}
        {required&&<span style={{color:C.amber}}>*</span>}
        {hint&&<span style={{color:C.dim,fontWeight:400,textTransform:"none",
          letterSpacing:0,fontSize:10}}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Outro Input ──────────────────────────────────────────

function OutroInput({ onUse, onSave }) {
  const [val, setVal] = useState("");
  const [saved, setSaved] = useState(false);
  return(
    <div style={{marginTop:10,background:"#0a1020",
      border:`1px solid ${C.amber}30`,borderRadius:12,padding:16}}>
      <div style={{fontSize:11,color:C.amber,fontFamily:"'JetBrains Mono',monospace",
        fontWeight:600,marginBottom:10,letterSpacing:"0.06em"}}>
        NOVO TIPO DE SERVIÇO
      </div>
      <input style={{...inp,marginBottom:10}}
        placeholder="Ex: Regularização Fundiária"
        value={val} autoFocus
        onChange={e=>{setVal(e.target.value);setSaved(false);}}/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>val.trim()&&onUse(val.trim())}
          disabled={!val.trim()}
          style={{flex:1,padding:"9px 0",
            background:val.trim()?C.card:"transparent",
            border:`1px solid ${C.border2}`,borderRadius:9,
            color:val.trim()?C.text:C.dim,fontSize:13,
            cursor:val.trim()?"pointer":"default",fontWeight:500,
            fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}>
          Usar só agora
        </button>
        <button onClick={()=>{if(val.trim()&&!saved){onSave(val.trim());setSaved(true);}}}
          disabled={!val.trim()||saved}
          style={{flex:1,padding:"9px 0",
            background:val.trim()&&!saved
              ?`linear-gradient(135deg,${C.amberD},${C.amber})`
              :"transparent",
            border:`1px solid ${val.trim()&&!saved?C.amber:C.border2}`,
            borderRadius:9,
            color:val.trim()&&!saved?"#000":C.dim,fontSize:13,
            cursor:val.trim()&&!saved?"pointer":"default",fontWeight:600,
            fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}>
          {saved?"✓ Salvo!":"Salvar categoria"}
        </button>
      </div>
      {saved&&(
        <div style={{fontSize:11,color:"#34d399",marginTop:10,
          fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}>
          ✓ Categoria salva — disponível em todos os serviços.
        </div>
      )}
    </div>
  );
}

// ─── Formulário de Serviço ────────────────────────────────

function ServiceForm({ initial, onSave, onClose, saving, customTypes, onSaveType }) {
  const [form, setForm] = useState(()=>initial||makeEmptyForm());
  const [errors, setErrors] = useState({});
  useEffect(()=>{setForm(initial||makeEmptyForm());setErrors({});},[initial]);
  const set = useCallback((k,v)=>setForm(f=>({...f,[k]:v})),[]);

  const allTypes = useMemo(()=>{
    const extras=(customTypes||[]).filter(t=>!SERVICE_TYPES.includes(t));
    return [...SERVICE_TYPES.filter(t=>t!=="Outro"),...extras,"Outro"];
  },[customTypes]);

  const handleSave = () => {
    const e={};
    if(!form.name.trim())e.name="Campo obrigatório";
    if(!form.client.trim())e.client="Campo obrigatório";
    if(!form.type||form.type==="Outro")e.type="Selecione ou preencha um tipo";
    setErrors(e);
    if(Object.keys(e).length===0)onSave(form);
  };

  const errInp = k => errors[k]?{borderColor:"#f87171",boxShadow:"0 0 0 2px #f8717115"}:{};

  return(
    <>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:28}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,color:C.text,margin:0,
            fontFamily:"'DM Sans',sans-serif"}}>
            {initial?.id?"Editar Serviço":"Novo Serviço"}
          </h2>
          <p style={{fontSize:12,color:C.muted,marginTop:3,
            fontFamily:"'JetBrains Mono',monospace"}}>
            {initial?.id?"Atualize os dados do serviço":"Preencha os dados para cadastrar"}
          </p>
        </div>
        <button onClick={onClose}
          style={{width:32,height:32,background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:8,
            color:C.muted,fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.border2;e.currentTarget.style.color=C.text;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
          ✕
        </button>
      </div>

      {/* Divider */}
      <div style={{height:1,background:C.border,marginBottom:24}}/>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px 14px"}}>
        <Field label="Nome do Serviço" required full>
          <input style={{...inp,...errInp("name")}} value={form.name}
            onChange={e=>set("name",e.target.value)}
            placeholder="Ex: Levantamento Fazenda Santa Clara"/>
          {errors.name&&<div style={{fontSize:11,color:"#f87171",marginTop:4}}>{errors.name}</div>}
        </Field>

        <Field label="Cliente" required full>
          <input style={{...inp,...errInp("client")}} value={form.client}
            onChange={e=>set("client",e.target.value)}
            placeholder="Nome do cliente ou empresa"/>
          {errors.client&&<div style={{fontSize:11,color:"#f87171",marginTop:4}}>{errors.client}</div>}
        </Field>

        <Field label="Tipo de Serviço" required full>
          <select style={{...inp,cursor:"pointer",...errInp("type")}}
            value={form.type==="Outro"?"Outro":form.type}
            onChange={e=>set("type",e.target.value)}>
            <option value="">Selecionar tipo...</option>
            {allTypes.map(t=>(
              <option key={t} value={t}>
                {t==="Outro"?"+ Outro (digitar)":t}
              </option>
            ))}
          </select>
          {errors.type&&<div style={{fontSize:11,color:"#f87171",marginTop:4}}>{errors.type}</div>}
          {form.type==="Outro"&&(
            <OutroInput
              onUse={v=>set("type",v)}
              onSave={v=>{set("type",v);onSaveType&&onSaveType(v);}}/>
          )}
        </Field>

        <Field label="Status">
          <select style={{...inp,cursor:"pointer"}} value={form.status}
            onChange={e=>set("status",e.target.value)}>
            {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Área" hint="ha, m² ou km²">
          <input style={inp} value={form.area}
            onChange={e=>set("area",e.target.value)} placeholder="Ex: 12,5 ha"/>
        </Field>

        <Field label="Valor" hint="R$">
          <input style={inp} type="number" min="0" step="0.01"
            value={form.value} onChange={e=>set("value",e.target.value)}
            placeholder="0,00"/>
        </Field>

        <Field label="Data de Início">
          <input style={inp} type="date" value={form.date}
            onChange={e=>set("date",e.target.value)}/>
        </Field>

        <Field label="Prazo de Entrega">
          <input style={inp} type="date" value={form.deadline}
            onChange={e=>set("deadline",e.target.value)}/>
        </Field>

        <Field label="Localização / Município" full>
          <input style={inp} value={form.location}
            onChange={e=>set("location",e.target.value)}
            placeholder="Ex: Uberlândia - MG"/>
        </Field>

        <Field label="Observações" full>
          <textarea style={{...inp,minHeight:76,resize:"vertical"}}
            value={form.notes} onChange={e=>set("notes",e.target.value)}
            placeholder="Informações adicionais sobre o serviço..."/>
        </Field>
      </div>

      <div style={{height:1,background:C.border,margin:"24px 0 20px"}}/>

      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",
          background:"transparent",border:`1px solid ${C.border2}`,borderRadius:10,
          color:C.muted,fontWeight:600,cursor:"pointer",fontSize:14,
          fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.muted;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border2;}}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{flex:2,padding:"12px 0",
            background:saving?"#1a2947":`linear-gradient(135deg,${C.amberD},${C.amber})`,
            border:"none",borderRadius:10,
            color:saving?C.dim:"#000",fontWeight:700,
            cursor:saving?"not-allowed":"pointer",fontSize:14,
            fontFamily:"'DM Sans',sans-serif",
            boxShadow:saving?"none":"0 4px 16px #f59e0b30",
            transition:"all 0.2s"}}>
          {saving?"Salvando...":"Salvar na nuvem"}
        </button>
      </div>
    </>
  );
}

// ─── Card de Serviço ──────────────────────────────────────

function ServiceCard({ svc, onEdit, onDelete, onStatusChange, index }) {
  const [menu, setMenu] = useState(false);
  const [hov,  setHov]  = useState(false);
  const menuRef = useRef(null);
  const overdue = isOverdue(svc);
  const days    = daysLeft(svc.deadline);
  const cfg     = STATUS_CONFIG[svc.status]||STATUS_CONFIG["Aguardando"];
  useClickOutside(menuRef, ()=>setMenu(false));

  return(
    <div
      style={{background:C.card,
        border:`1px solid ${hov?C.border2:C.border}`,
        borderTop:`2px solid ${cfg.color}`,
        borderRadius:14,padding:"18px 18px 14px",position:"relative",
        transition:"transform 0.2s,box-shadow 0.2s,border-color 0.2s",
        transform:hov?"translateY(-3px)":"none",
        boxShadow:hov?`0 16px 40px rgba(0,0,0,0.4)`:`0 2px 8px rgba(0,0,0,0.2)`,
        animationDelay:`${index*40}ms`,
        animation:"fadeUp 0.4s ease both",
      }}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}>

      {/* Cabeçalho */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",gap:10,marginBottom:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600,color:C.text,
            marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis",letterSpacing:"-0.01em",
            fontFamily:"'DM Sans',sans-serif"}}>
            {overdue&&(
              <span style={{display:"inline-flex",alignItems:"center",
                background:"#2d0606",border:"1px solid #f8717130",
                borderRadius:4,padding:"1px 5px",fontSize:10,
                color:"#f87171",marginRight:6,fontWeight:600,
                fontFamily:"'JetBrains Mono',monospace"}}>
                ATRASO
              </span>
            )}
            {svc.name}
          </div>
          <div style={{fontSize:12,color:C.muted,
            fontFamily:"'DM Sans',sans-serif",display:"flex",
            alignItems:"center",gap:5}}>
            <span style={{fontSize:11}}>◎</span>
            {svc.client}
          </div>
        </div>

        <div ref={menuRef} style={{position:"relative",flexShrink:0}}>
          <Badge status={svc.status} onClick={()=>setMenu(m=>!m)}/>
          {menu&&(
            <div style={{position:"absolute",top:"110%",right:0,
              background:"#0d1526",border:`1px solid ${C.border2}`,
              borderRadius:12,overflow:"hidden",zIndex:50,minWidth:180,
              boxShadow:"0 16px 48px rgba(0,0,0,0.6)"}} role="menu">
              <div style={{padding:"8px 12px 4px",fontSize:10,color:C.dim,
                fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em"}}>
                ALTERAR STATUS
              </div>
              {Object.entries(STATUS_CONFIG).map(([s,c])=>(
                <button key={s} role="menuitem"
                  onClick={()=>{onStatusChange(svc.id,s);setMenu(false);}}
                  style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                    padding:"9px 14px",
                    background:svc.status===s?`${c.color}12`:"transparent",
                    border:"none",color:c.color,fontSize:13,textAlign:"left",
                    cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:500,
                    transition:"background 0.1s"}}>
                  <span style={{fontSize:12,fontFamily:"'JetBrains Mono',monospace",
                    width:14,textAlign:"center"}}>{c.icon}</span>
                  {c.label}
                </button>
              ))}
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button role="menuitem"
                onClick={()=>{onEdit(svc);setMenu(false);}}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                  padding:"9px 14px",background:"transparent",border:"none",
                  color:C.amber,fontSize:13,textAlign:"left",cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>
                <span>✎</span> Editar
              </button>
              <button role="menuitem"
                onClick={()=>{onDelete(svc.id,svc.name);setMenu(false);}}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                  padding:"9px 14px 13px",background:"transparent",border:"none",
                  color:"#f87171",fontSize:13,textAlign:"left",cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>
                <span>✕</span> Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14,minHeight:20}}>
        {svc.type&&(
          <span style={{fontSize:11,color:"#60a5fa",background:"#172554",
            padding:"2px 8px",borderRadius:5,
            fontFamily:"'JetBrains Mono',monospace",fontWeight:500,
            border:"1px solid #1d4ed820"}}>
            {svc.type}
          </span>
        )}
        {svc.location&&(
          <span style={{fontSize:11,color:C.muted,background:C.surface,
            padding:"2px 8px",borderRadius:5,
            fontFamily:"'DM Sans',sans-serif",
            border:`1px solid ${C.border}`}}>
            📍 {svc.location}
          </span>
        )}
        {svc.area&&(
          <span style={{fontSize:11,color:C.muted,background:C.surface,
            padding:"2px 8px",borderRadius:5,
            fontFamily:"'JetBrains Mono',monospace",
            border:`1px solid ${C.border}`}}>
            {svc.area}
          </span>
        )}
      </div>

      {/* Rodapé */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",paddingTop:12,
        borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:11,color:C.dim,
          fontFamily:"'JetBrains Mono',monospace"}}>
          {fmtDate(svc.date)}
          {svc.deadline&&(
            <span style={{marginLeft:8,
              color:overdue?"#f87171":days!==null&&days<=5&&days>=0?"#fbbf24":C.dim}}>
              → {fmtDate(svc.deadline)}
              {days!==null&&!DONE.has(svc.status)&&(
                <span style={{marginLeft:5,fontWeight:600,
                  color:overdue?"#f87171":days<=5?"#fbbf24":C.muted}}>
                  {overdue?`${Math.abs(days)}d atraso`:days===0?"hoje":`${days}d`}
                </span>
              )}
            </span>
          )}
        </div>
        {svc.value!=null&&svc.value!==""&&(
          <div style={{fontSize:14,fontWeight:700,color:"#34d399",
            fontFamily:"'JetBrains Mono',monospace",
            letterSpacing:"-0.02em"}}>
            {fmt$(svc.value)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard components ─────────────────────────────────

function KPICard({ icon, label, value, sub, color=C.text, accent }) {
  return(
    <div style={{background:C.card,
      border:`1px solid ${accent?`${accent}30`:C.border}`,
      borderTop:accent?`2px solid ${accent}`:`2px solid ${C.border2}`,
      borderRadius:14,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:10,right:14,
        fontSize:26,opacity:0.08}}>{icon}</div>
      <div style={{fontSize:11,fontWeight:600,color:C.dim,
        fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",
        textTransform:"uppercase",marginBottom:10}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700,color,
        fontFamily:"'JetBrains Mono',monospace",
        letterSpacing:"-0.03em",lineHeight:1.2}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.dim,marginTop:6,
        fontFamily:"'DM Sans',sans-serif"}}>{sub}</div>}
    </div>
  );
}

function MonthlyChart({ data, maxVal }) {
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:90,padding:"0 2px"}}>
      {data.map((d,i)=>{
        const pct = maxVal>0 ? (d.revenue/maxVal) : 0;
        const h   = Math.max(pct*78, d.revenue>0?4:0);
        const isCur = d.month===new Date().getMonth()+1 &&
          d.year===new Date().getFullYear();
        return(
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",
            alignItems:"center",gap:4}}
            title={`${MESES[d.month-1]}: ${fmt$(d.revenue)} · ${d.count} serv.`}>
            <div style={{width:"100%",borderRadius:"4px 4px 0 0",
              background:isCur
                ?`linear-gradient(180deg,${C.amber},${C.amberD})`
                :d.revenue>0?"#1d4ed8":"#1a2947",
              height:h,transition:"height 0.7s cubic-bezier(0.34,1.2,0.64,1)",
              boxShadow:isCur?`0 0 10px ${C.amber}50`:
                d.revenue>0?"0 0 6px #1d4ed850":"none"}}/>
            <div style={{fontSize:9,lineHeight:1,
              color:isCur?C.amber:C.dim,
              fontFamily:"'JetBrains Mono',monospace",
              fontWeight:isCur?700:400}}>
              {MESES[d.month-1]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonCard() {
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,
      borderTop:`2px solid ${C.border}`,borderRadius:14,padding:"18px 18px 14px"}}>
      {[[80,14],[50,11],[100,9],[60,10]].map(([w,h],i)=>(
        <div key={i} style={{width:`${w}%`,height:h,
          background:C.surface,borderRadius:6,marginBottom:12,
          animation:"pulse 1.5s infinite"}}/>
      ))}
    </div>
  );
}

// ─── App Principal ────────────────────────────────────────

export default function App() {
  const now  = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth()+1;

  const [services,     setServices]     = useState([]);
  const [customTypes,  setCustomTypes]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncStatus,   setSyncStatus]   = useState("loading");
  const [modal,        setModal]        = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [confirm,      setConfirm]      = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [sort,         setSort]         = useState("createdAt_desc");
  const [view,         setView]         = useState("cards");
  const [tab,          setTab]          = useState("servicos");
  const [dashMode,     setDashMode]     = useState("mes");
  const [dashMonth,    setDashMonth]    = useState(curM);
  const [dashYear,     setDashYear]     = useState(curY);

  const { toasts, toast, remove } = useToast();

  useEffect(()=>{
    const on=()=>setSyncStatus("synced");
    const off=()=>setSyncStatus("offline");
    window.addEventListener("online",on);
    window.addEventListener("offline",off);
    return()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);

  useEffect(()=>{
    if(!servicesCol){setSyncStatus("error");setLoading(false);return;}
    const q=query(servicesCol,orderBy("createdAt","desc"));
    return onSnapshot(q,
      snap=>{
        setServices(snap.docs.map(d=>({id:d.id,...d.data()})));
        setLoading(false);
        if(navigator.onLine)setSyncStatus("synced");
      },
      err=>{ console.error(err); setLoading(false); setSyncStatus("error"); }
    );
  },[]);

  useEffect(()=>{
    if(!db)return;
    const ref=doc(db,"config","serviceTypes");
    return onSnapshot(ref,snap=>{
      if(snap.exists())setCustomTypes(snap.data().types||[]);
    },()=>{});
  },[]);

  const saveCustomType = useCallback(async type=>{
    if(!db||!type.trim())return;
    try{
      const ref=doc(db,"config","serviceTypes");
      const snap=await getDoc(ref);
      const existing=snap.exists()?(snap.data().types||[]):[];
      if(existing.includes(type.trim())){ toast(`"${type}" já existe.`,"info"); return; }
      await setDoc(ref,{types:[...existing,type.trim()]},{merge:true});
      toast(`Categoria "${type}" salva!`);
    }catch(e){ toast("Erro ao salvar categoria.","error"); }
  },[toast]);

  const saveService = useCallback(async form=>{
    setSaving(true);
    try{
      const payload={...form,value:form.value!==""?parseFloat(form.value):""};
      if(form.id){
        const{id,createdAt,...data}=payload;
        await updateDoc(doc(db,"services",id),{...data,updatedAt:serverTimestamp()});
        toast("Serviço atualizado com sucesso.");
      } else {
        await addDoc(servicesCol,{...payload,createdAt:serverTimestamp()});
        toast("Serviço cadastrado com sucesso.");
      }
      setModal(null);
    }catch(e){ console.error(e); toast("Erro ao salvar. Verifique a conexão.","error"); }
    setSaving(false);
  },[toast]);

  const requestDelete = useCallback((id,name)=>setConfirm({id,name}),[]);
  const confirmDelete = useCallback(async()=>{
    if(!confirm)return;
    try{ await deleteDoc(doc(db,"services",confirm.id)); toast("Serviço excluído."); }
    catch(e){ toast("Erro ao excluir.","error"); }
    setConfirm(null);
  },[confirm,toast]);

  const changeStatus = useCallback(async(id,status)=>{
    setSyncStatus("syncing");
    try{
      await updateDoc(doc(db,"services",id),{status,updatedAt:serverTimestamp()});
      toast(`Status alterado para ${status}.`);
    }catch(e){ toast("Erro ao atualizar status.","error"); }
  },[toast]);

  const closeModal = useCallback(()=>{ if(!saving)setModal(null); },[saving]);

  const filtered = useMemo(()=>{
    const q=search.toLowerCase();
    let list=services.filter(s=>{
      const mq=!q||[s.name,s.client,s.location,s.type].some(v=>v?.toLowerCase().includes(q));
      return mq&&(filterStatus==="Todos"||s.status===filterStatus);
    });
    const[field,dir]=sort.split("_");
    return [...list].sort((a,b)=>{
      if(field==="name") return dir==="asc"?a.name.localeCompare(b.name):b.name.localeCompare(a.name);
      if(field==="value") return (parseFloat(b.value)||0)-(parseFloat(a.value)||0);
      if(field==="deadline"){const da=a.deadline||"9999",db2=b.deadline||"9999";return da.localeCompare(db2);}
      if(field==="status") return a.status.localeCompare(b.status);
      return 0;
    });
  },[services,search,filterStatus,sort]);

  const availableYears = useMemo(()=>{
    const yrs=new Set(services.map(s=>getServiceYear(s)).filter(Boolean));
    yrs.add(curY);
    return [...yrs].sort((a,b)=>b-a);
  },[services,curY]);

  const periodServices = useMemo(()=>{
    if(dashMode==="total") return services;
    if(dashMode==="ano")   return services.filter(s=>getServiceYear(s)===dashYear);
    return services.filter(s=>getServiceYear(s)===dashYear&&getServiceMonth(s)===dashMonth);
  },[services,dashMode,dashYear,dashMonth]);

  const stats = useMemo(()=>periodServices.reduce((acc,s)=>{
    acc.total++;
    if(DONE.has(s.status))acc.concluidos++;
    if(isOverdue(s))acc.atrasados++;
    if(["Aguardando","Em Campo","Em Escritório"].includes(s.status))acc.andamento++;
    const val=parseFloat(s.value)||0;
    if(s.status!=="Cancelado"&&val>0){acc.faturamento+=val;acc.comValor++;}
    acc.byStatus[s.status]=(acc.byStatus[s.status]||0)+1;
    if(s.client){
      if(!acc.byClient[s.client])acc.byClient[s.client]={count:0,revenue:0};
      acc.byClient[s.client].count++;
      if(s.status!=="Cancelado")acc.byClient[s.client].revenue+=val;
    }
    if(s.type){
      if(!acc.byType[s.type])acc.byType[s.type]={count:0,revenue:0};
      acc.byType[s.type].count++;
      if(s.status!=="Cancelado")acc.byType[s.type].revenue+=val;
    }
    return acc;
  },{total:0,concluidos:0,atrasados:0,andamento:0,faturamento:0,comValor:0,
     byStatus:{},byClient:{},byType:{}}),[periodServices]);

  const ticketMedio   = stats.comValor>0?stats.faturamento/stats.comValor:0;
  const taxaConclusao = stats.total>0?Math.round(stats.concluidos/stats.total*100):0;
  const topClientes   = useMemo(()=>
    Object.entries(stats.byClient).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,5)
  ,[stats]);

  const monthlyChart = useMemo(()=>MESES.map((_,i)=>{
    const m=i+1;
    const svcs=services.filter(s=>getServiceYear(s)===dashYear&&getServiceMonth(s)===m);
    return{month:m,year:dashYear,count:svcs.length,
      revenue:svcs.filter(s=>s.status!=="Cancelado").reduce((a,s)=>a+(parseFloat(s.value)||0),0)};
  }),[services,dashYear]);

  const maxRev = useMemo(()=>Math.max(...monthlyChart.map(d=>d.revenue),1),[monthlyChart]);

  const periodoLabel = useMemo(()=>{
    if(dashMode==="total") return "Todos os registros";
    if(dashMode==="ano")   return `Exercício ${dashYear}`;
    return `${MESES_FULL[dashMonth-1]} / ${dashYear}`;
  },[dashMode,dashYear,dashMonth]);

  const proximosPrazos = useMemo(()=>
    services.filter(s=>{
      if(!s.deadline||DONE.has(s.status))return false;
      const d=daysLeft(s.deadline);
      return d!==null&&d>=0&&d<=7;
    }).sort((a,b)=>(daysLeft(a.deadline)||0)-(daysLeft(b.deadline)||0))
  ,[services]);

  const allTypesForFilter = useMemo(()=>{
    const extras=(customTypes||[]).filter(t=>!SERVICE_TYPES.includes(t));
    return [...SERVICE_TYPES.filter(t=>t!=="Outro"),...extras,"Outro"];
  },[customTypes]);

  // ── Render ──

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};color:${C.text};font-family:'DM Sans',sans-serif}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4)}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px}
        select option{background:#0d1526;color:${C.text}}
        @keyframes modalIn{from{opacity:0;transform:scale(0.97) translateY(8px)}to{opacity:1;transform:none}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes toastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        input:focus,select:focus,textarea:focus{
          border-color:${C.amber}!important;
          box-shadow:0 0 0 3px ${C.amber}12!important;
          outline:none
        }
        button:focus-visible{outline:2px solid ${C.amber};outline-offset:2px}
        .mobile-only{display:none!important}
        @media(max-width:640px){
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
        }
      `}</style>

      <div style={{minHeight:"100vh",background:C.bg,color:C.text,
        fontFamily:"'DM Sans',sans-serif",position:"relative",paddingBottom:80}}>

        <GeoBackground/>

        {/* Header */}
        <header style={{position:"sticky",top:0,
          background:"rgba(8,14,26,0.88)",backdropFilter:"blur(20px)",
          borderBottom:`1px solid ${C.border}`,zIndex:100}}>
          <div style={{maxWidth:1140,margin:"0 auto",padding:"0 20px",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            height:58,gap:16}}>

            {/* Logo */}
            <div style={{display:"flex",alignItems:"center",gap:11,flexShrink:0}}>
              <GlobeUTM/>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.text,
                  lineHeight:1.1,letterSpacing:"-0.02em",
                  fontFamily:"'DM Sans',sans-serif"}}>
                  TopoGest
                </div>
                <SyncDot status={syncStatus}/>
              </div>
            </div>

            {/* Tabs desktop */}
            <nav className="desktop-only" style={{display:"flex",gap:2,
              background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:10,padding:3}}>
              {[["servicos","Serviços"],["dashboard","Resumo"]].map(([k,l])=>(
                <button key={k} onClick={()=>setTab(k)}
                  style={{padding:"6px 18px",borderRadius:8,border:"none",
                    background:tab===k?C.card:"transparent",
                    color:tab===k?C.text:C.muted,fontWeight:tab===k?600:400,
                    cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",
                    transition:"all 0.15s",
                    boxShadow:tab===k?`0 1px 4px rgba(0,0,0,0.3)`:""}}>{l}</button>
              ))}
            </nav>

            <button onClick={()=>setModal("new")}
              style={{display:"flex",alignItems:"center",gap:7,
                padding:"8px 18px",
                background:`linear-gradient(135deg,${C.amberD},${C.amber})`,
                border:"none",borderRadius:10,color:"#000",fontWeight:600,
                fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
                whiteSpace:"nowrap",
                boxShadow:"0 4px 14px #f59e0b28",
                transition:"box-shadow 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 6px 20px #f59e0b40"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="0 4px 14px #f59e0b28"}>
              <span style={{fontSize:16,lineHeight:1}}>+</span> Novo
            </button>
          </div>
        </header>

        <main style={{maxWidth:1140,margin:"0 auto",
          padding:"28px 20px 20px",position:"relative",zIndex:1}}>

          {/* ── SERVIÇOS ── */}
          {tab==="servicos"&&(<>

            {/* Filtros */}
            <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180,position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",
                  transform:"translateY(-50%)",color:C.muted,fontSize:13,
                  pointerEvents:"none",fontFamily:"'JetBrains Mono',monospace"}}>⌕</span>
                <input style={{...inp,paddingLeft:34,background:C.card,
                  border:`1px solid ${C.border}`}}
                  placeholder="Buscar por nome, cliente, local..."
                  value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              <select style={{...inp,width:"auto",background:C.card,
                border:`1px solid ${C.border}`,cursor:"pointer",paddingRight:32}}
                value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="Todos">Todos os status</option>
                {Object.keys(STATUS_CONFIG).map(s=>(
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select style={{...inp,width:"auto",background:C.card,
                border:`1px solid ${C.border}`,cursor:"pointer",paddingRight:32}}
                value={sort} onChange={e=>setSort(e.target.value)}>
                {SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{display:"flex",gap:3,background:C.card,
                border:`1px solid ${C.border}`,borderRadius:10,padding:3}}>
                {["cards","list"].map(v=>(
                  <button key={v} onClick={()=>setView(v)}
                    style={{padding:"6px 12px",borderRadius:8,border:"none",
                      background:view===v?C.surface:"transparent",
                      color:view===v?C.text:C.muted,
                      cursor:"pointer",fontSize:14,transition:"all 0.15s",
                      boxShadow:view===v?`0 1px 4px rgba(0,0,0,0.3)`:""}}>
                    {v==="cards"?"⊞":"≡"}
                  </button>
                ))}
              </div>
            </div>

            {/* Alerta prazos */}
            {proximosPrazos.length>0&&(
              <div style={{background:"#1c1200",
                border:`1px solid ${C.amber}25`,borderRadius:12,
                padding:"12px 18px",marginBottom:16,
                display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <span style={{fontSize:16}}>⏰</span>
                <span style={{fontSize:13,color:"#fcd34d",fontWeight:600}}>
                  {proximosPrazos.length} prazo{proximosPrazos.length!==1?"s":""} nos próximos 7 dias
                </span>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {proximosPrazos.map(s=>(
                    <span key={s.id} style={{fontSize:11,color:C.amber,
                      background:"#3d2200",padding:"2px 10px",borderRadius:6,
                      fontFamily:"'JetBrains Mono',monospace",
                      border:`1px solid ${C.amber}20`}}>
                      {s.name.length>22?s.name.slice(0,22)+"…":s.name}
                      <span style={{color:"#fbbf24",marginLeft:5}}>
                        {daysLeft(s.deadline)===0?"hoje":`${daysLeft(s.deadline)}d`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contadores */}
            <div style={{fontSize:11,color:C.dim,
              fontFamily:"'JetBrains Mono',monospace",marginBottom:16,
              display:"flex",gap:20,alignItems:"center",flexWrap:"wrap",
              letterSpacing:"0.04em"}}>
              <span>
                {loading?"CARREGANDO...":
                  `${filtered.length} SERVIÇO${filtered.length!==1?"S":""}`}
              </span>
              {services.filter(isOverdue).length>0&&(
                <span style={{color:"#f87171",fontWeight:600,
                  display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:6,height:6,borderRadius:"50%",
                    background:"#f87171",display:"inline-block"}}/>
                  {services.filter(isOverdue).length} ATRASADO{services.filter(isOverdue).length!==1?"S":""}
                </span>
              )}
            </div>

            {/* Lista */}
            {loading?(
              <div style={{display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:12}}>
                {[1,2,3].map(i=><SkeletonCard key={i}/>)}
              </div>
            ):filtered.length===0?(
              <div style={{textAlign:"center",padding:"72px 20px",color:C.dim}}>
                <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>⊘</div>
                <div style={{fontSize:15,fontWeight:500,marginBottom:6,color:C.muted}}>
                  {search||filterStatus!=="Todos"?"Nenhum serviço encontrado":"Nenhum serviço cadastrado"}
                </div>
                <div style={{fontSize:13,color:C.dim,marginBottom:24}}>
                  {!search&&filterStatus==="Todos"&&"Comece cadastrando o primeiro serviço da empresa."}
                </div>
                {!search&&filterStatus==="Todos"&&(
                  <button onClick={()=>setModal("new")}
                    style={{padding:"10px 28px",
                      background:`linear-gradient(135deg,${C.amberD},${C.amber})`,
                      border:"none",borderRadius:10,color:"#000",fontWeight:600,
                      cursor:"pointer",fontSize:14,fontFamily:"'DM Sans',sans-serif",
                      boxShadow:"0 4px 16px #f59e0b25"}}>
                      + Novo Serviço
                  </button>
                )}
              </div>
            ):view==="cards"?(
              <div style={{display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:12}}>
                {filtered.map((s,i)=>(
                  <ServiceCard key={s.id} svc={s} index={i}
                    onEdit={svc=>setModal(svc)}
                    onDelete={requestDelete}
                    onStatusChange={changeStatus}/>
                ))}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {/* Cabeçalho lista */}
                <div style={{display:"grid",
                  gridTemplateColumns:"1fr 140px 120px 100px 110px 80px",
                  gap:12,padding:"6px 16px",
                  fontSize:10,color:C.dim,
                  fontFamily:"'JetBrains Mono',monospace",
                  letterSpacing:"0.08em",textTransform:"uppercase",
                  borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <span>Serviço</span>
                  <span>Tipo</span>
                  <span>Status</span>
                  <span>Data</span>
                  <span>Prazo</span>
                  <span style={{textAlign:"right"}}>Valor</span>
                </div>
                {filtered.map((s,i)=>(
                  <div key={s.id} style={{
                    display:"grid",
                    gridTemplateColumns:"1fr 140px 120px 100px 110px 80px",
                    gap:12,padding:"12px 16px",
                    background:C.card,border:`1px solid ${C.border}`,
                    borderLeft:`3px solid ${STATUS_CONFIG[s.status]?.color||C.muted}`,
                    borderRadius:10,alignItems:"center",
                    animation:`fadeUp 0.3s ease ${i*20}ms both`,
                    transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.border2}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13,color:C.text,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {isOverdue(s)&&<span style={{color:"#f87171",marginRight:6,fontSize:11}}>●</span>}
                        {s.name}
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{s.client}</div>
                    </div>
                    <div style={{fontSize:11,color:"#60a5fa",
                      fontFamily:"'JetBrains Mono',monospace",
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {s.type||"—"}
                    </div>
                    <div><Badge status={s.status} small/></div>
                    <div style={{fontSize:11,color:C.dim,
                      fontFamily:"'JetBrains Mono',monospace"}}>
                      {fmtDate(s.date)}
                    </div>
                    <div style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",
                      color:isOverdue(s)?"#f87171":C.dim}}>
                      {fmtDate(s.deadline)}
                      {s.deadline&&!DONE.has(s.status)&&daysLeft(s.deadline)!==null&&(
                        <span style={{marginLeft:4,fontSize:10,
                          color:isOverdue(s)?"#f87171":daysLeft(s.deadline)<=5?"#fbbf24":C.dim}}>
                          {isOverdue(s)?`-${Math.abs(daysLeft(s.deadline))}d`:
                            daysLeft(s.deadline)===0?"hoje":`${daysLeft(s.deadline)}d`}
                        </span>
                      )}
                    </div>
                    <div style={{display:"flex",gap:4,justifyContent:"flex-end",alignItems:"center"}}>
                      {s.value!=null&&s.value!==""&&(
                        <span style={{fontSize:12,fontWeight:600,color:"#34d399",
                          fontFamily:"'JetBrains Mono',monospace"}}>
                          {fmt$(s.value)}
                        </span>
                      )}
                      <button onClick={()=>setModal(s)}
                        style={{padding:"4px 7px",background:C.surface,
                          border:`1px solid ${C.border}`,borderRadius:6,
                          color:C.amber,cursor:"pointer",fontSize:11}}>✎</button>
                      <button onClick={()=>requestDelete(s.id,s.name)}
                        style={{padding:"4px 7px",background:C.surface,
                          border:`1px solid ${C.border}`,borderRadius:6,
                          color:"#f87171",cursor:"pointer",fontSize:11}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {/* ── DASHBOARD ── */}
          {tab==="dashboard"&&(
            <div>
              {/* Header dashboard */}
              <div style={{display:"flex",alignItems:"flex-start",
                justifyContent:"space-between",marginBottom:24,
                flexWrap:"wrap",gap:16}}>
                <div>
                  <h2 style={{fontSize:20,fontWeight:700,color:C.text,
                    letterSpacing:"-0.02em",marginBottom:4,
                    fontFamily:"'DM Sans',sans-serif"}}>
                    Resumo Operacional
                  </h2>
                  <p style={{fontSize:12,color:C.muted,
                    fontFamily:"'JetBrains Mono',monospace"}}>
                    {periodoLabel} · {stats.total} serviço{stats.total!==1?"s":""}
                  </p>
                </div>

                {/* Controles período */}
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:2,background:C.card,
                    border:`1px solid ${C.border}`,borderRadius:10,padding:3}}>
                    {[["mes","Mensal"],["ano","Anual"],["total","Total"]].map(([m,l])=>(
                      <button key={m} onClick={()=>setDashMode(m)}
                        style={{padding:"6px 14px",borderRadius:8,border:"none",
                          background:dashMode===m?C.surface:"transparent",
                          color:dashMode===m?C.text:C.muted,
                          fontWeight:dashMode===m?600:400,cursor:"pointer",fontSize:12,
                          fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s",
                          boxShadow:dashMode===m?`0 1px 4px rgba(0,0,0,0.3)`:""}}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {(dashMode==="mes"||dashMode==="ano")&&(
                    <select style={{...inp,width:"auto",background:C.card,
                      border:`1px solid ${C.border}`,cursor:"pointer",
                      height:38,padding:"0 12px",fontSize:13}}
                      value={dashYear}
                      onChange={e=>setDashYear(parseInt(e.target.value))}>
                      {availableYears.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                  {dashMode==="mes"&&(
                    <select style={{...inp,width:"auto",background:C.card,
                      border:`1px solid ${C.border}`,cursor:"pointer",
                      height:38,padding:"0 12px",fontSize:13}}
                      value={dashMonth}
                      onChange={e=>setDashMonth(parseInt(e.target.value))}>
                      {MESES_FULL.map((m,i)=>(
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* KPIs */}
              <div style={{display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",
                gap:12,marginBottom:16}}>
                <KPICard icon="◫" label="Serviços"
                  value={stats.total} sub={`${stats.andamento} em andamento`}/>
                <KPICard icon="$" label="Faturamento"
                  value={fmt$(stats.faturamento)} color="#34d399"
                  accent="#34d399" sub={`Ticket: ${fmt$(ticketMedio)}`}/>
                <KPICard icon="✓" label="Concluídos"
                  value={stats.concluidos} color="#34d399"
                  accent="#34d399" sub={`${taxaConclusao}% do período`}/>
                <KPICard icon="◉" label="Em Andamento"
                  value={stats.andamento} color="#fbbf24"
                  accent="#fbbf24"/>
                <KPICard icon="△" label="Atrasados"
                  value={stats.atrasados}
                  color={stats.atrasados>0?"#f87171":"#64748b"}
                  accent={stats.atrasados>0?"#f87171":undefined}/>
              </div>

              {/* Gráfico mensal */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,
                borderRadius:14,padding:"22px 24px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:20}}>
                  <div>
                    <h3 style={{fontSize:12,fontWeight:600,color:C.muted,
                      fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",
                      textTransform:"uppercase",marginBottom:3}}>
                      Faturamento Mensal — {dashYear}
                    </h3>
                    <p style={{fontSize:11,color:C.dim,
                      fontFamily:"'JetBrains Mono',monospace"}}>
                      Coluna âmbar = mês corrente
                    </p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#34d399",
                      fontFamily:"'JetBrains Mono',monospace"}}>
                      {fmt$(monthlyChart.reduce((a,d)=>a+d.revenue,0))}
                    </div>
                    <div style={{fontSize:10,color:C.dim,marginTop:2,
                      fontFamily:"'JetBrains Mono',monospace"}}>
                      TOTAL {dashYear}
                    </div>
                  </div>
                </div>
                <MonthlyChart data={monthlyChart} maxVal={maxRev}/>
                <div style={{display:"flex",gap:3,marginTop:6}}>
                  {monthlyChart.map((d,i)=>(
                    <div key={i} style={{flex:1,textAlign:"center",
                      fontSize:9,color:d.count>0?C.muted:C.dim,
                      fontFamily:"'JetBrains Mono',monospace"}}>
                      {d.count>0?d.count:""}
                    </div>
                  ))}
                </div>
              </div>

              {/* Status + Top Clientes */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",
                gap:12,marginBottom:12}}>

                <div style={{background:C.card,border:`1px solid ${C.border}`,
                  borderRadius:14,padding:"20px 22px"}}>
                  <h3 style={{fontSize:11,fontWeight:600,color:C.muted,
                    fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",
                    textTransform:"uppercase",marginBottom:18}}>
                    Distribuição por Status
                  </h3>
                  {stats.total===0?(
                    <p style={{color:C.dim,fontSize:13,textAlign:"center",padding:16}}>
                      Sem dados no período.
                    </p>
                  ):Object.entries(STATUS_CONFIG).map(([status,cfg])=>{
                    const count=stats.byStatus[status]||0;
                    if(!count)return null;
                    return(
                      <div key={status} style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          marginBottom:5,fontSize:12}}>
                          <span style={{display:"flex",alignItems:"center",
                            gap:7,color:C.muted,fontWeight:500}}>
                            <span style={{fontSize:11,
                              fontFamily:"'JetBrains Mono',monospace",
                              color:cfg.color}}>{cfg.icon}</span>
                            {status}
                          </span>
                          <span style={{fontWeight:600,
                            fontFamily:"'JetBrains Mono',monospace",
                            color:cfg.color,fontSize:12}}>
                            {count} <span style={{color:C.dim,fontWeight:400}}>
                              ({Math.round(count/stats.total*100)}%)
                            </span>
                          </span>
                        </div>
                        <div style={{height:4,background:C.surface,
                          borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:2,
                            background:cfg.color,
                            width:`${(count/stats.total)*100}%`,
                            transition:"width 0.9s cubic-bezier(0.34,1.2,0.64,1)",
                            boxShadow:`0 0 6px ${cfg.color}50`}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{background:C.card,border:`1px solid ${C.border}`,
                  borderRadius:14,padding:"20px 22px"}}>
                  <h3 style={{fontSize:11,fontWeight:600,color:C.muted,
                    fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",
                    textTransform:"uppercase",marginBottom:18}}>
                    Top Clientes
                  </h3>
                  {topClientes.length===0?(
                    <p style={{color:C.dim,fontSize:13,textAlign:"center",padding:16}}>
                      Sem dados no período.
                    </p>
                  ):topClientes.map(([client,data],i)=>(
                    <div key={client} style={{display:"flex",
                      justifyContent:"space-between",alignItems:"center",
                      padding:"10px 0",
                      borderBottom:i<topClientes.length-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                          background:i===0?C.amber:i===1?"#94a3b8":"#334155",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:11,fontWeight:700,
                          color:i===0?"#000":"#f1f5f9",
                          fontFamily:"'JetBrains Mono',monospace"}}>
                          {i+1}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:500,color:C.text,
                            maxWidth:140,whiteSpace:"nowrap",overflow:"hidden",
                            textOverflow:"ellipsis"}}>{client}</div>
                          <div style={{fontSize:11,color:C.dim,marginTop:1,
                            fontFamily:"'JetBrains Mono',monospace"}}>
                            {data.count} serviço{data.count!==1?"s":""}
                          </div>
                        </div>
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:"#34d399",
                        fontFamily:"'JetBrains Mono',monospace",textAlign:"right"}}>
                        {data.revenue>0?fmt$(data.revenue):"—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Por tipo */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,
                borderRadius:14,padding:"20px 22px"}}>
                <h3 style={{fontSize:11,fontWeight:600,color:C.muted,
                  fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em",
                  textTransform:"uppercase",marginBottom:18}}>
                  Por Tipo de Serviço
                </h3>
                {Object.keys(stats.byType).length===0?(
                  <p style={{color:C.dim,fontSize:13,textAlign:"center",padding:16}}>
                    Sem dados no período.
                  </p>
                ):(
                  <div style={{display:"grid",
                    gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:8}}>
                    {Object.entries(stats.byType)
                      .sort((a,b)=>b[1].count-a[1].count)
                      .map(([type,d])=>(
                      <div key={type} style={{
                        display:"flex",justifyContent:"space-between",
                        alignItems:"center",padding:"11px 14px",
                        background:C.surface,borderRadius:10,
                        border:`1px solid ${C.border}`,
                        transition:"border-color 0.15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=C.border2}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                        <div>
                          <div style={{fontSize:13,fontWeight:500,color:"#60a5fa",
                            marginBottom:2}}>{type}</div>
                          <div style={{fontSize:11,color:C.dim,
                            fontFamily:"'JetBrains Mono',monospace"}}>
                            {d.count} serviço{d.count!==1?"s":""}
                          </div>
                        </div>
                        {d.revenue>0&&(
                          <div style={{fontSize:13,fontWeight:600,
                            color:"#34d399",fontFamily:"'JetBrains Mono',monospace"}}>
                            {fmt$(d.revenue)}
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

        {/* Nav mobile */}
        <nav className="mobile-only" style={{
          position:"fixed",bottom:0,left:0,right:0,
          background:"rgba(8,14,26,0.96)",backdropFilter:"blur(20px)",
          borderTop:`1px solid ${C.border}`,
          padding:"10px 0 max(16px,env(safe-area-inset-bottom))",
          zIndex:200,justifyContent:"space-around"}}>
          {[["servicos","◫","Serviços"],["dashboard","◈","Resumo"],["novo","+","Novo"]].map(([k,ic,l])=>(
            <button key={k}
              onClick={()=>k==="novo"?setModal("new"):setTab(k)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",
                gap:3,background:"none",border:"none",
                color:tab===k&&k!=="novo"?C.amber:k==="novo"?C.amber:C.muted,
                cursor:"pointer",fontSize:10,fontWeight:600,
                fontFamily:"'DM Sans',sans-serif",padding:"0 20px",minWidth:60,
                transition:"color 0.15s"}}>
              <span style={{fontSize:k==="novo"?22:18,fontFamily:"'JetBrains Mono',monospace",
                fontWeight:k==="novo"?400:400}}>{ic}</span>
              {l}
            </button>
          ))}
        </nav>

        {/* Modais */}
        <Modal open={!!modal} onClose={closeModal}>
          <ServiceForm
            initial={modal==="new"?null:modal}
            onSave={saveService}
            onClose={closeModal}
            saving={saving}
            customTypes={customTypes}
            onSaveType={saveCustomType}/>
        </Modal>

        <ConfirmModal open={!!confirm}
          message={`Deseja excluir permanentemente o serviço "${confirm?.name}"? Esta ação não pode ser desfeita.`}
          onConfirm={confirmDelete}
          onCancel={()=>setConfirm(null)}/>

        <ToastContainer toasts={toasts} remove={remove}/>
      </div>
    </>
  );
}