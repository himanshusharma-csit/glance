/* ============================================================
   GLANCE Analytics Dashboard — dashboard.js  v1.0
   Global-Local Attention Network for Cross-modal Alignment
   in Hindi Image Captioning
   Author: Dr. Himanshu Sharma
   https://www.linkedin.com/in/dr-himanshusharma/
   Theme and layout shared with the SAGE and DHARA dashboards.
   ============================================================ */
'use strict';

/* ── Configuration ─────────────────────────────────────────── */
const GH = {
  owner  : 'himanshusharma-csit',
  repo   : 'glance',            // ← change if the repository has another name
  branch : 'main',
  data   : 'data'               // folder written by export_results.py
};
/* The workbook stores CIDEr as a fraction (0.2263). true → shown ×100 (22.63),
   on the same 0–100 scale as BLEU and METEOR. Set to false to show it as stored. */
const CIDER_X100 = true;

/* Display names (edit freely to match the paper). */
const ATT = {
  local : {model:'GLANCE-W',  short:'W',  label:'Local · word query',          col:'#2563eb'},
  global: {model:'GLANCE-WH', short:'WH', label:'Global · word + hidden query', col:'#7c3aed'}
};
/* Architecture shown on the Insights page. */
const ARCH = [
  ['Visual encoder', 'CLIP ViT-B/32 (frozen) · CLS + 49 patch tokens → 512-d'],
  ['Word embeddings','FastText-Hindi (300-d) → learned projection to 512-d'],
  ['Attention',      'Additive (Bahdanau) cross-modal attention over 49 patch regions, every decoding step'],
  ['Query · GLANCE-W','embed(y<sub>t−1</sub>) ∈ ℝ<sup>512</sup> — local, word only'],
  ['Query · GLANCE-WH','[embed(y<sub>t−1</sub>); h<sub>t−1</sub>] ∈ ℝ<sup>1536</sup> — global, word + decoder history'],
  ['Decoder',        'LSTM (hidden 1024), teacher forcing during training'],
  ['Model selection','Best configuration chosen on CIDEr'],
  ['Framework',      'PyTorch']
];
const FLOW = [
  ['Image','CLIP ViT-B/32 · 49 patches',false],
  ['Projection','512-d region features',false],
  ['Bahdanau attention','query: local (W) or global (WH)',true],
  ['LSTM decoder','hidden 1024 · FastText-Hindi inputs',false],
  ['Hindi caption','generated word by word',false]
];

/* Palette (same tokens as dashboard.css) */
const C = {blue:'#2563eb',purple:'#7c3aed',green:'#059669',orange:'#d97706',red:'#dc2626',cyan:'#0891b2',pink:'#db2777',slate:'#4b5580'};
const THR_COL   = {2:C.cyan, 3:C.orange, 4:C.pink};
const BATCH_COL = {32:C.cyan, 64:C.orange, 128:C.green};
const DS_COL    = {pascal:C.orange, flickr:C.cyan};

/* ── Global state ──────────────────────────────────────────── */
let RAW = null;     // results.json
let DS  = null;     // active dataset key
let SEL = null;     // selected in modal
let CHS = {};       // chart instances
let METRIC = 'CIDEr', DMETRIC = 'CIDEr', FMETRIC = 'CIDEr';
let SORT = {k:'CIDEr', dir:-1};

/* ══════════════════════════════════════════════════════════════
   1.  DATA ACCESS
   ══════════════════════════════════════════════════════════════ */
function rawUrl(path){ return `https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/${GH.branch}/${path}`; }
/* Same-origin first (GitHub Pages, local server), raw GitHub as a fallback (file://). */
async function fetchJSON(path){
  const tries=[path+'?v='+Date.now(), rawUrl(path)+'?v='+Date.now()];
  let lastErr=null;
  for(const u of tries){
    try{ const r=await fetch(u,{cache:'no-store'}); if(r.ok) return await r.json(); lastErr=new Error(`HTTP ${r.status} for ${path}`); }
    catch(e){ lastErr=e; }
  }
  throw lastErr||new Error('Cannot fetch '+path);
}

