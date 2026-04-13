// ============================================================
//  TopoGest v4 — Gestão de Serviços de Topografia
//  Dashboard: filtro mensal/anual · gráfico · top clientes
//  + Tipo personalizado via "Outro"
// ============================================================

import {
  useState, useEffect, useCallback, useMemo, useRef, memo,
} from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc,
  deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy, setDoc, getDoc,
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

const isConfigured = Object.values(firebaseConfig).every(v => v !== "COLE_AQUI");
const firebaseApp  = isConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;
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
  Aguardando:      { color:"#6b7280", bg:"#1f2937", icon:"⏳" },
  "Em Campo":      { color:"#f59e0b", bg:"#451a03", icon:"📡" },
  "Em Escritório": { color:"#3b82f6", bg:"#1e3a5f", icon:"💻" },
  Concluído:       { color:"#10b981", bg:"#064e3b", icon:"✅" },
  Entregue:        { color:"#8b5cf6", bg:"#2e1065", icon:"📦" },
  Cancelado:       { color:"#ef4444", bg:"#450a0a", icon:"❌" },
};

const DONE = new Set(["Concluído","Entregue","Cancelado"]);

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const SORT_OPTIONS = [
  { value:"createdAt_desc", label:"Mais recentes" },
  { value:"deadline_asc",   label:"Prazo próximo" },
  { value:"name_asc",       label:"Nome A→Z" },
  { value:"value_desc",     label:"Maior valor" },
  { value:"status_asc",     label:"Por status" },
];

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

function ToastContainer({ toasts, remove }) {
  return (
    <div style={{position:"fixed",bottom:88,right:16,zIndex:9999,
      display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
      {toasts.map(t => (
        <div key={t.id} onClick={()=>remove(t.id)} style={{
          display:"flex",alignItems:"center",gap:10,
          background:t.type==="error"?"#450a0a":t.type==="success"?"#064e3b":"#1f2937",
          border:`1px solid ${t.type==="error"?"#ef4444":t.type==="success"?"#10b981":"#374151"}`,
          borderRadius:12,padding:"12px 16px",minWidth:220,maxWidth:320,
          boxShadow:"0 8px 24px rgba(0,0,0,0.6)",animation:"slideIn 0.25s ease",
          pointerEvents:"all",cursor:"pointer",
        }}>
          <span style={{fontSize:18,flexShrink:0}}>
            {t.type==="error"?"❌":t.type==="success"?"✅":"ℹ️"}
          </span>
          <span style={{fontSize:13,color:"#f1f5f9",flex:1,lineHeight:1.4}}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(t => [...t, {id, msg, type}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  const remove = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  return { toasts, toast: add, remove };
}

// ─── Componentes visuais ──────────────────────────────────

const TopoLines = memo(() => (
  <svg style={{position:"fixed",inset:0,width:"100%",height:"100%",
    opacity:0.035,pointerEvents:"none",zIndex:0}}
    viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden>
    {["M0,300 Q200,250 400,310 T800,290","M0,320 Q200,270 400,330 T800,310",
      "M0,340 Q200,290 400,350 T800,330","M0,360 Q200,310 400,370 T800,350",
      "M0,280 Q200,230 400,290 T800,270","M0,260 Q200,210 400,270 T800,250",
      "M0,240 Q200,190 400,250 T800,230","M0,400 Q200,350 400,410 T800,390",
    ].map((d,i)=>(
      <path key={i} d={d} fill="none" stroke="#f59e0b" strokeWidth={i%4===0?"1.5":"0.7"}/>
    ))}
  </svg>
));

function SyncDot({ status }) {
  const map = {
    loading:{ color:"#6b7280", label:"Carregando..." },
    synced: { color:"#10b981", label:"Sincronizado" },
    syncing:{ color:"#f59e0b", label:"Salvando..." },
    offline:{ color:"#f59e0b", label:"Sem conexão" },
    error:  { color:"#ef4444", label:"Erro Firebase" },
  };
  const c = map[status]||map.synced;
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,
      fontSize:11,color:c.color,fontFamily:"'Space Mono',monospace"}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:c.color,
        boxShadow:`0 0 6px ${c.color}`,flexShrink:0,
        animation:status==="syncing"||status==="loading"?"pulse 1s infinite":"none"}}/>
      {c.label}
    </div>
  );
}

function Badge({ status, onClick }) {
  const cfg = STATUS_CONFIG[status]||STATUS_CONFIG["Aguardando"];
  return (
    <span onClick={onClick} title={onClick?"Clique para mudar status":undefined}
      style={{display:"inline-flex",alignItems:"center",gap:5,
        padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:700,
        letterSpacing:"0.05em",textTransform:"uppercase",
        color:cfg.color,backgroundColor:cfg.bg,
        border:`1px solid ${cfg.color}40`,
        fontFamily:"'Space Mono',monospace",
        cursor:onClick?"pointer":"default",transition:"opacity 0.15s"}}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.opacity="0.75";}}
      onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      <span style={{width:6,height:6,borderRadius:"50%",
        backgroundColor:cfg.color,boxShadow:`0 0 6px ${cfg.color}`,flexShrink:0}}/>
      {status}
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
      background:"rgba(0,0,0,0.8)",backdropFilter:"blur(4px)",
      zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#111827",
        border:"1px solid #374151",borderRadius:16,padding:28,
        maxWidth:360,width:"100%",animation:"modalIn 0.2s ease",
        boxShadow:"0 20px 50px rgba(0,0,0,0.8)"}}>
        <div style={{fontSize:36,textAlign:"center",marginBottom:12}}>🗑</div>
        <p style={{color:"#f1f5f9",fontSize:15,textAlign:"center",
          marginBottom:24,lineHeight:1.6}}>{message}</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px 0",
            background:"transparent",border:"1px solid #374151",borderRadius:8,
            color:"#9ca3af",fontWeight:700,cursor:"pointer",fontSize:14,
            fontFamily:"'Space Mono',monospace"}}>Cancelar</button>
          <button onClick={onConfirm} style={{flex:1,padding:"11px 0",
            background:"#ef4444",border:"none",borderRadius:8,
            color:"#fff",fontWeight:800,cursor:"pointer",fontSize:14,
            fontFamily:"'Space Mono',monospace"}}>Excluir</button>
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
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
        backdropFilter:"blur(6px)",zIndex:1000,display:"flex",
        alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#111827",
        border:"1px solid #374151",borderRadius:20,width:"100%",
        maxWidth:600,maxHeight:"90vh",overflowY:"auto",padding:28,
        boxShadow:"0 25px 60px rgba(0,0,0,0.8),0 0 0 1px #f59e0b20",
        animation:"modalIn 0.2s ease"}}>
        {children}
      </div>
    </div>
  );
}

