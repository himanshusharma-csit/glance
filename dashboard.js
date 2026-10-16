const METRICS={bleu1:{label:'BLEU-1',key:'bleu1'},bleu2:{label:'BLEU-2',key:'bleu2'},bleu3:{label:'BLEU-3',key:'bleu3'},bleu4:{label:'BLEU-4',key:'bleu4'},meteor:{label:'METEOR',key:'meteor'},cider:{label:'CIDEr',key:'cider'}};
let allRows=[], metric='bleu1', thresholdChart=null, historyChart=null;
const $=id=>document.getElementById(id);
const fmt=(v,k=metric)=>v==null?'—':(k==='cider'?Number(v).toFixed(4):Number(v).toFixed(2));
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
async function init(){
 try{const res=await fetch('data/glance_results.json');if(!res.ok)throw Error('Could not load results JSON');allRows=await res.json();}
 catch(e){$('resultsBody').innerHTML='<tr><td colspan="11">Could not load data/glance_results.json. Make sure you are viewing this dashboard through GitHub Pages or a local web server.</td></tr>';return;}
 allRows.forEach(r=>{r.dataset=clean(r.dataset);r.history=clean(r.history)});
 $('bestBleu').textContent=fmt(Math.max(...allRows.map(r=>r.bleu1)),'bleu1');
 $('bestMeteor').textContent=fmt(Math.max(...allRows.map(r=>r.meteor)),'meteor');
 $('bestCider').textContent=fmt(Math.max(...allRows.map(r=>r.cider)),'cider');
 $('runCount').textContent=allRows.length;
 ['datasetFilter','historyFilter','thresholdFilter','batchFilter'].forEach(id=>$(id).addEventListener('change',render));
 $('resetFilters').addEventListener('click',()=>{['datasetFilter','historyFilter','thresholdFilter','batchFilter'].forEach(id=>$(id).value='all');render()});
 document.querySelectorAll('.metric-btn').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.metric;document.querySelectorAll('.metric-btn').forEach(x=>x.classList.toggle('active',x===b));render()}));
 $('downloadCsv').addEventListener('click',downloadCsv);
 render();
}
function filtered(){
 return allRows.filter(r=>{
  const d=$('datasetFilter').value,h=$('historyFilter').value,t=$('thresholdFilter').value,b=$('batchFilter').value;
  return (d==='all'||r.dataset===d)&&(h==='all'||r.history===h)&&(t==='all'||String(r.threshold)===t)&&(b==='all'||(b==='unknown'?r.batch==null:String(r.batch)===b));
 });
}
function avg(rows,key){const vals=rows.map(r=>r[key]).filter(v=>v!=null&&Number.isFinite(Number(v)));return vals.length?vals.reduce((a,b)=>a+Number(b),0)/vals.length:null}
function baseOptions(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:17,font:{family:'Manrope',size:9}}},tooltip:{backgroundColor:'#173e35',padding:11,titleFont:{family:'Manrope'},bodyFont:{family:'Manrope'},callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{font:{family:'Manrope',size:9},color:'#87938b'},border:{display:false}},y:{beginAtZero:true,grid:{color:'#eef1ed'},ticks:{font:{family:'DM Mono',size:9},color:'#87938b'},border:{display:false}}}}}
function render(){const rows=filtered();$('tableCount').textContent=`${rows.length} ${rows.length===1?'record':'records'}`;drawTable(rows);drawCharts(rows);drawInsight(rows);}
function drawCharts(rows){
 const thresholds=[2,3,4], histories=['Global History','Local History'];
 const colors={'Global History':'#83b95e','Local History':'#254e3d'};
 const tsets=histories.map(h=>({label:h,data:thresholds.map(t=>avg(rows.filter(r=>r.threshold===t&&r.history===h),METRICS[metric].key)),backgroundColor:colors[h],borderRadius:5,maxBarThickness:38}));
 const opts=baseOptions();opts.scales.y.ticks.callback=v=>metric==='cider'?Number(v).toFixed(2):Number(v).toFixed(0);
 if(thresholdChart)thresholdChart.destroy();
 thresholdChart=new Chart($('thresholdChart'),{type:'bar',data:{labels:thresholds.map(t=>`Threshold ${t}`),datasets:tsets},options:opts});
 const hsets=histories.map(h=>({label:h,data:[avg(rows.filter(r=>r.history===h),METRICS[metric].key)],backgroundColor:colors[h],borderRadius:5,maxBarThickness:55}));
 if(historyChart)historyChart.destroy();
 historyChart=new Chart($('historyChart'),{type:'bar',data:{labels:['Mean score'],datasets:hsets},options:{...baseOptions(),scales:{...baseOptions().scales,x:{...baseOptions().scales.x,stacked:false},y:{...baseOptions().scales.y,beginAtZero:true,ticks:{...baseOptions().scales.y.ticks,callback:v=>metric==='cider'?Number(v).toFixed(2):Number(v).toFixed(0)}}}}});
}
function drawTable(rows){
 const sorted=[...rows].sort((a,b)=>a.dataset.localeCompare(b.dataset)||a.history.localeCompare(b.history)||a.threshold-b.threshold||(a.batch??999)-(b.batch??999));
 $('resultsBody').innerHTML=sorted.map(r=>`<tr><td>${r.dataset}</td><td><span class="pill">${r.history}</span></td><td>${r.threshold}</td><td>${r.epoch??'—'}</td><td>${r.batch??'—'}</td><td>${fmt(r.bleu1,'bleu1')}</td><td>${fmt(r.bleu2,'bleu2')}</td><td>${fmt(r.bleu3,'bleu3')}</td><td>${fmt(r.bleu4,'bleu4')}</td><td>${fmt(r.meteor,'meteor')}</td><td>${fmt(r.cider,'cider')}</td></tr>`).join('')||'<tr><td colspan="11">No runs match the selected filters.</td></tr>';
}
function drawInsight(rows){
 const key=METRICS[metric].key, groups=[2,3,4].map(t=>({t,v:avg(rows.filter(r=>r.threshold===t),key)})).filter(x=>x.v!=null);
 if(!groups.length){$('metricInsight').textContent=`No ${METRICS[metric].label} values match the current filters.`;return}
 groups.sort((a,b)=>b.v-a.v);const best=groups[0],v=fmt(best.v,metric);
 $('metricInsight').textContent=`${METRICS[metric].label}: threshold ${best.t} has the highest mean among the currently filtered runs (${v}). This is a descriptive comparison of recorded runs, not a statistical significance test.`;
}
function downloadCsv(){
 const rows=filtered(), cols=['dataset','history','threshold','epoch','batch','bleu1','bleu2','bleu3','bleu4','meteor','cider','rouge'];
 const csv=[cols.join(','),...rows.map(r=>cols.map(k=>{let v=r[k]??'';return `"${String(v).replace(/"/g,'""')}"`}).join(','))].join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='glance_filtered_results.csv';a.click();URL.revokeObjectURL(url);
}
init();