/* ── helpers ───────────────────────────────────────────────── */
const isNum = v => typeof v==='number' && isFinite(v);
const mean  = a => { a=a.filter(isNum); return a.length ? a.reduce((s,v)=>s+v,0)/a.length : null; };
const sd    = a => { a=a.filter(isNum); if(a.length<2) return 0; const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1)); };
const median= a => { a=a.filter(isNum).sort((x,y)=>x-y); if(!a.length) return null; const h=a.length>>1; return a.length%2?a[h]:(a[h-1]+a[h])/2; };
const fx    = (v,d=2) => isNum(v) ? v.toFixed(d) : '–';
const sgn   = (v,d=2) => isNum(v) ? (v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(d) : '–';
const esc   = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pfmt  = p => !isNum(p) ? '–' : p<0.001 ? '<0.001' : p.toFixed(3);
const stars = p => !isNum(p) ? '' : p<0.001 ? '***' : p<0.01 ? '**' : p<0.05 ? '*' : '';

let METRICS = [];             // valid metrics (invalid ones, e.g. ROUGE = 0, dropped)
const mLabel = m => m==='CIDEr' && CIDER_X100 ? 'CIDEr' : m==='ROUGE' ? 'ROUGE-L' : m;
const val = (r,m) => { const v=r && r.metrics ? r.metrics[m] : null; return isNum(v) ? (m==='CIDEr'&&CIDER_X100 ? v*100 : v) : null; };
const runsOf = (ds,att) => RAW.runs.filter(r=>r.dataset===ds && (!att || r.attention===att));
const getRun = (ds,att,t,b) => RAW.runs.find(r=>r.dataset===ds&&r.attention===att&&r.threshold===t&&r.batch===b);
const bestOf = (rs,m='CIDEr') => rs.reduce((b,r)=> (val(r,m)??-1) > (val(b,m)??-1) ? r : b, rs[0]);
const cfg = r => r ? `th ${r.threshold} · batch ${r.batch}` : '–';
const dsInfo = k => RAW.datasets.find(d=>d.key===k);
const thrs = ds => dsInfo(ds).thresholds;
const bats = ds => dsInfo(ds).batches;
/* paired configs (threshold, batch) for a dataset */
function pairs(ds){
  const out=[];
  thrs(ds).forEach(t=>bats(ds).forEach(b=>{
    const w=getRun(ds,'local',t,b), h=getRun(ds,'global',t,b);
    if(w&&h) out.push({t,b,w,h,label:`th${t}·b${b}`});
  }));
  return out;
}

/* Exact two-sided Wilcoxon signed-rank test (normal approx. when n > 16). */
function wilcoxon(diffs){
  const d=diffs.filter(v=>isNum(v)&&v!==0); const n=d.length;
  if(n<2) return {n, W:null, p:null};
  const abs=d.map((v,i)=>({a:Math.abs(v),i})).sort((x,y)=>x.a-y.a);
  const rank=new Array(n);
  for(let i=0;i<n;){ let j=i; while(j+1<n && abs[j+1].a===abs[i].a) j++; const rk=(i+j+2)/2; for(let k=i;k<=j;k++) rank[abs[k].i]=rk; i=j+1; }
  const Wp=d.reduce((s,v,i)=>s+(v>0?rank[i]:0),0), total=n*(n+1)/2, W=Math.min(Wp,total-Wp);
  if(n>16){ const mu=total/2, s=Math.sqrt(n*(n+1)*(2*n+1)/24), z=(W-mu+0.5)/s; return {n,W,Wp,p:Math.min(1,2*normCdf(z))}; }
  let le=0; const N=1<<n;
  for(let mask=0;mask<N;mask++){ let s=0; for(let i=0;i<n;i++) if(mask&(1<<i)) s+=rank[i]; if(Math.min(s,total-s)<=W+1e-9) le++; }
  return {n,W,Wp,p:Math.min(1,le/N)};
}
function normCdf(z){ const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989423*Math.exp(-z*z/2);
  const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return z>0?1-p:p; }
function ranks(a){ const s=a.map((v,i)=>({v,i})).sort((x,y)=>x.v-y.v); const r=new Array(a.length);
  for(let i=0;i<s.length;){ let j=i; while(j+1<s.length && s[j+1].v===s[i].v) j++; for(let k=i;k<=j;k++) r[s[k].i]=(i+j)/2+1; i=j+1; } return r; }
function spearman(x,y){ const rx=ranks(x), ry=ranks(y), mx=mean(rx), my=mean(ry);
  let n=0,dx=0,dy=0; for(let i=0;i<rx.length;i++){ n+=(rx[i]-mx)*(ry[i]-my); dx+=(rx[i]-mx)**2; dy+=(ry[i]-my)**2; } return dx&&dy ? n/Math.sqrt(dx*dy) : null; }

/* ══════════════════════════════════════════════════════════════
   2.  DATASET MODAL
   ══════════════════════════════════════════════════════════════ */
function setStatus(msg,type='loading'){
  const bar=document.getElementById('statusBar'), txt=document.getElementById('statusText'), spn=document.getElementById('statusSpinner');
  bar.className='status-bar'+(type==='ok'?' ok':type==='err'?' err':'');
  txt.textContent=msg; if(spn) spn.className='status-spinner'+(type==='loading'?'':' hide');
}
function openModal(){ document.getElementById('overlay').style.display='flex'; }
window.openModal=openModal;

const AV_KEYS=[['threshold_ablation','Word-threshold × batch ablation'],['both_attentions','Local and global attention'],
               ['attention_ablation','Attention-query ablation'],['baselines','Baselines']];

async function scanData(){
  const list=document.getElementById('batchList');
  list.innerHTML=''; document.getElementById('extraInfo').innerHTML='';
  document.getElementById('btnLoad').disabled=true; SEL=null;
  document.getElementById('repoName').textContent=`${GH.owner} / ${GH.repo}`;
  setStatus('Loading results…','loading');
  try{
    RAW=await fetchJSON(`${GH.data}/results.json`);
    if(!RAW||!Array.isArray(RAW.runs)||!RAW.runs.length){ setStatus('⚠ results.json has no runs — run export_results.py.','err'); return; }
    METRICS=(RAW.metrics||[]).filter(m=>!(RAW.invalid_metrics||[]).includes(m));
    RAW.datasets.forEach(d=>addCard(list,d));
    setStatus(`✓ ${RAW.runs.length} runs · ${RAW.datasets.length} datasets · exported ${RAW.exported}`,'ok');
    const want=new URLSearchParams(location.search).get('ds');
    if(want && RAW.datasets.some(d=>d.key===want)){ SEL=want; loadSelected(); }
  }catch(err){
    console.error(err);
    setStatus('❌ data/results.json not found.','err');
    document.getElementById('extraInfo').innerHTML=`
      <div class="src-note"><b>Run the exporter first:</b><br>
      <code>python export_results.py --xlsx GLANCE_Results.xlsx --out data</code><br>
      then commit the <code>data/</code> folder. Opening index.html straight from disk needs a local server
      (<code>python -m http.server</code>).</div>
      <button class="retry-btn" onclick="scanData()">↺ Retry</button>`;
  }
}
function addCard(list,d){
  const div=document.createElement('div'); div.className='batch-opt'; div.dataset.key=d.key;
  const av=d.availability||{};
  const dots=AV_KEYS.map(([k,l])=>`<span class="bdot ${av[k]?'ok':'na'}" title="${l}: ${av[k]?'available':'pending'}"></span>`).join('');
  const n=AV_KEYS.filter(([k])=>av[k]).length;
  const tag=n===AV_KEYS.length?'<span style="font-size:10px;font-weight:700;color:var(--blue)">⬤ Complete</span>'
                               :`<span style="font-size:10px;font-weight:700;color:var(--orange)">◐ ${n}/${AV_KEYS.length} parts</span>`;
  div.innerHTML=`<div class="batch-opt-ico">${d.key==='pascal'?'🖼️':'📷'}</div>
    <div style="flex:1;min-width:0">
      <div class="batch-opt-name">${esc(d.name)} ${tag}</div>
      <div class="batch-opt-desc">${esc(d.images)} · ${d.n_runs} runs · thresholds ${d.thresholds.join('/')} · batch ${d.batches.join('/')}</div>
      <div class="batch-dots">${dots}</div>
    </div><div class="chk">✓</div>`;
  div.addEventListener('click',()=>{ document.querySelectorAll('.batch-opt').forEach(o=>o.classList.remove('sel')); div.classList.add('sel'); SEL=d.key; document.getElementById('btnLoad').disabled=false; });
  div.addEventListener('dblclick',()=>{ SEL=d.key; loadSelected(); });
  list.appendChild(div);
}
function loadSelected(){
  if(!SEL) return;
  const prog=document.getElementById('fetchProgress'), bar=document.getElementById('fetchProgressBar');
  prog.style.display='block'; bar.style.width='60%';
  DS=SEL;
  setTimeout(()=>{
    bar.style.width='100%';
    document.getElementById('overlay').style.display='none'; prog.style.display='none'; bar.style.width='0%';
    const d=dsInfo(DS), b=bestOf(runsOf(DS));
    document.getElementById('dsLabel').textContent=`${d.name} · ${d.n_runs} runs · exported ${RAW.exported}`;
    document.getElementById('cpBadge').textContent=`${ATT[b.attention].model} · ${cfg(b)}`;
    const u=new URL(location.href); u.searchParams.set('ds',DS); history.replaceState(null,'',u);
    setStatus(`✓ ${d.name} loaded`,'ok');
    renderAll();
  },200);
}
window.loadSelected=loadSelected; window.scanData=scanData;

/* ══════════════════════════════════════════════════════════════
   3.  CHART HELPERS
   ══════════════════════════════════════════════════════════════ */
Chart.defaults.color='#8892b0';
Chart.defaults.borderColor='#e2e6f0';
Chart.defaults.font.family="'Outfit',sans-serif";
Chart.defaults.font.size=11;
const GC='#e8edf5';
const LEG={position:'top',labels:{usePointStyle:true,boxWidth:7,color:'#4b5580',padding:10}};
function sc(xl,yl,extraY){
  return{x:{title:{display:!!xl,text:xl,color:'#8892b0'},grid:{color:GC},ticks:{color:'#8892b0'}},
         y:{title:{display:!!yl,text:yl,color:'#8892b0'},grid:{color:GC},ticks:{color:'#8892b0'},...(extraY||{})}};
}
function rgba(hex,a){ const n=parseInt(hex.slice(1),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
function mkChart(id,type,data,opts,plugins){
  if(CHS[id]) CHS[id].destroy();
  const el=document.getElementById(id); if(!el) return null;
  CHS[id]=new Chart(el,{type,data,options:{responsive:true,maintainAspectRatio:true,...opts},plugins:plugins||[]});
  return CHS[id];
}
function mkChartNoAR(id,type,data,opts,plugins){
  if(CHS[id]) CHS[id].destroy();
  const el=document.getElementById(id); if(!el) return null;
  CHS[id]=new Chart(el,{type,data,options:{responsive:true,maintainAspectRatio:false,...opts},plugins:plugins||[]});
  return CHS[id];
}
/* ±σ whiskers for datasets carrying an `errors` array */
const errorBars={
  id:'errorBars',
  afterDatasetsDraw(chart){
    const {ctx}=chart;
    chart.data.datasets.forEach((ds,di)=>{
      if(!ds.errors) return; const meta=chart.getDatasetMeta(di); if(meta.hidden) return;
      const y=chart.scales.y, ca=chart.chartArea; ctx.save(); ctx.beginPath(); ctx.rect(ca.left,ca.top,ca.right-ca.left,ca.bottom-ca.top); ctx.clip();
      ctx.strokeStyle='#1e2340'; ctx.lineWidth=1.2;
      meta.data.forEach((el,i)=>{ const e=ds.errors[i], v=ds.data[i]; if(!isNum(e)||!isNum(v)||e===0) return;
        const a=y.getPixelForValue(v-e), b=y.getPixelForValue(v+e), w=4;
        ctx.beginPath(); ctx.moveTo(el.x,a); ctx.lineTo(el.x,b); ctx.moveTo(el.x-w,a); ctx.lineTo(el.x+w,a); ctx.moveTo(el.x-w,b); ctx.lineTo(el.x+w,b); ctx.stroke(); });
      ctx.restore();
    });
  }
};
/* y-range that keeps every ±σ whisker inside the plot */
function errRange(dsets,zero){
  let lo=Infinity,hi=-Infinity;
  dsets.forEach(d=>d.data.forEach((v,i)=>{ if(!isNum(v)) return; const e=isNum(d.errors&&d.errors[i])?d.errors[i]:0; lo=Math.min(lo,v-e); hi=Math.max(hi,v+e); }));
  if(zero){ lo=Math.min(0,lo); hi=Math.max(0,hi); }
  const pad=(hi-lo)*.06; return {min:Math.floor((lo-pad)*2)/2, max:Math.ceil((hi+pad)*2)/2};
}
/* small value labels on top of bars */
const barLabels={
  id:'barLabels',
  afterDatasetsDraw(chart,_,opts){
    if(!opts||!opts.on) return; const {ctx}=chart;
    chart.data.datasets.forEach((ds,di)=>{ const meta=chart.getDatasetMeta(di); if(meta.hidden) return;
      ctx.save(); ctx.fillStyle='#4b5580'; ctx.font="600 9.5px 'Space Mono',monospace"; ctx.textAlign='center';
      meta.data.forEach((el,i)=>{ const v=ds.data[i]; if(!isNum(v)) return; ctx.fillText(v.toFixed(opts.d??1),el.x,v>=0?el.y-4:el.y+11); });
      ctx.restore(); });
  }
};
/* sequential blue for heatmaps, t∈[0,1] */
function seqColor(t){
  t=Math.max(0,Math.min(1,isNum(t)?t:0));
  const s=[[247,248,252],[147,180,245],[37,99,235]], n=s.length-1, i=Math.min(Math.floor(t*n),n-1), f=t*n-i;
  const c=s[i].map((v,k)=>Math.round(v+(s[i+1][k]-v)*f)); return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/* diverging: blue = GLANCE-W better, purple = GLANCE-WH better, t∈[-1,1] */
function divColor(t){
  t=Math.max(-1,Math.min(1,t||0)); const w=[255,255,255];
  const to=t>=0?[147,180,245]:[196,170,245]; const u=Math.abs(t);
  const c=w.map((v,k)=>Math.round(v+(to[k]-v)*u)); return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }

/* ══════════════════════════════════════════════════════════════
   4.  NAVIGATION & TABS
   ══════════════════════════════════════════════════════════════ */
const TITLES={dashboard:'Dashboard — Overview',explorer:'Ablation Explorer',attention:'Local vs Global Attention',factors:'Factor Effects',
  table:'Results Table',compare:'Dataset Comparison',insights:'Key Insights'};
function goPage(name,btn){
  if(window.innerWidth<=900) closeSb();
  const prev=document.querySelector('.page.active'); if(prev){ prev.classList.remove('active'); void prev.offsetWidth; }
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  if(btn){ btn.classList.add('active'); const ico=btn.querySelector('.nav-ico'); if(ico){ico.style.transform='scale(1.35)';setTimeout(()=>ico.style.transform='',220);} }
  document.getElementById('pageTitle').textContent=TITLES[name]||name;
  setTimeout(()=>Object.values(CHS).forEach(c=>{ if(c.canvas&&c.canvas.offsetParent) c.resize(); }),30);
}
window.goPage=goPage;
function toggleSb(){
  const sb=document.getElementById('sidebar'),ov=document.getElementById('sbOverlay'),hb=document.getElementById('hamburger');
  if(sb.classList.contains('open')) closeSb(); else { sb.classList.add('open'); ov.classList.add('show'); hb.classList.add('open'); document.body.style.overflow='hidden'; }
}
function closeSb(){
  document.getElementById('sidebar').classList.remove('open'); document.getElementById('sbOverlay').classList.remove('show');
  document.getElementById('hamburger').classList.remove('open'); document.body.style.overflow='';
}
window.toggleSb=toggleSb; window.closeSb=closeSb;
window.addEventListener('resize',()=>{ if(window.innerWidth>900) closeSb(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSb(); });
function buildTabs(id,items,onPick,activeKey){
  const bar=document.getElementById(id);
  bar.innerHTML=items.map(([k,l])=>`<button class="tab${k===activeKey?' active':''}" data-k="${esc(k)}">${l}</button>`).join('');
  bar.onclick=e=>{ const t=e.target.closest('.tab'); if(!t) return; bar.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); onPick(t.dataset.k); };
}
const metricTabs = () => METRICS.map(m=>[m,mLabel(m)]);

/* ══════════════════════════════════════════════════════════════
   5.  KPI GRID
   ══════════════════════════════════════════════════════════════ */
function kpiHTML(kpis){
  return kpis.map(k=>`
    <div class="kpi">
      <div class="kpi-ico" style="background:${k.bg}">${k.ico}</div>
      <div>
        <div class="kpi-lbl">${k.lbl}</div>
        <div class="kpi-val" style="color:${k.col}" data-target="${k.val}">${k.val}</div>
        ${k.delta?`<div class="kpi-delta ${k.dn?'dn':'up'}">${k.delta}</div>`:''}
        ${k.sub?`<div class="kpi-sub">${k.sub}</div>`:''}
      </div>
    </div>`).join('');
}
function countUp(root){
  requestAnimationFrame(()=>{
    root.querySelectorAll('.kpi-val').forEach((el,i)=>{
      const t=el.dataset.target; const raw=parseFloat(t); if(isNaN(raw)||!/^-?[\d.]+$/.test(t)) return;
      const dec=(t.split('.')[1]||'').length; let start=null; const dur=800+i*60;
      (function step(ts){ if(!start) start=ts; const p=Math.min((ts-start)/dur,1),e=1-Math.pow(1-p,3); el.textContent=(raw*e).toFixed(dec); if(p<1) requestAnimationFrame(step); })(performance.now());
    });
  });
}
function renderKPI(){
  const all=runsOf(DS), b=bestOf(all), bw=bestOf(runsOf(DS,'local')), bh=bestOf(runsOf(DS,'global'));
  const P=pairs(DS), winsC=P.filter(p=>val(p.w,'CIDEr')>val(p.h,'CIDEr')).length;
  const gap=val(bw,'CIDEr')-val(bh,'CIDEr');
  const eps=all.map(r=>r.epoch).filter(isNum);
  const k=[
    {ico:'🏆',bg:'#d1fae5',col:C.green, lbl:'Best CIDEr',      val:fx(val(b,'CIDEr')), sub:`${ATT[b.attention].model} · ${cfg(b)} · ep ${b.epoch}`},
    {ico:'🅱️',bg:'#dbeafe',col:C.blue,  lbl:'BLEU-1 (best run)',val:fx(val(b,'BLEU-1')),sub:`max over runs ${fx(Math.max(...all.map(r=>val(r,'BLEU-1'))))}`},
    {ico:'4️⃣',bg:'#dbeafe',col:C.blue,  lbl:'BLEU-4 (best run)',val:fx(val(b,'BLEU-4')),sub:`max over runs ${fx(Math.max(...all.map(r=>val(r,'BLEU-4'))))}`},
    {ico:'🌿',bg:'#cffafe',col:C.cyan,  lbl:'METEOR (best run)',val:fx(val(b,'METEOR')),sub:`max over runs ${fx(Math.max(...all.map(r=>val(r,'METEOR'))))}`},
    {ico:'🔍',bg:'#dbeafe',col:ATT.local.col, lbl:'Best GLANCE-W CIDEr', val:fx(val(bw,'CIDEr')),sub:cfg(bw)},
    {ico:'🌐',bg:'#ede9fe',col:ATT.global.col,lbl:'Best GLANCE-WH CIDEr',val:fx(val(bh,'CIDEr')),sub:cfg(bh)},
    {ico:'⚖️',bg:'#fef3c7',col:C.orange,lbl:'Best-vs-best gap', val:sgn(gap), sub:'GLANCE-W − GLANCE-WH, CIDEr', dn:gap<0},
    {ico:'✅',bg:'#fce7f3',col:C.pink,  lbl:'GLANCE-W wins (CIDEr)', val:`${winsC}/${P.length}`, sub:`paired configs · epochs ${Math.min(...eps)}–${Math.max(...eps)}`}
  ];
  const el=document.getElementById('kpiGrid'); el.innerHTML=kpiHTML(k); countUp(el);
}

/* ══════════════════════════════════════════════════════════════
   6.  DASHBOARD PAGE
   ══════════════════════════════════════════════════════════════ */
function srcText(){
  const d=dsInfo(DS), inv=(RAW.invalid_metrics||[]).map(mLabel);
  return `<b>${esc(d.name)}</b> · ${d.n_runs} test runs: two attention variants × word thresholds ${d.thresholds.join(', ')} × batch sizes ${d.batches.join(', ')}, one seed each. `+
         `Each run is tested at its selected checkpoint; the best configuration is chosen on CIDEr${CIDER_X100?' (shown ×100)':''}.`+
         (inv.length?` <b>${inv.join(', ')}</b> reads 0 in every run and is left out until the evaluation is fixed.`:'');
}
function renderDashboard(){
  document.getElementById('srcNote').innerHTML=srcText();
  const bw=bestOf(runsOf(DS,'local')), bh=bestOf(runsOf(DS,'global'));
  mkChartNoAR('c-bestBar','bar',{labels:METRICS.map(mLabel),datasets:[
    {label:`GLANCE-W · ${cfg(bw)}`, data:METRICS.map(m=>val(bw,m)),backgroundColor:rgba(ATT.local.col,.82),borderRadius:6,borderSkipped:false},
    {label:`GLANCE-WH · ${cfg(bh)}`,data:METRICS.map(m=>val(bh,m)),backgroundColor:rgba(ATT.global.col,.72),borderRadius:6,borderSkipped:false}
  ]},{plugins:{legend:LEG,tooltip:{mode:'index',callbacks:{label:c=>`${c.dataset.label}: ${fx(c.parsed.y)}`}},barLabels:{on:true,d:1}},scales:sc('','Score')},[barLabels]);

  const mx=Math.ceil(Math.max(...METRICS.map(m=>Math.max(val(bw,m),val(bh,m))))/10)*10;
  mkChartNoAR('c-radar','radar',{labels:METRICS.map(mLabel),datasets:[
    {label:'GLANCE-W', data:METRICS.map(m=>val(bw,m)),borderColor:ATT.local.col, backgroundColor:rgba(ATT.local.col,.13), borderWidth:2,pointRadius:3,pointBackgroundColor:ATT.local.col},
    {label:'GLANCE-WH',data:METRICS.map(m=>val(bh,m)),borderColor:ATT.global.col,backgroundColor:rgba(ATT.global.col,.10),borderWidth:2,pointRadius:3,pointBackgroundColor:ATT.global.col}
  ]},{plugins:{legend:LEG,tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fx(c.parsed.r)}`}}},
     scales:{r:{min:0,max:mx,angleLines:{color:'#e2e6f0'},grid:{color:'#e2e6f0'},pointLabels:{color:'#4b5580',font:{size:11}},ticks:{color:'#8892b0',stepSize:mx/4,backdropColor:'transparent'}}}});

  const P=pairs(DS), best=bestOf(runsOf(DS));
  const ptStyle=(r)=>r===best?{w:3,c:C.green}:{w:0,c:'transparent'};
  mkChartNoAR('c-allCider','bar',{labels:P.map(p=>[`th ${p.t}`,`b ${p.b}`]),datasets:[
    {label:'GLANCE-W', data:P.map(p=>val(p.w,'CIDEr')),backgroundColor:rgba(ATT.local.col,.82),borderRadius:5,borderSkipped:false,borderWidth:P.map(p=>ptStyle(p.w).w),borderColor:P.map(p=>ptStyle(p.w).c)},
    {label:'GLANCE-WH',data:P.map(p=>val(p.h,'CIDEr')),backgroundColor:rgba(ATT.global.col,.65),borderRadius:5,borderSkipped:false,borderWidth:P.map(p=>ptStyle(p.h).w),borderColor:P.map(p=>ptStyle(p.h).c)}
  ]},{plugins:{legend:LEG,tooltip:{mode:'index',callbacks:{title:c=>{const p=P[c[0].dataIndex];return `Threshold ${p.t} · batch ${p.b}`;},
      label:c=>{const p=P[c.dataIndex], r=c.datasetIndex?p.h:p.w; return `${c.dataset.label}: ${fx(c.parsed.y)} (epoch ${r.epoch})`;}}}},
     scales:sc('Word threshold · batch size','CIDEr',{beginAtZero:false})});

  const w=METRICS.map(m=>P.filter(p=>val(p.w,m)>val(p.h,m)).length), h=METRICS.map(m=>P.filter(p=>val(p.h,m)>val(p.w,m)).length);
  mkChartNoAR('c-wins','bar',{labels:METRICS.map(mLabel),datasets:[
    {label:'GLANCE-W better', data:w,backgroundColor:rgba(ATT.local.col,.82),borderRadius:4},
    {label:'GLANCE-WH better',data:h,backgroundColor:rgba(ATT.global.col,.65),borderRadius:4}
  ]},{indexAxis:'y',plugins:{legend:LEG,tooltip:{mode:'index'}},
     scales:{x:{stacked:true,max:P.length,grid:{color:GC},ticks:{stepSize:1}},y:{stacked:true,grid:{display:false}}}});
}

/* ══════════════════════════════════════════════════════════════
   7.  ABLATION EXPLORER
   ══════════════════════════════════════════════════════════════ */
function renderExplorer(){
  buildTabs('metricTabs',metricTabs(),k=>{METRIC=k;drawExplorer();},METRIC);
  drawExplorer(); renderAttAbl();
}
function drawExplorer(){
  const m=METRIC, T=thrs(DS), B=bats(DS), all=runsOf(DS);
  const vs=all.map(r=>val(r,m)).filter(isNum), lo=Math.min(...vs), hi=Math.max(...vs), top=bestOf(all,m);
  document.getElementById('hmMin').textContent=fx(lo); document.getElementById('hmMax').textContent=fx(hi);
  document.getElementById('hmWrap').innerHTML=['local','global'].map(a=>{
    const ab=bestOf(runsOf(DS,a),m);
    return `<div><div class="hm-title"><span class="sw ${a==='local'?'loc':'glo'}">${ATT[a].model}</span><span class="muted" style="font-weight:500">${ATT[a].label} · best ${fx(val(ab,m))} at ${cfg(ab)}</span></div>
    <table class="grid-hm"><tr><th></th>${B.map(b=>`<th>batch ${b}</th>`).join('')}</tr>
    ${T.map(t=>`<tr><th class="rh">threshold ${t}</th>${B.map(b=>{ const r=getRun(DS,a,t,b), v=val(r,m); const tt=(v-lo)/((hi-lo)||1);
      return `<td class="${r===top?'top':''}" style="background:${seqColor(tt)};color:${tt>.62?'#fff':'var(--text)'}" title="${ATT[a].model} · threshold ${t} · batch ${b} · epoch ${r?r.epoch:'–'}">${fx(v)}<span class="ep" style="color:${tt>.62?'rgba(255,255,255,.8)':''}">ep ${r?r.epoch:'–'}</span></td>`;}).join('')}</tr>`).join('')}
    </table></div>`;}).join('');

  const dsets1=[], dsets2=[];
  ['local','global'].forEach(a=>{
    T.forEach(t=>dsets1.push({label:`${ATT[a].short} · th ${t}`,data:B.map(b=>val(getRun(DS,a,t,b),m)),borderColor:THR_COL[t]||C.slate,backgroundColor:THR_COL[t]||C.slate,
      borderDash:a==='global'?[6,4]:[],borderWidth:2.2,tension:.25,pointRadius:4,pointStyle:a==='global'?'rectRot':'circle'}));
    B.forEach(b=>dsets2.push({label:`${ATT[a].short} · b ${b}`,data:T.map(t=>val(getRun(DS,a,t,b),m)),borderColor:BATCH_COL[b]||C.slate,backgroundColor:BATCH_COL[b]||C.slate,
      borderDash:a==='global'?[6,4]:[],borderWidth:2.2,tension:.25,pointRadius:4,pointStyle:a==='global'?'rectRot':'circle'}));
  });
  const opt=(xl)=>({plugins:{legend:{...LEG,labels:{...LEG.labels,boxWidth:7,font:{size:10}}},tooltip:{mode:'index',intersect:false,callbacks:{label:c=>`${c.dataset.label}: ${fx(c.parsed.y)}`}}},scales:sc(xl,mLabel(m))});
  mkChart('c-vsBatch','line',{labels:B.map(String),datasets:dsets1},opt('Batch size'));
  mkChart('c-vsThr','line',{labels:T.map(String),datasets:dsets2},opt('Word threshold'));
}
function renderAttAbl(){
  const A=RAW.attention_ablation||{}, el=document.getElementById('attAbl');
  if(!A.filled){
    el.innerHTML=`<div class="empty-state" style="margin-bottom:0"><div class="es-ico">⏳</div><h3>Pending</h3>
      <p>The <code>AttentionAblation</code> sheet is in the workbook but has no scores yet (${(A.rows||[]).length} rows laid out).
      Fill it in, rerun <code>export_results.py</code> and push <code>data/</code> — the table appears here automatically.</p></div>`;
    return;
  }
  const cols=A.columns, ms=cols.filter(c=>METRICS.includes(c)||c==='CIDEr');
  const best={}; ms.forEach(c=>best[c]=Math.max(...A.rows.map(r=>isNum(r[c])?r[c]:-1)));
  el.innerHTML=`<div style="overflow-x:auto"><table class="data-table compact"><tr>${cols.map(c=>`<th>${esc(mLabel(c))}</th>`).join('')}</tr>
    ${A.rows.map(r=>`<tr>${cols.map(c=>{ const v=r[c]; const isM=ms.includes(c);
      const shown=isM&&isNum(v)?(c==='CIDEr'&&CIDER_X100&&v<=1.5?v*100:v):v;
      return `<td class="${isM?'num':''} ${isM&&v===best[c]?'best':''}">${isM?fx(shown):esc(v??'')}</td>`;}).join('')}</tr>`).join('')}</table></div>`;
}

/* ══════════════════════════════════════════════════════════════
   8.  LOCAL VS GLOBAL
   ══════════════════════════════════════════════════════════════ */
function renderAttention(){
  const P=pairs(DS);
  const dC=P.map(p=>val(p.w,'CIDEr')-val(p.h,'CIDEr')), wx=wilcoxon(dC);
  const dB4=P.map(p=>val(p.w,'BLEU-4')-val(p.h,'BLEU-4'));
  const muW=mean(runsOf(DS,'local').map(r=>val(r,'CIDEr'))), muH=mean(runsOf(DS,'global').map(r=>val(r,'CIDEr')));
  const k=[
    {ico:'🔍',bg:'#dbeafe',col:ATT.local.col, lbl:'Mean CIDEr · GLANCE-W', val:fx(muW),sub:`σ ${fx(sd(runsOf(DS,'local').map(r=>val(r,'CIDEr'))))} over ${P.length} configs`},
    {ico:'🌐',bg:'#ede9fe',col:ATT.global.col,lbl:'Mean CIDEr · GLANCE-WH',val:fx(muH),sub:`σ ${fx(sd(runsOf(DS,'global').map(r=>val(r,'CIDEr'))))} over ${P.length} configs`},
    {ico:'Δ', bg:'#fef3c7',col:C.orange,lbl:'Mean paired Δ CIDEr',val:sgn(mean(dC)),sub:`median ${sgn(median(dC))} · BLEU-4 ${sgn(mean(dB4))}`,dn:mean(dC)<0},
    {ico:'🧮',bg:'#fce7f3',col:C.pink,  lbl:'Wilcoxon p (CIDEr)',  val:pfmt(wx.p),sub:`n = ${wx.n} pairs · W = ${fx(wx.W,1)} · single seed`}
  ];
  const el=document.getElementById('attKpi'); el.innerHTML=kpiHTML(k); countUp(el);
  buildTabs('deltaTabs',metricTabs(),k=>{DMETRIC=k;drawDelta();},DMETRIC);
  drawDelta();

  /* Δ heatmap */
  const D=P.map(p=>METRICS.map(m=>val(p.w,m)-val(p.h,m)));
  const colMax=METRICS.map((_,j)=>Math.max(...D.map(r=>Math.abs(r[j])))||1);
  document.getElementById('deltaHeat').innerHTML=`<table class="heatmap-table"><tr><th></th>${METRICS.map(m=>`<th>${mLabel(m)}</th>`).join('')}</tr>
    ${P.map((p,i)=>`<tr><th style="text-align:right">th ${p.t} · b ${p.b}</th>${D[i].map((v,j)=>`<td style="background:${divColor(v/colMax[j])}" title="${mLabel(METRICS[j])}: W ${fx(val(p.w,METRICS[j]))} vs WH ${fx(val(p.h,METRICS[j]))}">${sgn(v)}</td>`).join('')}</tr>`).join('')}
    <tr><th style="text-align:right">mean</th>${METRICS.map((_,j)=>{const v=mean(D.map(r=>r[j]));return `<td style="font-weight:700;background:${divColor(v/colMax[j])}">${sgn(v)}</td>`;}).join('')}</tr></table>
    <div class="legend-bar"><span class="sw glo">WH better</span><span class="lg" style="background:linear-gradient(90deg,rgb(196,170,245),#fff,rgb(147,180,245))"></span><span class="sw loc">W better</span></div>`;

  /* paired summary */
  document.getElementById('pairTable').innerHTML=`<tr><th>Metric</th><th>W wins</th><th>WH wins</th><th>Mean Δ</th><th>Median Δ</th><th>p</th></tr>`+
    METRICS.map(m=>{ const d=P.map(p=>val(p.w,m)-val(p.h,m)), t=wilcoxon(d), w=d.filter(v=>v>0).length, h=d.filter(v=>v<0).length;
      return `<tr><td><b>${mLabel(m)}</b></td><td><span class="win loc">${w}</span></td><td><span class="win glo">${h}</span></td>
      <td class="num ${mean(d)>0?'loc-c':'glo-c'}">${sgn(mean(d))}</td><td class="num">${sgn(median(d))}</td>
      <td class="num">${pfmt(t.p)}<span class="sig">${stars(t.p)}</span></td></tr>`;}).join('');
}
function drawDelta(){
  const P=pairs(DS), m=DMETRIC, d=P.map(p=>val(p.w,m)-val(p.h,m));
  mkChart('c-delta','bar',{labels:P.map(p=>[`th ${p.t}`,`b ${p.b}`]),datasets:[{label:`Δ ${mLabel(m)} (W − WH)`,data:d,
    backgroundColor:d.map(v=>v>=0?rgba(ATT.local.col,.8):rgba(ATT.global.col,.7)),borderRadius:5,borderSkipped:false}]},
    {plugins:{legend:{display:false},barLabels:{on:true,d:2},tooltip:{callbacks:{title:c=>{const p=P[c[0].dataIndex];return `Threshold ${p.t} · batch ${p.b}`;},
      label:c=>{const p=P[c.dataIndex];return [`Δ ${sgn(c.parsed.y)}`,`GLANCE-W ${fx(val(p.w,m))} (ep ${p.w.epoch})`,`GLANCE-WH ${fx(val(p.h,m))} (ep ${p.h.epoch})`];}}}},
     scales:sc('Word threshold · batch size',`Δ ${mLabel(m)}`)},[barLabels]);
}

/* ══════════════════════════════════════════════════════════════
   9.  FACTOR EFFECTS
   ══════════════════════════════════════════════════════════════ */
function renderFactors(){
  buildTabs('facTabs',metricTabs(),k=>{FMETRIC=k;drawMarginals();},FMETRIC);
  drawMarginals();
  const P=pairs(DS);
  mkChart('c-epochs','bar',{labels:P.map(p=>[`th ${p.t}`,`b ${p.b}`]),datasets:[
    {label:'GLANCE-W', data:P.map(p=>p.w.epoch),backgroundColor:rgba(ATT.local.col,.8),borderRadius:4},
    {label:'GLANCE-WH',data:P.map(p=>p.h.epoch),backgroundColor:rgba(ATT.global.col,.65),borderRadius:4}
  ]},{plugins:{legend:LEG,tooltip:{mode:'index'}},scales:sc('Word threshold · batch size','Epoch',{beginAtZero:true})});

  mkChart('c-epScatter','scatter',{datasets:['local','global'].map(a=>({label:ATT[a].model,
    data:runsOf(DS,a).map(r=>({x:r.epoch,y:val(r,'CIDEr'),r})),backgroundColor:rgba(ATT[a].col,.75),pointRadius:6,pointHoverRadius:8,pointStyle:a==='global'?'rectRot':'circle'}))},
    {plugins:{legend:LEG,tooltip:{callbacks:{label:c=>{const r=c.raw.r;return `${ATT[r.attention].model} · ${cfg(r)} · epoch ${r.epoch} · CIDEr ${fx(c.parsed.y)}`;}}}},scales:sc('Selected epoch','CIDEr')});

  /* metric agreement */
  const rs=runsOf(DS), V=METRICS.map(m=>rs.map(r=>val(r,m)));
  const offd=[]; METRICS.forEach((_,i)=>METRICS.forEach((_,j)=>{ if(i!==j) offd.push(spearman(V[i],V[j])); }));
  const cLo=Math.min(0,...offd.filter(isNum));
  document.getElementById('corrHeat').innerHTML=`<table class="heatmap-table" style="max-width:640px"><tr><th></th>${METRICS.map(m=>`<th>${mLabel(m)}</th>`).join('')}</tr>
    ${METRICS.map((m,i)=>`<tr><th style="text-align:right">${mLabel(m)}</th>${METRICS.map((_,j)=>{const r=spearman(V[i],V[j]);
      const t=(r-cLo)/(1-cLo); return `<td style="background:${seqColor(t)};color:${t>.62?'#fff':'var(--text)'}">${fx(r,2)}</td>`;}).join('')}</tr>`).join('')}</table>
    <div class="legend-bar"><span>${fx(cLo)}</span><span class="lg" style="background:linear-gradient(90deg,#f7f8fc,#93b4f5,#2563eb)"></span><span>1.00</span></div>`;
}
function drawMarginals(){
  const m=FMETRIC, T=thrs(DS), B=bats(DS);
  const ds=(by,keys)=>['local','global'].map(a=>{ const g=keys.map(k=>runsOf(DS,a).filter(r=>r[by]===k).map(r=>val(r,m)));
    return {label:ATT[a].model,data:g.map(mean),errors:g.map(sd),backgroundColor:rgba(ATT[a].col,a==='local'?.82:.65),borderRadius:6,borderSkipped:false}; });
  const dT=ds('threshold',T), dB=ds('batch',B), r=errRange([...dT,...dB],true);
  const o={plugins:{legend:LEG,barLabels:{on:true,d:1},tooltip:{mode:'index',callbacks:{label:c=>`${c.dataset.label}: ${fx(c.parsed.y)} ± ${fx(c.dataset.errors[c.dataIndex])}`}}},
           scales:sc('',mLabel(m),{min:0,suggestedMax:r.max})};
  mkChart('c-margThr','bar',{labels:T.map(t=>`threshold ${t}`),datasets:dT},o,[errorBars,barLabels]);
  mkChart('c-margBatch','bar',{labels:B.map(b=>`batch ${b}`),datasets:dB},o,[errorBars,barLabels]);
}

/* ══════════════════════════════════════════════════════════════
   10.  RESULTS TABLE
   ══════════════════════════════════════════════════════════════ */
function opts(id,items,cur){ document.getElementById(id).innerHTML=items.map(([v,l])=>`<option value="${v}"${String(v)===String(cur)?' selected':''}>${l}</option>`).join(''); }
function renderTable(){
  const T=[...new Set(RAW.runs.map(r=>r.threshold))].sort(), B=[...new Set(RAW.runs.map(r=>r.batch))].sort((a,b)=>a-b);
  opts('fDs',[['all','All datasets'],...RAW.datasets.map(d=>[d.key,d.name])],DS);
  opts('fAtt',[['all','Both variants'],['local','GLANCE-W (local)'],['global','GLANCE-WH (global)']],'all');
  opts('fThr',[['all','All thresholds'],...T.map(t=>[t,`Threshold ${t}`])],'all');
  opts('fBatch',[['all','All batch sizes'],...B.map(b=>[b,`Batch ${b}`])],'all');
  ['fDs','fAtt','fThr','fBatch'].forEach(id=>document.getElementById(id).onchange=drawTable);
  drawTable(); renderBaselines();
}
function filtered(){
  const g=id=>document.getElementById(id).value;
  return RAW.runs.filter(r=>(g('fDs')==='all'||r.dataset===g('fDs'))&&(g('fAtt')==='all'||r.attention===g('fAtt'))&&
    (g('fThr')==='all'||r.threshold==g('fThr'))&&(g('fBatch')==='all'||r.batch==g('fBatch')));
}
const TCOLS=()=>[['dataset','Dataset'],['attention','Variant'],['threshold','Thr.'],['batch','Batch'],['epoch','Epoch'],...METRICS.map(m=>[m,mLabel(m)])];
function sortVal(r,k){ return METRICS.includes(k)?val(r,k):k==='attention'?ATT[r.attention].model:k==='dataset'?dsInfo(r.dataset).short:r[k]; }
function drawTable(){
  const rows=filtered().slice().sort((a,b)=>{ const x=sortVal(a,SORT.k), y=sortVal(b,SORT.k); return (x>y?1:x<y?-1:0)*SORT.dir; });
  const best={}; METRICS.forEach(m=>best[m]=Math.max(...rows.map(r=>val(r,m))));
  document.getElementById('tblCount').textContent=`${rows.length} runs`;
  const t=document.getElementById('runTable');
  t.innerHTML=`<tr>${TCOLS().map(([k,l])=>`<th class="sortable ${SORT.k===k?'sorted':''}" data-k="${k}">${l}${SORT.k===k?(SORT.dir>0?' ▲':' ▼'):''}</th>`).join('')}</tr>`+
    rows.map(r=>`<tr><td>${dsInfo(r.dataset).short}</td><td><span class="sw ${r.attention==='local'?'loc':'glo'}">${ATT[r.attention].model}</span></td>
      <td class="num">${r.threshold}</td><td class="num">${r.batch??'–'}</td><td class="num">${r.epoch??'–'}</td>
      ${METRICS.map(m=>`<td class="num ${val(r,m)===best[m]?'best':''}">${fx(val(r,m))}</td>`).join('')}</tr>`).join('');
  t.querySelectorAll('th.sortable').forEach(th=>th.onclick=()=>{ const k=th.dataset.k; SORT=SORT.k===k?{k,dir:-SORT.dir}:{k,dir:METRICS.includes(k)?-1:1}; drawTable(); });
}
function downloadCSV(){
  const rows=filtered(), head=['dataset','attention','model','threshold','batch','epoch',...RAW.metrics];
  const lines=[head.join(',')].concat(rows.map(r=>[dsInfo(r.dataset).name,r.attention,ATT[r.attention].model,r.threshold,r.batch??'',r.epoch??'',...RAW.metrics.map(m=>r.metrics[m]??'')].map(v=>/[,"]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v).join(',')));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='glance_results.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function copyLatex(){
  const rows=filtered().slice().sort((a,b)=>a.dataset.localeCompare(b.dataset)||a.attention.localeCompare(b.attention)*-1||a.threshold-b.threshold||a.batch-b.batch);
  const best={}; METRICS.forEach(m=>best[m]=Math.max(...rows.map(r=>val(r,m))));
  const multiDs=new Set(rows.map(r=>r.dataset)).size>1;
  const cols=(multiDs?'l':'')+'lccc'+'c'.repeat(METRICS.length);
  const head=[...(multiDs?['Dataset']:[]),'Variant','Thr.','Batch','Epoch',...METRICS.map(mLabel)].join(' & ');
  const body=rows.map(r=>[...(multiDs?[dsInfo(r.dataset).short]:[]),ATT[r.attention].model,r.threshold,r.batch??'--',r.epoch??'--',
    ...METRICS.map(m=>{const v=fx(val(r,m)); return val(r,m)===best[m]?`\\textbf{${v}}`:v;})].join(' & ')+' \\\\').join('\n');
  const tex=`\\begin{tabular}{${cols}}\n\\hline\n${head} \\\\\n\\hline\n${body}\n\\hline\n\\end{tabular}`;
  const done=()=>toast('LaTeX tabular copied'), fail=()=>{ const w=window.open('','_blank'); if(w){ w.document.write('<pre>'+esc(tex)+'</pre>'); } };
  if(navigator.clipboard) navigator.clipboard.writeText(tex).then(done,fail); else fail();
}
window.downloadCSV=downloadCSV; window.copyLatex=copyLatex;
function renderBaselines(){
  const bl=(RAW.baselines||[]).filter(b=>b.dataset===DS), el=document.getElementById('baseBody');
  document.getElementById('baseDs').textContent=dsInfo(DS).name;
  if(!bl.length){
    el.innerHTML=`<div class="empty-state" style="margin-bottom:0"><div class="es-ico">📚</div><h3>No baselines in the workbook yet</h3>
      <p>Add a sheet named <code>Baselines</code> with columns <code>Dataset | Method | BLEU-1 | BLEU-2 | BLEU-3 | BLEU-4 | METEOR | ROUGE | CIDEr</code>
      (optional <code>Source</code>), on the same scale as the results, then rerun <code>export_results.py</code>.
      GLANCE's best runs are added to the comparison automatically.</p></div>`;
    return;
  }
  const bw=bestOf(runsOf(DS,'local')), bh=bestOf(runsOf(DS,'global'));
  const conv=(m,v)=>isNum(v)?(m==='CIDEr'&&CIDER_X100&&v<=1.5?v*100:v):null;
  const rows=[...bl.map(b=>({name:b.method,src:b.source,v:METRICS.map(m=>conv(m,b.metrics[m])),ours:false})),
    {name:`GLANCE-W (${cfg(bw)})`,v:METRICS.map(m=>val(bw,m)),ours:true},{name:`GLANCE-WH (${cfg(bh)})`,v:METRICS.map(m=>val(bh,m)),ours:true}];
  const best=METRICS.map((_,j)=>Math.max(...rows.map(r=>isNum(r.v[j])?r.v[j]:-1)));
  el.innerHTML=`<div style="overflow-x:auto"><table class="data-table compact"><tr><th>Method</th>${METRICS.map(m=>`<th>${mLabel(m)}</th>`).join('')}</tr>
    ${rows.map(r=>`<tr class="${r.ours?'hl':''}"><td>${r.ours?'<b>':''}${esc(r.name)}${r.ours?'</b>':''}${r.src?` <span class="muted">${esc(r.src)}</span>`:''}</td>
      ${r.v.map((v,j)=>`<td class="num ${v===best[j]?'best':''}">${fx(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

/* ══════════════════════════════════════════════════════════════
   11.  DATASET COMPARISON
   ══════════════════════════════════════════════════════════════ */
function renderCompare(){
  const D=RAW.datasets.map(d=>d.key);
  document.getElementById('cmpTable').innerHTML=`<tr><th>Dataset</th><th>Variant</th><th>Best config</th><th>Epoch</th>${METRICS.map(m=>`<th>${mLabel(m)}</th>`).join('')}<th>W wins (CIDEr)</th></tr>`+
    D.map(k=>{ const P=pairs(k), wins=P.filter(p=>val(p.w,'CIDEr')>val(p.h,'CIDEr')).length;
      return ['local','global'].map((a,i)=>{ const b=bestOf(runsOf(k,a)), o=bestOf(runsOf(k,a==='local'?'global':'local'));
        return `<tr class="${k===DS?'hl':''}">${i===0?`<td rowspan="2"><b>${dsInfo(k).name}</b></td>`:''}<td><span class="sw ${a==='local'?'loc':'glo'}">${ATT[a].model}</span></td>
        <td>${cfg(b)}</td><td class="num">${b.epoch}</td>${METRICS.map(m=>`<td class="num ${val(b,m)>=val(o,m)?'best':''}">${fx(val(b,m))}</td>`).join('')}
        ${i===0?`<td rowspan="2" class="num"><b>${wins}/${P.length}</b></td>`:''}</tr>`;}).join('');}).join('');

  const ds=[];
  D.forEach(k=>['local','global'].forEach(a=>{ const b=bestOf(runsOf(k,a));
    ds.push({label:`${dsInfo(k).short} · ${ATT[a].model}`,data:METRICS.map(m=>val(b,m)),backgroundColor:rgba(DS_COL[k]||C.slate,a==='local'?.85:.45),
      borderColor:DS_COL[k]||C.slate,borderWidth:a==='global'?1.5:0,borderRadius:5,borderSkipped:false}); }));
  mkChart('c-cmpBest','bar',{labels:METRICS.map(mLabel),datasets:ds},{plugins:{legend:LEG,tooltip:{mode:'index',callbacks:{label:c=>`${c.dataset.label}: ${fx(c.parsed.y)}`}}},scales:sc('','Score')});

  const gapDs=D.map(k=>{ const P=pairs(k); const g=METRICS.map(m=>P.map(p=>val(p.w,m)-val(p.h,m)));
    return {label:dsInfo(k).short,data:g.map(mean),errors:g.map(sd),backgroundColor:rgba(DS_COL[k]||C.slate,.8),borderRadius:5,borderSkipped:false};});
  const gr=errRange(gapDs,true);
  mkChart('c-cmpGap','bar',{labels:METRICS.map(mLabel),datasets:gapDs},
    {plugins:{legend:LEG,tooltip:{mode:'index',callbacks:{label:c=>`${c.dataset.label}: ${sgn(c.parsed.y)} ± ${fx(c.dataset.errors[c.dataIndex])} (σ over 9 configs)`}}},scales:sc('','Mean Δ (W − WH) ± σ',{suggestedMin:gr.min,suggestedMax:gr.max})},[errorBars]);

  /* transfer: same config on both datasets */
  if(D.length>=2){
    const [a,b]=D, pts=[];
    ['local','global'].forEach(att=>thrs(a).forEach(t=>bats(a).forEach(bs=>{ const ra=getRun(a,att,t,bs), rb=getRun(b,att,t,bs); if(ra&&rb) pts.push({x:val(ra,'CIDEr'),y:val(rb,'CIDEr'),att,t,bs}); })));
    const rho=spearman(pts.map(p=>p.x),pts.map(p=>p.y));
    document.getElementById('rhoPill').textContent=`CIDEr · Spearman ρ = ${fx(rho)}`;
    mkChart('c-transfer','scatter',{datasets:['local','global'].map(att=>({label:ATT[att].model,data:pts.filter(p=>p.att===att),backgroundColor:rgba(ATT[att].col,.75),
      pointRadius:6,pointHoverRadius:8,pointStyle:att==='global'?'rectRot':'circle'}))},
      {plugins:{legend:LEG,tooltip:{callbacks:{label:c=>{const p=c.raw;return `${ATT[p.att].model} · th ${p.t} · b ${p.bs}: ${dsInfo(a).short} ${fx(p.x)} / ${dsInfo(b).short} ${fx(p.y)}`;}}}},
       scales:sc(`${dsInfo(a).short} CIDEr`,`${dsInfo(b).short} CIDEr`)});
  }
  const B=[...new Set(RAW.runs.map(r=>r.batch))].sort((x,y)=>x-y);
  const epDs=D.map(k=>{ const g=B.map(b=>runsOf(k).filter(r=>r.batch===b).map(r=>r.epoch));
    return {label:dsInfo(k).short,data:g.map(mean),errors:g.map(sd),backgroundColor:rgba(DS_COL[k]||C.slate,.8),borderRadius:5,borderSkipped:false};});
  mkChart('c-cmpEpoch','bar',{labels:B.map(b=>`batch ${b}`),datasets:epDs},
    {plugins:{legend:LEG,tooltip:{mode:'index',callbacks:{label:c=>`${c.dataset.label}: mean epoch ${fx(c.parsed.y,1)} ± ${fx(c.dataset.errors[c.dataIndex],1)}`}}},scales:sc('','Selected epoch (mean ± σ)',{min:0,suggestedMax:errRange(epDs,true).max})},[errorBars]);
}

/* ══════════════════════════════════════════════════════════════
   12.  INSIGHTS
   ══════════════════════════════════════════════════════════════ */
function renderInsights(){
  const ins=[], d=dsInfo(DS), all=runsOf(DS), b=bestOf(all), P=pairs(DS);
  ins.push({ico:'🏆',bg:'#d1fae5',title:`Best on ${d.short}: ${ATT[b.attention].model}, ${cfg(b)}`,
    desc:`CIDEr ${fx(val(b,'CIDEr'))}, BLEU-1 ${fx(val(b,'BLEU-1'))}, BLEU-4 ${fx(val(b,'BLEU-4'))}, METEOR ${fx(val(b,'METEOR'))} at epoch ${b.epoch}. `+
      `The runner-up is ${(()=>{const s=all.slice().sort((x,y)=>val(y,'CIDEr')-val(x,'CIDEr'))[1];return `${ATT[s.attention].model} ${cfg(s)} (${fx(val(s,'CIDEr'))})`;})()}.`});

  const dC=P.map(p=>val(p.w,'CIDEr')-val(p.h,'CIDEr')), wx=wilcoxon(dC), wins=dC.filter(v=>v>0).length;
  const winsAll=METRICS.map(m=>P.filter(p=>val(p.w,m)>val(p.h,m)).length);
  ins.push({ico:'🔍',bg:'#dbeafe',title:'Local vs Global Query',
    desc:`GLANCE-W beats GLANCE-WH on CIDEr in ${wins} of ${P.length} paired configurations (mean Δ ${sgn(mean(dC))}, Wilcoxon p = ${pfmt(wx.p)}). `+
      `Across metrics, its win count ranges from ${Math.min(...winsAll)} to ${Math.max(...winsAll)} of ${P.length}.`});

  const other=RAW.datasets.find(x=>x.key!==DS);
  if(other){
    const g=k=>mean(pairs(k).map(p=>val(p.w,'CIDEr')-val(p.h,'CIDEr')));
    const gp=g('pascal'), gf=g('flickr');
    if(isNum(gp)&&isNum(gf)) ins.push({ico:'📏',bg:'#fef3c7',title:'Dataset Scale',
      desc:`The mean local advantage is ${sgn(gp)} CIDEr on PASCAL 1K-Hindi and ${sgn(gf)} on Flickr 8K-Hindi. `+
        (Math.abs(gf)<Math.abs(gp)?'The gap narrows on the larger dataset, so the benefit of the local query appears scale-dependent.':'The gap does not narrow on the larger dataset.')});
  }
  const marg=(by,keys,a)=>keys.map(k=>({k,v:mean(runsOf(DS,a).filter(r=>r[by]===k).map(r=>val(r,'CIDEr')))})).sort((x,y)=>y.v-x.v);
  const mt=marg('threshold',thrs(DS),'local'), mb=marg('batch',bats(DS),'local');
  ins.push({ico:'🔤',bg:'#fce7f3',title:'Word Threshold',
    desc:`For GLANCE-W, threshold ${mt[0].k} gives the highest mean CIDEr over batch sizes (${fx(mt[0].v)}), threshold ${mt[mt.length-1].k} the lowest (${fx(mt[mt.length-1].v)}). `+
      `For GLANCE-WH the order is ${marg('threshold',thrs(DS),'global').map(x=>x.k).join(' > ')}.`});
  ins.push({ico:'📦',bg:'#cffafe',title:'Batch Size',
    desc:`For GLANCE-W, batch ${mb[0].k} gives the highest mean CIDEr over thresholds (${fx(mb[0].v)}); the order is ${mb.map(x=>x.k).join(' > ')}. `+
      `For GLANCE-WH it is ${marg('batch',bats(DS),'global').map(x=>x.k).join(' > ')}.`});

  const eps=k=>mean(runsOf(k).map(r=>r.epoch));
  if(other) ins.push({ico:'⏱️',bg:'#ede9fe',title:'Convergence',
    desc:`The selected checkpoint comes at epoch ${fx(eps('pascal'),1)} on average for PASCAL and ${fx(eps('flickr'),1)} for Flickr. `+
      (eps('flickr')<eps('pascal')?'With more training images per epoch, Flickr reaches its best validation score earlier.':'PASCAL reaches its best validation score earlier.')});

  if(RAW.datasets.length>=2){
    const [a,bb]=RAW.datasets.map(x=>x.key), pts=[];
    ['local','global'].forEach(att=>thrs(a).forEach(t=>bats(a).forEach(bs=>{const ra=getRun(a,att,t,bs), rb=getRun(bb,att,t,bs); if(ra&&rb) pts.push([val(ra,'CIDEr'),val(rb,'CIDEr')]);})));
    const rho=spearman(pts.map(p=>p[0]),pts.map(p=>p[1]));
    ins.push({ico:'🔁',bg:'#d1fae5',title:'Config Transfer',
      desc:`Ranking the ${pts.length} configurations by CIDEr on each dataset gives Spearman ρ = ${fx(rho)}. `+
        (Math.abs(rho)<0.4?'A configuration that works on one dataset is not a reliable guide to the other.':'Good configurations largely carry over between datasets.')});
  }
  ins.push({ico:'⚠️',bg:'#fee2e2',title:'Rigour Caveat',
    desc:`Every cell is a single training run. Several gaps are a fraction of a point, so seed variance could reverse some of them. Reporting mean ± σ over 3 seeds for the best configurations would make the comparison firmer.`});
  const inv=RAW.invalid_metrics||[];
  if(inv.length) ins.push({ico:'🧰',bg:'#fef3c7',title:`${inv.map(mLabel).join(', ')} Not Computed`,
    desc:`${inv.map(mLabel).join(', ')} is 0.00 in all ${RAW.runs.length} runs, which points to an evaluation-pipeline issue rather than a real score. It is hidden from every chart until the exporter sees non-zero values.`});

  document.getElementById('insightGrid').innerHTML=ins.map(x=>`
    <div class="insight"><div class="ins-ico" style="background:${x.bg}">${x.ico}</div><div class="ins-title">${x.title}</div><div class="ins-desc">${x.desc}</div></div>`).join('');

  document.getElementById('archFlow').innerHTML=`<div class="arch-flow">${FLOW.map((f,i)=>`${i?'<div class="arch-arrow">→</div>':''}<div class="arch-node${f[2]?' hl':''}"><b>${f[0]}</b><span>${f[1]}</span></div>`).join('')}</div>`;
  document.getElementById('archTable').innerHTML=`<table class="data-table">${ARCH.map(([k,v])=>`<tr><td style="width:190px">${k}</td><td>${v}</td></tr>`).join('')}
    <tr><td>Datasets</td><td>${RAW.datasets.map(x=>`${x.name} (${x.images})`).join(' · ')}</td></tr>
    <tr><td>Ablation grid</td><td class="best">2 attention variants × thresholds ${d.thresholds.join('/')} × batch ${d.batches.join('/')} = ${d.n_runs} runs per dataset</td></tr>
    <tr><td>Exported</td><td class="muted">${esc(RAW.exported)} · ${esc(RAW.source_file||'')}</td></tr></table>`;
  document.getElementById('dataNotes').innerHTML=(RAW.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')+
    `<li>CIDEr is stored as a fraction in the workbook and shown ${CIDER_X100?'×100':'as stored'} (<code>CIDER_X100</code> in dashboard.js).</li>`+
    `<li>“Local History” in the workbook is GLANCE-W; “Global History” is GLANCE-WH.</li>`;
}

/* ══════════════════════════════════════════════════════════════
   13.  RENDER ALL
   ══════════════════════════════════════════════════════════════ */
function renderAll(){
  [renderKPI,renderDashboard,renderExplorer,renderAttention,renderFactors,renderTable,renderCompare,renderInsights]
    .forEach(f=>{ try{ f(); }catch(e){ console.error(f.name,e); } });
}
document.addEventListener('DOMContentLoaded',scanData);