// ─── Formulário ───────────────────────────────────────────

const inp = {
  width:"100%",background:"#0f172a",border:"1px solid #1f2937",
  borderRadius:8,color:"#f1f5f9",padding:"10px 14px",fontSize:14,
  fontFamily:"inherit",outline:"none",boxSizing:"border-box",
  transition:"border-color 0.2s",
};

function Field({ label, children, full, required }) {
  return(
    <div style={{gridColumn:full?"1 / -1":"span 1",marginBottom:4}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,
        letterSpacing:"0.1em",textTransform:"uppercase",color:"#9ca3af",
        marginBottom:6,fontFamily:"'Space Mono',monospace"}}>
        {label}{required&&<span style={{color:"#f59e0b",marginLeft:3}}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Campo "Outro" com opção de salvar categoria ──────────

function OutroInput({ onUse, onSave }) {
  const [val, setVal] = useState("");
  const [saved, setSaved] = useState(false);

  return(
    <div style={{marginTop:10,background:"#0a0f1a",
      border:"1px solid #f59e0b40",borderRadius:10,padding:14}}>
      <div style={{fontSize:11,color:"#f59e0b",fontFamily:"'Space Mono',monospace",
        fontWeight:700,marginBottom:8,letterSpacing:"0.05em"}}>
        DESCREVA O TIPO DE SERVIÇO:
      </div>
      <input
        style={{...inp,marginBottom:10}}
        placeholder="Ex: Regularização Fundiária"
        value={val}
        autoFocus
        onChange={e=>{ setVal(e.target.value); setSaved(false); }}
      />
      <div style={{display:"flex",gap:8}}>
        <button
          onClick={()=>val.trim()&&onUse(val.trim())}
          disabled={!val.trim()}
          style={{flex:1,padding:"9px 0",
            background:val.trim()?"#1f2937":"#111827",
            border:"1px solid #374151",borderRadius:8,
            color:val.trim()?"#f1f5f9":"#4b5563",fontSize:12,
            cursor:val.trim()?"pointer":"default",fontWeight:600,
            fontFamily:"'Space Mono',monospace",transition:"all 0.15s"}}>
          Usar só agora
        </button>
        <button
          onClick={()=>{ if(val.trim()&&!saved){ onSave(val.trim()); setSaved(true); } }}
          disabled={!val.trim()||saved}
          style={{flex:1,padding:"9px 0",
            background:val.trim()&&!saved
              ?"linear-gradient(135deg,#d97706,#f59e0b)"
              :"#1f2937",
            border:"none",borderRadius:8,
            color:val.trim()&&!saved?"#000":"#4b5563",fontSize:12,
            cursor:val.trim()&&!saved?"pointer":"default",fontWeight:700,
            fontFamily:"'Space Mono',monospace",transition:"all 0.15s"}}>
          {saved?"✓ Salvo na lista!":"💾 Salvar categoria"}
        </button>
      </div>
      {saved&&(
        <div style={{fontSize:11,color:"#10b981",marginTop:8,
          fontFamily:"'Space Mono',monospace",textAlign:"center"}}>
          ✓ Categoria salva — aparecerá no menu em todos os serviços futuros.
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

  // Todos os tipos disponíveis (fixos + salvos pelo usuário)
  const allTypes = useMemo(()=>{
    const extras = (customTypes||[]).filter(t=>!SERVICE_TYPES.includes(t));
    return [...SERVICE_TYPES.filter(t=>t!=="Outro"), ...extras, "Outro"];
  },[customTypes]);

  // Verifica se o tipo atual é um tipo personalizado não-padrão
  const isCustomValue = form.type && !SERVICE_TYPES.includes(form.type);
  const showOutroInput = form.type === "__outro__" || (form.type === "Outro");

  const handleSave = () => {
    const e={};
    if(!form.name.trim())e.name="Obrigatório";
    if(!form.client.trim())e.client="Obrigatório";
    if(!form.type||form.type==="Outro"||form.type==="__outro__")e.type="Selecione ou preencha um tipo";
    setErrors(e);
    if(Object.keys(e).length===0)onSave(form);
  };

  return(
    <>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,color:"#f59e0b",
          fontFamily:"'Space Mono',monospace",margin:0}}>
          {initial?.id?"✎ Editar Serviço":"+ Novo Serviço"}
        </h2>
        <button onClick={onClose} aria-label="Fechar"
          style={{background:"none",border:"none",color:"#6b7280",
            fontSize:24,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <Field label="Nome do Serviço" required full>
          <input style={{...inp,borderColor:errors.name?"#ef4444":"#1f2937"}}
            value={form.name} onChange={e=>set("name",e.target.value)}
            placeholder="Ex: Levantamento Fazenda Santa Clara"/>
          {errors.name&&<div style={{fontSize:11,color:"#ef4444",marginTop:3}}>{errors.name}</div>}
        </Field>

        <Field label="Cliente" required full>
          <input style={{...inp,borderColor:errors.client?"#ef4444":"#1f2937"}}
            value={form.client} onChange={e=>set("client",e.target.value)}
            placeholder="Nome do cliente ou empresa"/>
          {errors.client&&<div style={{fontSize:11,color:"#ef4444",marginTop:3}}>{errors.client}</div>}
        </Field>

        <Field label="Tipo de Serviço" required full>
          <select
            style={{...inp,cursor:"pointer",borderColor:errors.type?"#ef4444":"#1f2937"}}
            value={showOutroInput?"Outro":form.type}
            onChange={e=>{
              if(e.target.value==="Outro") set("type","Outro");
              else set("type",e.target.value);
            }}>
            <option value="">Selecionar...</option>
            {allTypes.map(t=>(
              <option key={t} value={t}>
                {t==="Outro"?"+ Outro (digitar novo)":t}
              </option>
            ))}
          </select>
          {errors.type&&<div style={{fontSize:11,color:"#ef4444",marginTop:3}}>{errors.type}</div>}

          {/* Caixa de texto quando "Outro" selecionado */}
          {(form.type==="Outro")&&(
            <OutroInput
              onUse={v=>set("type",v)}
              onSave={v=>{ set("type",v); onSaveType&&onSaveType(v); }}
            />
          )}
        </Field>

        <Field label="Status">
          <select style={{...inp,cursor:"pointer"}} value={form.status}
            onChange={e=>set("status",e.target.value)}>
            {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Área">
          <input style={inp} value={form.area}
            onChange={e=>set("area",e.target.value)} placeholder="Ex: 12,5 ha"/>
        </Field>

        <Field label="Data de Início">
          <input style={inp} type="date" value={form.date}
            onChange={e=>set("date",e.target.value)}/>
        </Field>

        <Field label="Prazo de Entrega">
          <input style={inp} type="date" value={form.deadline}
            onChange={e=>set("deadline",e.target.value)}/>
        </Field>

        <Field label="Localização" full>
          <input style={inp} value={form.location}
            onChange={e=>set("location",e.target.value)}
            placeholder="Ex: Uberlândia - MG"/>
        </Field>

        <Field label="Valor do Serviço (R$)" full>
          <input style={inp} type="number" min="0" step="0.01"
            value={form.value} onChange={e=>set("value",e.target.value)}
            placeholder="0,00"/>
        </Field>

        <Field label="Observações" full>
          <textarea style={{...inp,minHeight:72,resize:"vertical"}}
            value={form.notes} onChange={e=>set("notes",e.target.value)}
            placeholder="Informações adicionais..."/>
        </Field>
      </div>

      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={onClose} style={{flex:1,padding:"12px 0",
          background:"transparent",border:"1px solid #374151",borderRadius:10,
          color:"#9ca3af",fontWeight:700,cursor:"pointer",fontSize:14,
          fontFamily:"'Space Mono',monospace"}}>Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          style={{flex:2,padding:"12px 0",
            background:saving?"#1f2937":"linear-gradient(135deg,#d97706,#f59e0b)",
            border:"none",borderRadius:10,color:saving?"#4b5563":"#000",
            fontWeight:800,cursor:saving?"not-allowed":"pointer",fontSize:14,
            fontFamily:"'Space Mono',monospace",letterSpacing:"0.05em",
            transition:"all 0.2s"}}>
          {saving?"SALVANDO...":"SALVAR NA NUVEM ☁"}
        </button>
      </div>
    </>
  );
}

// ─── Card de serviço ──────────────────────────────────────

function ServiceCard({ svc, onEdit, onDelete, onStatusChange, index }) {
  const [menu, setMenu] = useState(false);
  const [hov, setHov]   = useState(false);
  const menuRef = useRef(null);
  const overdue = isOverdue(svc);
  const days    = daysLeft(svc.deadline);
  const cfg     = STATUS_CONFIG[svc.status]||STATUS_CONFIG["Aguardando"];
  useClickOutside(menuRef, ()=>setMenu(false));

  return(
    <div style={{background:"#111827",
      border:`1px solid ${hov?"#374151":"#1f2937"}`,
      borderLeft:`3px solid ${cfg.color}`,
      borderRadius:14,padding:"16px 18px",position:"relative",
      transition:"transform 0.2s,box-shadow 0.2s,border-color 0.2s",
      transform:hov?"translateY(-3px)":"none",
      boxShadow:hov?`0 12px 32px rgba(0,0,0,0.5),0 0 0 1px ${cfg.color}18`:"none",
      animation:`fadeUp 0.35s ease ${index*35}ms both`}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>

      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start",gap:8,marginBottom:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9",
            marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {overdue&&<span style={{marginRight:5}}>⚠️</span>}
            {svc.name}
          </div>
          <div style={{fontSize:12,color:"#6b7280",
            fontFamily:"'Space Mono',monospace"}}>👤 {svc.client}</div>
        </div>
        <div ref={menuRef} style={{position:"relative",flexShrink:0}}>
          <Badge status={svc.status} onClick={()=>setMenu(m=>!m)}/>
          {menu&&(
            <div style={{position:"absolute",top:"110%",right:0,
              background:"#1f2937",border:"1px solid #374151",
              borderRadius:12,overflow:"hidden",zIndex:10,minWidth:175,
              boxShadow:"0 12px 32px rgba(0,0,0,0.7)"}} role="menu">
              {Object.entries(STATUS_CONFIG).map(([s,c])=>(
                <button key={s} role="menuitem"
                  onClick={()=>{onStatusChange(svc.id,s);setMenu(false);}}
                  style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                    padding:"9px 14px",background:svc.status===s?"#374151":"none",
                    border:"none",color:c.color,fontSize:12,textAlign:"left",
                    cursor:"pointer",fontFamily:"'Space Mono',monospace",fontWeight:600}}>
                  <span>{c.icon}</span>{s}
                </button>
              ))}
              <div style={{height:1,background:"#374151"}}/>
              <button role="menuitem" onClick={()=>{onEdit(svc);setMenu(false);}}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                  padding:"9px 14px",background:"none",border:"none",color:"#f59e0b",
                  fontSize:12,textAlign:"left",cursor:"pointer",
                  fontFamily:"'Space Mono',monospace",fontWeight:600}}>
                ✎ Editar
              </button>
              <button role="menuitem" onClick={()=>{onDelete(svc.id,svc.name);setMenu(false);}}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                  padding:"9px 14px",background:"none",border:"none",color:"#ef4444",
                  fontSize:12,textAlign:"left",cursor:"pointer",
                  fontFamily:"'Space Mono',monospace",fontWeight:600}}>
                🗑 Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:"5px 14px",
        fontSize:12,color:"#9ca3af",fontFamily:"'Space Mono',monospace",marginBottom:12}}>
        {svc.type&&<span style={{color:"#60a5fa"}}>◈ {svc.type}</span>}
        {svc.location&&<span>📍 {svc.location}</span>}
        {svc.area&&<span>⬡ {svc.area}</span>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",paddingTop:10,borderTop:"1px solid #1f2937"}}>
        <div style={{fontSize:11,color:"#6b7280",fontFamily:"'Space Mono',monospace"}}>
          {fmtDate(svc.date)}
          {svc.deadline&&(
            <span style={{marginLeft:8,
              color:overdue?"#ef4444":days<=3&&days>=0?"#f59e0b":"#6b7280"}}>
              → {fmtDate(svc.deadline)}
              {days!==null&&!DONE.has(svc.status)&&(
                <span style={{marginLeft:5,fontWeight:700,
                  color:overdue?"#ef4444":days<=3?"#f59e0b":"#9ca3af"}}>
                  {overdue?`(${Math.abs(days)}d atraso)`:`(${days}d)`}
                </span>
              )}
            </span>
          )}
        </div>
        {svc.value!=null&&svc.value!==""&&(
          <div style={{fontSize:14,fontWeight:800,color:"#10b981",
            fontFamily:"'Space Mono',monospace"}}>{fmt$(svc.value)}</div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────

function KPICard({ icon, label, value, sub, color="#f1f5f9", highlight }) {
  return(
    <div style={{background: highlight?"linear-gradient(135deg,#1a2a1a,#111827)":"#111827",
      border:`1px solid ${highlight?"#10b98140":"#1f2937"}`,
      borderRadius:14,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,right:0,fontSize:48,
        opacity:0.06,lineHeight:1,padding:10}}>{icon}</div>
      <div style={{fontSize:11,fontWeight:700,color:"#6b7280",
        fontFamily:"'Space Mono',monospace",letterSpacing:"0.08em",
        textTransform:"uppercase",marginBottom:8}}>{label}</div>
      <div style={{fontSize:22,fontWeight:900,color,
        fontFamily:"'Space Mono',monospace",letterSpacing:"-0.02em",
        lineHeight:1.2}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"#4b5563",marginTop:5,
        fontFamily:"'Space Mono',monospace"}}>{sub}</div>}
    </div>
  );
}

function MonthlyChart({ data, maxVal }) {
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80,padding:"0 4px"}}>
      {data.map((d,i)=>{
        const h = maxVal>0 ? Math.max((d.revenue/maxVal)*72, d.revenue>0?6:0) : 0;
        const isCurrentMonth = d.month===new Date().getMonth()+1 &&
          d.year===new Date().getFullYear();
        return(
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",
            alignItems:"center",gap:3}}
            title={`${MESES[d.month-1]}: ${fmt$(d.revenue)} · ${d.count} serv.`}>
            <div style={{width:"100%",borderRadius:"3px 3px 0 0",
              background:isCurrentMonth
                ?"linear-gradient(180deg,#f59e0b,#d97706)"
                :d.revenue>0?"#1e3a5f":"#1f2937",
              height:h,transition:"height 0.6s ease",
              boxShadow:isCurrentMonth?"0 0 8px #f59e0b60":"none"}}/>
            <div style={{fontSize:9,color:isCurrentMonth?"#f59e0b":"#4b5563",
              fontFamily:"'Space Mono',monospace",fontWeight:isCurrentMonth?700:400,
              lineHeight:1}}>
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
    <div style={{background:"#111827",border:"1px solid #1f2937",
      borderLeft:"3px solid #1f2937",borderRadius:14,padding:"16px 18px"}}>
      {[[80,16],[50,12],[100,10],[60,11]].map(([w,h],i)=>(
        <div key={i} style={{width:`${w}%`,height:h,background:"#1f2937",
          borderRadius:6,marginBottom:10,animation:"pulse 1.5s infinite"}}/>
      ))}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────

export default function App() {
  const now  = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

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

  // Online/offline
  useEffect(()=>{
    const on=()=>setSyncStatus("synced");
    const off=()=>setSyncStatus("offline");
    window.addEventListener("online",on);
    window.addEventListener("offline",off);
    return()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);

  // Listener serviços
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

  // Listener tipos personalizados
  useEffect(()=>{
    if(!db)return;
    const ref = doc(db,"config","serviceTypes");
    return onSnapshot(ref, snap=>{
      if(snap.exists()) setCustomTypes(snap.data().types||[]);
    }, ()=>{});
  },[]);

  // Salvar tipo personalizado no Firebase
  const saveCustomType = useCallback(async(type)=>{
    if(!db||!type.trim())return;
    try{
      const ref = doc(db,"config","serviceTypes");
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().types||[]) : [];
      if(existing.includes(type.trim())){
        toast(`"${type}" já existe na lista.`,"info");
        return;
      }
      const updated = [...existing, type.trim()];
      await setDoc(ref, {types:updated}, {merge:true});
      toast(`Categoria "${type}" salva na lista! ✓`);
    }catch(e){
      console.error(e);
      toast("Erro ao salvar categoria.","error");
    }
  },[toast]);

  // CRUD serviços
  const saveService = useCallback(async form=>{
    setSaving(true);
    try{
      const payload={...form,value:form.value!==""?parseFloat(form.value):""};
      if(form.id){
        const{id,createdAt,...data}=payload;
        await updateDoc(doc(db,"services",id),{...data,updatedAt:serverTimestamp()});
        toast("Serviço atualizado! ✓");
      } else {
        await addDoc(servicesCol,{...payload,createdAt:serverTimestamp()});
        toast("Serviço criado! ✓");
      }
      setModal(null);
    }catch(e){ console.error(e); toast("Erro ao salvar.","error"); }
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
      toast(`Status → ${status}`);
    }catch(e){ toast("Erro ao atualizar.","error"); }
  },[toast]);

  const closeModal = useCallback(()=>{ if(!saving)setModal(null); },[saving]);

  // Filtro lista
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

  const stats = useMemo(()=>{
    return periodServices.reduce((acc,s)=>{
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
       byStatus:{},byClient:{},byType:{}});
  },[periodServices]);

  const ticketMedio    = stats.comValor>0 ? stats.faturamento/stats.comValor : 0;
  const taxaConclusao  = stats.total>0 ? Math.round(stats.concluidos/stats.total*100) : 0;

  const topClientes = useMemo(()=>
    Object.entries(stats.byClient).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,5)
  ,[stats]);

  const monthlyChart = useMemo(()=>{
    return MESES.map((_,i)=>{
      const m=i+1;
      const svcs=services.filter(s=>getServiceYear(s)===dashYear&&getServiceMonth(s)===m);
      const revenue=svcs.filter(s=>s.status!=="Cancelado").reduce((a,s)=>a+(parseFloat(s.value)||0),0);
      return {month:m,year:dashYear,count:svcs.length,revenue};
    });
  },[services,dashYear]);

  const maxMonthlyRevenue = useMemo(()=>Math.max(...monthlyChart.map(d=>d.revenue),1),[monthlyChart]);

  const periodoLabel = useMemo(()=>{
    if(dashMode==="total") return "Todos os serviços";
    if(dashMode==="ano")   return `Ano ${dashYear}`;
    return `${MESES_FULL[dashMonth-1]} de ${dashYear}`;
  },[dashMode,dashYear,dashMonth]);

  const proximosPrazos = useMemo(()=>
    services.filter(s=>{
      if(!s.deadline||DONE.has(s.status))return false;
      const d=daysLeft(s.deadline);
      return d!==null&&d>=0&&d<=7;
    }).sort((a,b)=>(daysLeft(a.deadline)||0)-(daysLeft(b.deadline)||0))
  ,[services]);

  // Todos os tipos para o filtro (fixos + custom)
  const allTypesForFilter = useMemo(()=>{
    const extras=(customTypes||[]).filter(t=>!SERVICE_TYPES.includes(t));
    return [...SERVICE_TYPES.filter(t=>t!=="Outro"),...extras,"Outro"];
  },[customTypes]);

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0a0f1a}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#0a0f1a}
        ::-webkit-scrollbar-thumb{background:#1f2937;border-radius:3px}
        select option{background:#111827;color:#f1f5f9}
        @keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(12px)}to{opacity:1;transform:none}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        input:focus,select:focus,textarea:focus{border-color:#f59e0b!important;box-shadow:0 0 0 2px #f59e0b18!important}
        button:focus-visible{outline:2px solid #f59e0b;outline-offset:2px}
        .mobile-only{display:none}
        @media(max-width:640px){.desktop-only{display:none!important}.mobile-only{display:flex!important}}
      `}</style>

      <div style={{minHeight:"100vh",background:"#0a0f1a",color:"#f1f5f9",
        fontFamily:"'Syne',sans-serif",position:"relative",paddingBottom:80}}>
        <TopoLines/>

        {!isConfigured&&(
          <div style={{background:"#451a03",borderBottom:"1px solid #f59e0b",
            padding:"10px 20px",textAlign:"center",fontSize:12,color:"#fcd34d",
            fontFamily:"'Space Mono',monospace",position:"relative",zIndex:10}}>
            ⚠️ Firebase não configurado — substitua os valores COLE_AQUI no App.jsx
          </div>
        )}

        {/* Header */}
        <header style={{position:"sticky",top:0,
          background:"rgba(10,15,26,0.94)",backdropFilter:"blur(16px)",
          borderBottom:"1px solid #1f2937",zIndex:100,padding:"0 20px"}}>
          <div style={{maxWidth:1100,margin:"0 auto",display:"flex",
            alignItems:"center",justifyContent:"space-between",height:60,gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <div style={{width:36,height:36,
                background:"linear-gradient(135deg,#d97706,#f59e0b)",
                borderRadius:9,display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:18,fontWeight:900,color:"#000",
                boxShadow:"0 4px 12px #f59e0b40"}}>⬡</div>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:"#f1f5f9",
                  lineHeight:1.1,letterSpacing:"-0.02em"}}>TopoGest</div>
                <SyncDot status={syncStatus}/>
              </div>
            </div>

            <nav className="desktop-only" style={{display:"flex",gap:4}}>
              {[["servicos","🗂 Serviços"],["dashboard","📊 Resumo"]].map(([k,l])=>(
                <button key={k} onClick={()=>setTab(k)}
                  style={{padding:"6px 16px",borderRadius:8,border:"none",
                    background:tab===k?"#f59e0b":"transparent",
                    color:tab===k?"#000":"#9ca3af",fontWeight:700,
                    cursor:"pointer",fontSize:13,fontFamily:"'Syne',sans-serif",
                    transition:"all 0.15s"}}>
                  {l}
                </button>
              ))}
            </nav>

            <button onClick={()=>setModal("new")}
              style={{display:"flex",alignItems:"center",gap:6,
                padding:"8px 18px",
                background:"linear-gradient(135deg,#d97706,#f59e0b)",
                border:"none",borderRadius:9,color:"#000",fontWeight:800,
                fontSize:13,cursor:"pointer",fontFamily:"'Space Mono',monospace",
                whiteSpace:"nowrap",boxShadow:"0 4px 12px #f59e0b30"}}>
              + Novo
            </button>
          </div>
        </header>

        <main style={{maxWidth:1100,margin:"0 auto",
          padding:"24px 16px 16px",position:"relative",zIndex:1}}>

          {/* SERVIÇOS */}
          {tab==="servicos"&&(<>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:160,position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",
                  transform:"translateY(-50%)",color:"#6b7280",fontSize:14,
                  pointerEvents:"none"}}>🔍</span>
                <input style={{...inp,paddingLeft:36,background:"#111827"}}
                  placeholder="Buscar..." value={search}
                  onChange={e=>setSearch(e.target.value)}/>
              </div>
              <select style={{...inp,width:"auto",background:"#111827",cursor:"pointer"}}
                value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="Todos">Todos os status</option>
                {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select style={{...inp,width:"auto",background:"#111827",cursor:"pointer"}}
                value={sort} onChange={e=>setSort(e.target.value)}>
                {SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{display:"flex",gap:4}}>
                {["cards","list"].map(v=>(
                  <button key={v} onClick={()=>setView(v)}
                    style={{padding:"0 12px",height:40,borderRadius:8,
                      border:"1px solid #1f2937",
                      background:view===v?"#f59e0b":"#111827",
                      color:view===v?"#000":"#9ca3af",
                      cursor:"pointer",fontSize:16,transition:"all 0.15s"}}>
                    {v==="cards"?"⊞":"≡"}
                  </button>
                ))}
              </div>
            </div>

            {proximosPrazos.length>0&&(
              <div style={{background:"#1a1500",border:"1px solid #f59e0b40",
                borderRadius:10,padding:"10px 16px",marginBottom:14,
                display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:14}}>⏰</span>
                <span style={{fontSize:13,color:"#fcd34d",fontWeight:700}}>
                  {proximosPrazos.length} serviço{proximosPrazos.length!==1?"s":""} com prazo nos próximos 7 dias:
                </span>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {proximosPrazos.map(s=>(
                    <span key={s.id} style={{fontSize:12,color:"#f59e0b",
                      background:"#451a03",padding:"2px 8px",borderRadius:6,
                      fontFamily:"'Space Mono',monospace"}}>
                      {s.name.length>20?s.name.slice(0,20)+"...":s.name} ({daysLeft(s.deadline)}d)
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{fontSize:11,color:"#4b5563",
              fontFamily:"'Space Mono',monospace",marginBottom:14,
              letterSpacing:"0.08em",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
              <span>{loading?"CARREGANDO...":`${filtered.length} SERVIÇO${filtered.length!==1?"S":""}`}</span>
              {services.filter(isOverdue).length>0&&(
                <span style={{color:"#ef4444",fontWeight:700}}>
                  ⚠ {services.filter(isOverdue).length} ATRASADO{services.filter(isOverdue).length!==1?"S":""}
                </span>
              )}
            </div>

            {loading?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {[1,2,3].map(i=><SkeletonCard key={i}/>)}
              </div>
            ):filtered.length===0?(
              <div style={{textAlign:"center",padding:"64px 20px",
                color:"#4b5563",fontFamily:"'Space Mono',monospace"}}>
                <div style={{fontSize:52,marginBottom:14,opacity:0.4}}>⬡</div>
                <div style={{fontSize:14,marginBottom:6}}>
                  {search||filterStatus!=="Todos"?"Nenhum resultado":"Nenhum serviço cadastrado ainda"}
                </div>
                {!search&&filterStatus==="Todos"&&(
                  <button onClick={()=>setModal("new")}
                    style={{marginTop:16,padding:"10px 28px",
                      background:"linear-gradient(135deg,#d97706,#f59e0b)",
                      border:"none",borderRadius:9,color:"#000",fontWeight:800,
                      cursor:"pointer",fontSize:13,fontFamily:"'Space Mono',monospace"}}>
                    + Criar primeiro serviço
                  </button>
                )}
              </div>
            ):view==="cards"?(
              <div style={{display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
                {filtered.map((s,i)=>(
                  <ServiceCard key={s.id} svc={s} index={i}
                    onEdit={svc=>setModal(svc)}
                    onDelete={requestDelete}
                    onStatusChange={changeStatus}/>
                ))}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {filtered.map((s,i)=>(
                  <div key={s.id} style={{background:"#111827",
                    border:"1px solid #1f2937",
                    borderLeft:`3px solid ${STATUS_CONFIG[s.status]?.color||"#6b7280"}`,
                    borderRadius:10,padding:"12px 16px",display:"flex",
                    alignItems:"center",gap:14,flexWrap:"wrap",
                    animation:`fadeUp 0.3s ease ${i*25}ms both`}}>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontWeight:700,fontSize:14}}>
                        {isOverdue(s)&&<span style={{marginRight:5}}>⚠️</span>}{s.name}
                      </div>
                      <div style={{fontSize:12,color:"#6b7280",
                        fontFamily:"'Space Mono',monospace"}}>{s.client}</div>
                    </div>
                    <Badge status={s.status}/>
                    <div style={{fontSize:11,color:"#6b7280",
                      fontFamily:"'Space Mono',monospace",whiteSpace:"nowrap"}}>
                      {fmtDate(s.date)}
                    </div>
                    {s.value!=null&&s.value!==""&&(
                      <div style={{fontWeight:800,color:"#10b981",
                        fontFamily:"'Space Mono',monospace",fontSize:13}}>
                        {fmt$(s.value)}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                      <button onClick={()=>setModal(s)}
                        style={{padding:"6px 10px",background:"#1f2937",
                          border:"none",borderRadius:7,color:"#f59e0b",
                          cursor:"pointer",fontSize:13}}>✎</button>
                      <button onClick={()=>requestDelete(s.id,s.name)}
                        style={{padding:"6px 10px",background:"#1f2937",
                          border:"none",borderRadius:7,color:"#ef4444",
                          cursor:"pointer",fontSize:13}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {/* DASHBOARD */}
          {tab==="dashboard"&&(
            <div>
              <div style={{display:"flex",alignItems:"center",
                justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
                <div>
                  <h2 style={{fontSize:22,fontWeight:900,color:"#f1f5f9",
                    letterSpacing:"-0.02em",lineHeight:1.2}}>Resumo Operacional</h2>
                  <div style={{fontSize:12,color:"#6b7280",
                    fontFamily:"'Space Mono',monospace",marginTop:2}}>
                    {periodoLabel} · {stats.total} serviço{stats.total!==1?"s":""}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:3,background:"#111827",
                    border:"1px solid #1f2937",borderRadius:9,padding:3}}>
                    {[["mes","Mensal"],["ano","Anual"],["total","Total"]].map(([m,l])=>(
                      <button key={m} onClick={()=>setDashMode(m)}
                        style={{padding:"5px 12px",borderRadius:7,border:"none",
                          background:dashMode===m?"#f59e0b":"transparent",
                          color:dashMode===m?"#000":"#9ca3af",
                          fontWeight:700,cursor:"pointer",fontSize:12,
                          fontFamily:"'Space Mono',monospace",transition:"all 0.15s"}}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {(dashMode==="mes"||dashMode==="ano")&&(
                    <select style={{...inp,width:"auto",background:"#111827",
                      cursor:"pointer",height:40,padding:"0 12px"}}
                      value={dashYear} onChange={e=>setDashYear(parseInt(e.target.value))}>
                      {availableYears.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                  {dashMode==="mes"&&(
                    <select style={{...inp,width:"auto",background:"#111827",
                      cursor:"pointer",height:40,padding:"0 12px"}}
                      value={dashMonth} onChange={e=>setDashMonth(parseInt(e.target.value))}>
                      {MESES_FULL.map((m,i)=>(
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div style={{display:"grid",
                gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",
                gap:12,marginBottom:20}}>
                <KPICard icon="📋" label="Serviços" value={stats.total}
                  sub={`${stats.andamento} em andamento`}/>
                <KPICard icon="💰" label="Faturamento" value={fmt$(stats.faturamento)}
                  color="#10b981" highlight sub={`Ticket médio: ${fmt$(ticketMedio)}`}/>
                <KPICard icon="✅" label="Concluídos" value={stats.concluidos}
                  color="#10b981" sub={`${taxaConclusao}% taxa de conclusão`}/>
                <KPICard icon="🏗" label="Em Andamento" value={stats.andamento}
                  color="#f59e0b" sub={`${stats.atrasados} atrasado${stats.atrasados!==1?"s":""}`}/>
                <KPICard icon="⚠" label="Atrasados" value={stats.atrasados}
                  color={stats.atrasados>0?"#ef4444":"#6b7280"}/>
              </div>

              <div style={{background:"#111827",border:"1px solid #1f2937",
                borderRadius:14,padding:"20px 20px 16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:16}}>
                  <div>
                    <h3 style={{fontSize:12,fontWeight:700,color:"#6b7280",
                      fontFamily:"'Space Mono',monospace",letterSpacing:"0.1em",
                      textTransform:"uppercase"}}>
                      Faturamento por Mês — {dashYear}
                    </h3>
                    <div style={{fontSize:11,color:"#4b5563",
                      fontFamily:"'Space Mono',monospace",marginTop:3}}>
                      Barra âmbar = mês atual
                    </div>
                  </div>
                  <div style={{fontSize:13,fontWeight:800,color:"#10b981",
                    fontFamily:"'Space Mono',monospace",textAlign:"right"}}>
                    {fmt$(monthlyChart.reduce((a,d)=>a+d.revenue,0))}
                    <div style={{fontSize:10,color:"#6b7280",fontWeight:400}}>total {dashYear}</div>
                  </div>
                </div>
                <MonthlyChart data={monthlyChart} maxVal={maxMonthlyRevenue}/>
                <div style={{display:"flex",gap:4,marginTop:8}}>
                  {monthlyChart.map((d,i)=>(
                    <div key={i} style={{flex:1,textAlign:"center",
                      fontSize:9,color:d.count>0?"#6b7280":"#1f2937",
                      fontFamily:"'Space Mono',monospace"}}>
                      {d.count>0?d.count:""}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div style={{background:"#111827",border:"1px solid #1f2937",
                  borderRadius:14,padding:"20px"}}>
                  <h3 style={{fontSize:12,fontWeight:700,color:"#6b7280",
                    fontFamily:"'Space Mono',monospace",letterSpacing:"0.1em",
                    textTransform:"uppercase",marginBottom:16}}>Por Status</h3>
                  {stats.total===0?(
                    <div style={{color:"#4b5563",fontSize:13,textAlign:"center",
                      padding:16,fontFamily:"'Space Mono',monospace"}}>Sem dados no período.</div>
                  ):Object.entries(STATUS_CONFIG).map(([status,cfg])=>{
                    const count=stats.byStatus[status]||0;
                    if(!count)return null;
                    return(
                      <div key={status} style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          marginBottom:4,fontSize:12}}>
                          <span style={{display:"flex",alignItems:"center",
                            gap:5,color:"#9ca3af"}}>
                            <span>{cfg.icon}</span>{status}
                          </span>
                          <span style={{fontWeight:700,
                            fontFamily:"'Space Mono',monospace",color:cfg.color}}>
                            {count} ({Math.round(count/stats.total*100)}%)
                          </span>
                        </div>
                        <div style={{height:5,background:"#1f2937",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:3,background:cfg.color,
                            width:`${(count/stats.total)*100}%`,
                            transition:"width 0.8s ease",
                            boxShadow:`0 0 6px ${cfg.color}60`}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{background:"#111827",border:"1px solid #1f2937",
                  borderRadius:14,padding:"20px"}}>
                  <h3 style={{fontSize:12,fontWeight:700,color:"#6b7280",
                    fontFamily:"'Space Mono',monospace",letterSpacing:"0.1em",
                    textTransform:"uppercase",marginBottom:16}}>🏆 Top Clientes</h3>
                  {topClientes.length===0?(
                    <div style={{color:"#4b5563",fontSize:13,textAlign:"center",
                      padding:16,fontFamily:"'Space Mono',monospace"}}>Sem dados no período.</div>
                  ):topClientes.map(([client,data],i)=>(
                    <div key={client} style={{display:"flex",
                      justifyContent:"space-between",alignItems:"center",
                      padding:"10px 0",
                      borderBottom:i<topClientes.length-1?"1px solid #1f2937":"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:22,height:22,borderRadius:"50%",
                          background:i===0?"#f59e0b":i===1?"#6b7280":"#374151",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:10,fontWeight:700,color:"#000",flexShrink:0}}>
                          {i+1}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#f1f5f9",
                            maxWidth:130,whiteSpace:"nowrap",overflow:"hidden",
                            textOverflow:"ellipsis"}}>{client}</div>
                          <div style={{fontSize:11,color:"#6b7280",
                            fontFamily:"'Space Mono',monospace"}}>
                            {data.count} serviço{data.count!==1?"s":""}
                          </div>
                        </div>
                      </div>
                      <div style={{fontSize:13,fontWeight:800,color:"#10b981",
                        fontFamily:"'Space Mono',monospace",textAlign:"right"}}>
                        {data.revenue>0?fmt$(data.revenue):"—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{background:"#111827",border:"1px solid #1f2937",
                borderRadius:14,padding:"20px"}}>
                <h3 style={{fontSize:12,fontWeight:700,color:"#6b7280",
                  fontFamily:"'Space Mono',monospace",letterSpacing:"0.1em",
                  textTransform:"uppercase",marginBottom:16}}>Por Tipo de Serviço</h3>
                {Object.keys(stats.byType).length===0?(
                  <div style={{color:"#4b5563",fontSize:13,textAlign:"center",
                    padding:16,fontFamily:"'Space Mono',monospace"}}>Sem dados no período.</div>
                ):(
                  <div style={{display:"grid",
                    gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                    {Object.entries(stats.byType)
                      .sort((a,b)=>b[1].count-a[1].count)
                      .map(([type,d])=>(
                      <div key={type} style={{display:"flex",
                        justifyContent:"space-between",alignItems:"center",
                        padding:"10px 14px",background:"#0f172a",
                        borderRadius:10,border:"1px solid #1f2937"}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:"#60a5fa"}}>{type}</div>
                          <div style={{fontSize:11,color:"#6b7280",
                            fontFamily:"'Space Mono',monospace"}}>
                            {d.count} serviço{d.count!==1?"s":""}
                          </div>
                        </div>
                        {d.revenue>0&&(
                          <div style={{fontSize:12,fontWeight:800,
                            color:"#10b981",fontFamily:"'Space Mono',monospace"}}>
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
        <nav className="mobile-only" style={{position:"fixed",bottom:0,left:0,right:0,
          background:"rgba(10,15,26,0.96)",backdropFilter:"blur(16px)",
          borderTop:"1px solid #1f2937",padding:"10px 0 16px",
          zIndex:200,justifyContent:"space-around"}}>
          {[["servicos","🗂","Serviços"],["dashboard","📊","Resumo"],["novo","➕","Novo"]].map(([k,ic,l])=>(
            <button key={k}
              onClick={()=>k==="novo"?setModal("new"):setTab(k)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",
                gap:3,background:"none",border:"none",
                color:tab===k&&k!=="novo"?"#f59e0b":k==="novo"?"#f59e0b":"#6b7280",
                cursor:"pointer",fontSize:10,fontWeight:700,
                fontFamily:"'Space Mono',monospace",padding:"0 20px",minWidth:60}}>
              <span style={{fontSize:22}}>{ic}</span>
              {l}
            </button>
          ))}
        </nav>

        <Modal open={!!modal} onClose={closeModal}>
          <ServiceForm
            initial={modal==="new"?null:modal}
            onSave={saveService}
            onClose={closeModal}
            saving={saving}
            customTypes={customTypes}
            onSaveType={saveCustomType}
          />
        </Modal>

        <ConfirmModal open={!!confirm}
          message={`Excluir permanentemente "${confirm?.name}"?`}
          onConfirm={confirmDelete}
          onCancel={()=>setConfirm(null)}/>

        <ToastContainer toasts={toasts} remove={remove}/>
      </div>
    </>
  );
}