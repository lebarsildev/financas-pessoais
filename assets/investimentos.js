const FREE=['PETR4','VALE3','MGLU3','ITUB4']; // tickers que a brapi.dev libera sem chave
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const brl=v=>PRIV()?'R$ ••••':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brl0=v=>PRIV()?'R$ ••••':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const pct=(v,d=1)=>(v>=0?'+':'')+(v*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const num=(v,d=0)=>v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const qtd=(v,d=0)=>PRIV()?'•••':num(v,d);
const SETOR={PETR4:'petróleo',VALE3:'mineração',PRIO3:'petróleo',BBAS3:'bancos',ITUB4:'bancos',BBDC4:'bancos',TAEE11:'energia',EGIE3:'energia',WEGE3:'indústria'};
const fdate=s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
const $=s=>document.querySelector(s);
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(r=>setTimeout(r,RM?0:ms));
const TCOL={PETR4:'var(--c6)',VALE3:'var(--c4)'}; const tcol=t=>TCOL[t]||'var(--c9)';
const TYCOL={Dividendo:'var(--in)',JCP:'var(--accent)',Rendimento:'var(--c5)'};
let D=null,S={view:'carteira',year:null,month:null,prev:{},psort:{k:'d',dir:-1},tsort:{k:'d',dir:-1}},charts={},Q={};

$('#lockForm').addEventListener('submit',async e=>{
  e.preventDefault(); const card=$('.lock-card'),btn=$('#unlockBtn');
  $('#err').textContent=''; card.classList.remove('bad'); btn.textContent='Decifrando…'; btn.classList.add('busy');
  try{ D=await Cofre.desbloquear('inv',$('#pw').value);
       btn.classList.remove('busy'); card.classList.add('ok'); btn.textContent='Desbloqueado ✓';
       await wait(600); card.classList.add('leave'); await wait(320); init(); }
  catch(err){ btn.classList.remove('busy');
    if(err&&err.code==='sem-arquivo'){ btn.textContent='Desbloquear'; $('#err').textContent='Não encontrei data/investimentos.json. Gere o cofre com tools/gerar_cofre.py.'; return; } btn.textContent='Desbloquear'; void card.offsetWidth; card.classList.add('bad'); $('#err').textContent='Senha incorreta. Confira e tente de novo.'; }
});
$('#relock').onclick=()=>{ Cofre.bloquear(); D=null; killCharts(); S.prev={}; $('#app').hidden=true; $('#lock').hidden=false; $('#pw').value='';
  const c=$('.lock-card'); c.className='lock-card'; $('#unlockBtn').textContent='Desbloquear'; c.style.animation='none'; void c.offsetWidth; c.style.animation=''; };

// aba já desbloqueada (troca de módulo): abre direto com a chave guardada, sem pedir a senha
(async()=>{ if(!Cofre.aberto()) return;
  try{ const d=await Cofre.abrirSalvo('inv'); if(d){ D=d; init(); } }catch{}
  document.documentElement.classList.remove('booting'); })();

/* ---------- tema ---------- */
const mqDark=matchMedia('(prefers-color-scheme: dark)');
const isDark=()=>{const t=document.documentElement.dataset.theme; return t?t==='dark':mqDark.matches;};
function syncThemeUI(){ const d=isDark(); document.documentElement.classList.toggle('is-dark',d); document.querySelectorAll('[data-theme-toggle]').forEach(b=>{b.setAttribute('aria-label',d?'Ativar modo claro':'Ativar modo escuro'); b.title=d?'Modo claro':'Modo escuro';}); }
try{const s=localStorage.getItem('fin-theme'); if(s==='dark'||s==='light') document.documentElement.dataset.theme=s;}catch{}
syncThemeUI();
document.querySelectorAll('[data-theme-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
  const next=isDark()?'light':'dark'; const apply=()=>{document.documentElement.dataset.theme=next; syncThemeUI();};
  try{localStorage.setItem('fin-theme',next);}catch{}
  if(RM||!document.startViewTransition){apply();return;}
  const r=btn.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,rad=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(apply);
  vt.ready.then(()=>document.documentElement.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${rad}px at ${x}px ${y}px)`]},{duration:600,easing:'cubic-bezier(.2,.75,.2,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
}));
const reTheme=()=>{ if(D) render(true); };
mqDark.addEventListener('change',()=>{syncThemeUI(); reTheme();});
new MutationObserver(reTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* ---------- utilitários visuais ---------- */
function countUp(el,from,to,fmt=brl){
  if(RM||from===to){el.textContent=fmt(to);return;}
  const t0=performance.now(),dur=900;
  const step=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,4); el.textContent=fmt(from+(to-from)*e); if(k<1) requestAnimationFrame(step);};
  requestAnimationFrame(step);
}
function spark(vals,color){
  const W=200,H=34,P=3; if(vals.length<2) return '';
  const mn=Math.min(...vals,0),mx=Math.max(...vals),rg=(mx-mn)||1;
  const pts=vals.map((x,i)=>[P+i*(W-2*P)/(vals.length-1),H-P-(x-mn)/rg*(H-2*P)]);
  const f=n=>n.toFixed(1); let d='M'+f(pts[0][0])+' '+f(pts[0][1]);
  for(let i=0;i<pts.length-1;i++){const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2,k=.18;
    d+=` C${f(p1[0]+(p2[0]-p0[0])*k)} ${f(Math.min(H-1,Math.max(1,p1[1]+(p2[1]-p0[1])*k)))} ${f(p2[0]-(p3[0]-p1[0])*k)} ${f(Math.min(H-1,Math.max(1,p2[1]-(p3[1]-p1[1])*k)))} ${f(p2[0])} ${f(p2[1])}`;}
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d} L${f(pts[pts.length-1][0])} ${H} L${f(pts[0][0])} ${H} Z" fill="${color}" fill-opacity=".12"/><path class="l" d="${d}" stroke="${color}" pathLength="1"/></svg>`;
}
function kpis(sel,items,key){
  $(sel).innerHTML=items.map(([l,v,c,d,sp,fmt],i)=>`<div class="panel span-3 kpi lift reveal" style="--i:${i}"><div class="lbl">${l}</div><div class="val num ${c||''}" data-k="${key+l}">${(fmt||brl)(S.prev[key+l]??0)}</div><div>${d||''}</div>${sp||''}</div>`).join('');
  items.forEach(([l,v,,,,fmt])=>{ const el=$(`[data-k="${key+l}"]`); countUp(el,S.prev[key+l]??0,v,fmt||brl); S.prev[key+l]=v; });
}
function killCharts(){ Object.values(charts).forEach(c=>c.destroy()); charts={}; }
function chartBase(){ Chart.defaults.font.family=getComputedStyle(document.body).fontFamily; Chart.defaults.color=css('--muted'); return {grid:css('--line')}; }
const col=v=>v.startsWith('var(')?css(v.slice(4,-1)):v;
const barAnim=()=>RM?false:{duration:800,easing:'easeOutQuart',delay:c=>c.type==='data'&&c.mode==='default'&&!c.chart.$done?c.dataIndex*45+c.datasetIndex*90:0,onComplete:a=>{a.chart.$done=true;}};

/* ---------- modelo ---------- */
const TODAY=()=>D.geradoEm;
const addM=(ym,k)=>{ let [y,m]=ym.split('-').map(Number); m+=k; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return y+'-'+String(m).padStart(2,'0'); };
const mlab=ym=>MES[+ym.slice(5)-1]+'/'+ym.slice(2,4);
/** n meses terminando no mês anterior ao atual, deslocados `off` meses para trás */
function janela(n,off=0){ const cur=TODAY().slice(0,7); const out=[]; for(let i=n+off;i>off;i--) out.push(addM(cur,-i)); return out; }
const last12=()=>janela(12);
/** Provento líquido por ação em cada mês {AAAA-MM: R$}; junta lotes de corretoras diferentes no mesmo pagamento. */
function porAcao(t){
  const ev={}; D.inc.filter(x=>x[1]===t&&x[3]>0).forEach(x=>{ const k=x[0]+'|'+x[2]; const e=ev[k]||(ev[k]=[0,0]); e[0]+=x[4]; e[1]+=x[3]; });
  const m={}; Object.entries(ev).forEach(([k,[v,q]])=>{ const ym=k.slice(0,7); m[ym]=(m[ym]||0)+v/q; }); return m;
}
/** Cotação mais recente entre a da B3 (no cofre), a da brapi.dev e a digitada. */
function cotacao(t,cost,q){
  const c=[]; if(Q[t]) c.push({price:Q[t][0],qd:Q[t][1],src:Q[t][2]});
  const b=D.quotes&&D.quotes[t]; if(b) c.push({price:b[0],qd:b[1],src:'b3'});
  c.sort((a,b)=>String(b.qd).localeCompare(String(a.qd)));
  return c[0]||{price:cost/q,qd:null,src:'none'};
}
/** dias úteis entre a data da cotação e hoje */
function diasUteis(s){ if(!s) return 99; const d=new Date(s.slice(0,10)+'T12:00:00'), h=new Date(); h.setHours(12,0,0,0); let n=0; while(d<h){ d.setDate(d.getDate()+1); const w=d.getDay(); if(w&&w<6&&d<=h) n++; } return n; }
/** Previsão dos próximos 12 meses: o que cada ação pagou por ação no mesmo mês do ano passado × quantidade de hoje. */
function previsao(pos){
  const cur=TODAY().slice(0,7), meses=Array.from({length:12},(_,i)=>addM(cur,i)), fut=D.futuros||[];
  const por={}; pos.forEach(p=>{ const pa=porAcao(p.t);
    por[p.t]=meses.map(m=>{ const an=fut.filter(x=>x[1]===p.t&&x[0].startsWith(m)); return an.length?an.reduce((a,x)=>a+x[4],0):(pa[addM(m,-12)]||0)*p.q; });
    p.ps12=janela(12).reduce((a,m)=>a+(pa[m]||0),0); p.ps12a=janela(12,12).reduce((a,m)=>a+(pa[m]||0),0);
    p.ps24=(p.ps12+p.ps12a)/2; p.prev12=por[p.t].reduce((a,b)=>a+b,0);
  });
  const tot=meses.map((_,i)=>pos.reduce((a,p)=>a+por[p.t][i],0));
  return {meses,por,tot,soma:tot.reduce((a,b)=>a+b,0),media2:pos.reduce((a,p)=>a+p.ps24*p.q,0)};
}
function model(){
  const L12=last12(), from=L12[0];
  const pos=D.positions.map(([t,q,cost])=>{
    const {price,qd,src}=cotacao(t,cost,q), val=price*q, inc=D.inc.filter(x=>x[1]===t);
    const p12=inc.filter(x=>x[0].slice(0,7)>=from).reduce((a,x)=>a+x[4],0), pall=inc.reduce((a,x)=>a+x[4],0);
    const gain=val-cost;
    return {t,q,cost,pm:cost/q,price,val,gain,gp:gain/cost,p12,pall,yoc:p12/cost,qd,src,ret:gain+pall,rp:(gain+pall)/cost};
  });
  const tot={cost:pos.reduce((a,p)=>a+p.cost,0),val:pos.reduce((a,p)=>a+p.val,0),pall:pos.reduce((a,p)=>a+p.pall,0)};
  tot.gain=tot.val-tot.cost; tot.gp=tot.gain/tot.cost; tot.ret=tot.gain+tot.pall; tot.rp=tot.ret/tot.cost;
  tot.incAll=D.inc.reduce((a,x)=>a+x[4],0); tot.realized=D.realized.reduce((a,x)=>a+x[1],0);
  tot.life=tot.gain+tot.incAll+tot.realized;
  const m12=L12.map(m=>D.inc.filter(x=>x[0].startsWith(m)).reduce((a,x)=>a+x[4],0));
  tot.p12=m12.reduce((a,b)=>a+b,0); tot.yoc=tot.p12/tot.cost;
  return {pos,tot,L12,m12};
}

/* ---------- cotações (brapi.dev) ---------- */
function saveQ(){ try{localStorage.setItem('inv-quotes',JSON.stringify(Q));}catch{} }
async function fetchQuotes(){
  const ts=D.positions.map(p=>p[0]).filter(t=>FREE.includes(t)); if(!ts.length) return;
  try{
    const r=await fetch('https://brapi.dev/api/quote/'+ts.join(','),{cache:'no-store'}); if(!r.ok) throw 0;
    const j=await r.json(); let changed=false;
    (j.results||[]).forEach(x=>{ if(x.symbol&&x.regularMarketPrice>0){ const t=new Date(x.regularMarketTime||Date.now()), loc=new Date(t-t.getTimezoneOffset()*6e4).toISOString().slice(0,16); Q[x.symbol]=[x.regularMarketPrice,loc,'brapi']; changed=true; } });
    if(changed){ saveQ(); if(S.view==='carteira') render(); }
  }catch{ /* sem internet ou API fora: fica a última cotação salva ou a digitada */ }
}
const fdt=s=>s?fdate(s.slice(0,10))+(s.length>10?' '+s.slice(11,16):''):'';

/* ---------- render ---------- */
function init(){
  try{ Q=JSON.parse(localStorage.getItem('inv-quotes')||'{}'); }catch{ Q={}; }
  fetchQuotes();
  carregarIndices().then(()=>{ if(D&&(S.view==='carteira'||S.view==='plano')) render(); });
  const yrs=[...new Set(D.inc.map(x=>x[0].slice(0,4)))].sort(); S.year=yrs[yrs.length-1];
  $('#yrs').innerHTML=yrs.map(y=>`<button type="button" data-y="${y}">${y}</button>`).join('');
  document.querySelectorAll('#yrs button').forEach(b=>b.onclick=()=>{S.year=b.dataset.y; S.month=null; renderMonth(); renderPTable();});
  const sortv=(sel,key,fn)=>document.querySelectorAll(sel+' .sortbtn').forEach(b=>b.onclick=()=>{ const k=b.dataset.sort, o=S[key]; S[key]=o.k===k?{k,dir:-o.dir}:{k,dir:k==='t'?1:-1}; fn(); });
  sortv('#v-proventos','psort',renderPTable); sortv('#v-historico','tsort',renderTrades);
  $('#pSub').addEventListener('click',e=>{ if(e.target.closest('[data-clear]')){ S.month=null; renderMonth(); renderPTable(); } });
  const pt=$('#pTick'); pt.length=1; [...new Set(D.inc.map(x=>x[1]))].sort().forEach(t=>pt.add(new Option(t,t)));
  ['pTick','pType'].forEach(id=>$('#'+id).addEventListener('input',renderPTable));
  ['tq','tk'].forEach(id=>$('#'+id).addEventListener('input',()=>{S.tlim=30;renderTrades();}));
  $('#tMore button').onclick=()=>{S.tlim+=50;renderTrades();};
  document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>{S.view=b.dataset.v; render();});
  $('#geradoEm').textContent='dados atualizados em '+fdate(D.geradoEm);
  $('#lock').hidden=true; $('#app').hidden=false; $('#app').classList.remove('enter'); void $('#app').offsetWidth; $('#app').classList.add('enter');
  render();
}
function moveInd(){const b=document.querySelector('nav.tabs button[aria-selected="true"]'),i=$('#tabInd'); if(!b)return; i.style.width=b.offsetWidth+'px'; i.style.transform=`translateX(${b.offsetLeft}px)`;}
addEventListener('resize',moveInd);
function render(){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===S.view));
  ['carteira','proventos','historico','plano'].forEach(v=>$('#v-'+v).hidden=v!==S.view);
  killCharts(); chartBase();
  ({carteira:renderCarteira,proventos:renderProventos,historico:renderHistorico,plano:renderPlano})[S.view]();
  moveInd();
}

function renderCarteira(){
  const {pos,tot,L12,m12}=model();
  $('#cEyebrow').textContent='Patrimônio em ações · '+pos.length+' ativos';
  countUp($('#cTotal'),S.prev.total??0,tot.val); S.prev.total=tot.val;
  $('#cLine').innerHTML=`Você investiu <b class="num">${brl0(tot.cost)}</b>, que hoje valem <b class="num ${tot.gain>=0?'pos':'neg'}">${brl0(tot.val)} (${pct(tot.gp)})</b>. Somando os <b class="num">${brl0(tot.pall)}</b> em proventos dessas ações, o resultado total é <b class="num ${tot.ret>=0?'pos':'neg'}">${brl0(tot.ret)} (${pct(tot.rp)})</b>.`;
  // donut
  $('#allocLeg').innerHTML=pos.map(p=>`<div><i class="dot" style="background:${tcol(p.t)}"></i>${p.t} <b>${num(p.val/tot.val*100,0)}%</b></div>`).join('');
  charts.a=new Chart($('#chAlloc'),{type:'doughnut',data:{labels:pos.map(p=>p.t),datasets:[{data:pos.map(p=>p.val),backgroundColor:pos.map(p=>col(tcol(p.t))),borderColor:css('--bg'),borderWidth:3,hoverOffset:6}]},
    options:{cutout:'68%',maintainAspectRatio:false,animation:RM?false:{animateRotate:true,duration:1000,easing:'easeOutQuart'},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+brl(c.raw)}}}}});
  // KPIs
  const cs=D.cost.map(x=>x[1]);
  kpis('#cKpis',[
    ['Valor de mercado',tot.val,'',`<span class="delta">custo ${brl0(tot.cost)}</span>`,spark(cs.slice(-36).concat([tot.val]),'var(--accent)')],
    ['Resultado total',tot.ret,tot.ret>=0?'pos':'neg',`<span class="pill ${tot.ret>=0?'in':'out'}">${pct(tot.rp)}</span> <span class="delta">valorização ${brl0(tot.gain)} + proventos ${brl0(tot.pall)}</span>`,''],
    ['Proventos em 12 meses',tot.p12,'pos',`<span class="delta">média de ${brl0(tot.p12/12)} por mês</span>`,spark(m12,'var(--in)')],
    ['Yield on cost (12m)',tot.yoc,'',`<span class="delta">proventos ÷ valor investido</span>`,'',v=>num(v*100,1)+'%'],
  ],'c');
  // posições
  $('#positions').innerHTML=pos.map((p,i)=>`<div class="panel poscard lift reveal" style="--i:${i+4};--tint:${tcol(p.t)}">
    <div class="pos-top"><div><div class="tick">${p.t}</div><div class="tname">${esc(D.names[p.t]||'')}</div></div>
      <div class="pos-val"><div class="v">${brl(p.val)}</div><span class="pill ${p.gain>=0?'in':'out'}">${p.gain>=0?'▲':'▼'} ${brl0(Math.abs(p.gain))} · ${pct(p.gp)}</span></div></div>
    <div class="stats">
      <div class="stat"><div class="k">Quantidade</div><div class="n">${qtd(p.q)}</div></div>
      <div class="stat"><div class="k">Preço médio</div><div class="n">${brl(p.pm)}</div></div>
      <div class="stat"><div class="k">Proventos 12m</div><div class="n pos">${brl0(p.p12)}</div></div>
      <div class="stat"><div class="k">Yield on cost</div><div class="n">${num(p.yoc*100,1)}%</div></div>
    </div>
    <div class="ret">
      <div class="ret-top"><span>Resultado total</span><b class="num ${p.ret>=0?'pos':'neg'}">${brl0(p.ret)} · ${pct(p.rp)}</b></div>
      <div class="ret-bar" aria-hidden="true">${p.gain>0?`<i class="g" style="width:${p.gain/(p.gain+p.pall)*100}%"></i>`:''}<i class="p" style="width:${(p.gain>0?p.pall/(p.gain+p.pall):1)*100}%"></i></div>
      <div class="ret-leg"><span><i class="dot g"></i>Valorização <b class="num ${p.gain>=0?'':'neg'}">${brl0(p.gain)}</b></span><span><i class="dot p"></i>Proventos <b class="num">${brl0(p.pall)}</b></span><span class="w">${num(p.val/tot.val*100,0)}% da carteira</span></div>
    </div>
    <label class="quote" for="q-${p.t}">Cotação <input class="input" id="q-${p.t}" data-t="${p.t}" type="number" step="0.01" min="0" value="${p.price.toFixed(2)}"> <span>${p.src==='brapi'?'brapi.dev · '+fdt(p.qd):p.src==='manual'?'digitada em '+fdt(p.qd):p.src==='b3'?'fechamento na B3 em '+fdt(p.qd):'sem cotação, usando o preço médio'}</span></label>
  </div>`).join('');
  document.querySelectorAll('#positions input').forEach(inp=>inp.addEventListener('change',()=>{
    const v=parseFloat(inp.value); if(!(v>0)) return; Q[inp.dataset.t]=[v,new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16),'manual']; saveQ(); render();
  }));
  // pontos de atenção
  $('#cIns').innerHTML=atencao(pos,tot).map(([k,t],i)=>`<li style="--i:${i}"><span class="pill ${k}">${k==='in'?'✓':'!'}</span><span>${t}</span></li>`).join('');
  // comparação com CDI e IPCA (assets/plano.js)
  renderComp(tot);
}

function atencao(pos,tot){
  const I=[], pv=previsao(pos);
  // concentração
  const set={}; pos.forEach(p=>{ const k=SETOR[p.t]||'outros'; set[k]=(set[k]||0)+p.val; });
  const top=pos.slice().sort((a,b)=>b.val-a.val)[0], sets=Object.entries(set).sort((a,b)=>b[1]-a[1]);
  if(pos.length<=3||top.val/tot.val>.5) I.push(['warn',`<b>Carteira concentrada:</b> ${pos.length} ${pos.length>1?'ações':'ação'}, ${sets.map(([k,v])=>num(v/tot.val*100,0)+'% em '+k).join(' e ')}. Uma queda do setor pesa na carteira toda.`]);
  // preço abaixo do médio
  pos.filter(p=>p.price<p.pm).forEach(p=>I.push(['warn',`<b>${p.t} abaixo do seu preço médio:</b> ${brl(p.price)} contra ${brl(p.pm)} (${pct(p.price/p.pm-1)}).`]));
  // proventos por ação: 12 meses contra os 12 anteriores
  pos.forEach(p=>{ if(!p.ps12a) return; const v=p.ps12/p.ps12a-1; if(Math.abs(v)<.15) return;
    I.push([v<0?'warn':'in',`<b>${p.t} ${v<0?'pagou menos':'pagou mais'}:</b> ${brl(p.ps12)} por ação nos últimos 12 meses, contra ${brl(p.ps12a)} nos 12 anteriores (${pct(v,0)}).`]); });
  // cotação velha
  const velhas=pos.filter(p=>p.src!=='manual'&&diasUteis(p.qd)>=2);
  if(velhas.length) I.push(['warn',`<b>Cotação desatualizada</b> de ${velhas.map(p=>p.t+' ('+fdt(p.qd).slice(0,5)+')').join(', ')}. Se a busca automática falhar, digite o preço no cartão do ativo.`]);
  pos.filter(p=>p.src==='none').forEach(p=>I.push(['warn',`<b>Sem cotação para ${p.t}</b>. Digite o preço no cartão do ativo.`]));
  // próximo pagamento provável
  const fut=D.futuros||[];
  if(fut.length) I.push(['in',`<b>${brl0(fut.reduce((a,x)=>a+x[4],0))} a receber</b> em proventos já anunciados, até ${fdate(fut[fut.length-1][0])}.`]);
  else { const i=pv.tot.findIndex(v=>v>0); if(i>=0&&i<4){ const m=pv.meses[i], quem=pos.filter(p=>pv.por[p.t][i]>0).map(p=>p.t).join(' e ');
    I.push(['in',`<b>Próximo provento provável em ${MESL[+m.slice(5)-1].toLowerCase()}:</b> no mesmo mês do ano passado ${quem} pagou. Se repetir, entram cerca de ${brl0(pv.tot[i])}.`]); } }
  I.push(['in',`<b>Desde ${D.inc[D.inc.length-1][0].slice(0,4)}, contando tudo:</b> ${brl0(tot.incAll)} em proventos de todas as ações, ${brl0(tot.realized)} nas vendas e ${brl0(tot.gain)} de valorização das posições de hoje. Saldo de ${brl0(tot.life)}.`]);
  return I.slice(0,6);
}

function renderProventos(){
  const {pos,tot,m12}=model(); const all=D.inc.reduce((a,x)=>a+x[4],0), pv=previsao(pos);
  kpis('#pKpis',[
    ['Total recebido',all,'pos',`<span class="delta">${D.inc.length} pagamentos desde ${D.inc[D.inc.length-1][0].slice(0,4)}</span>`,''],
    ['Últimos 12 meses',tot.p12,'pos',`<span class="delta">média de ${brl0(tot.p12/12)} por mês</span>`,spark(m12,'var(--in)')],
    ['Próximos 12 meses',pv.soma,'',`<span class="pill soft">estimativa</span> <span class="delta">${brl0(pv.soma/12)} por mês</span>`,spark(pv.tot,'var(--accent)')],
    ['Yield on cost (12m)',tot.yoc,'',`<span class="delta">sobre ${brl0(tot.cost)} investidos</span>`,'',v=>num(v*100,1)+'%'],
  ],'p');
  const yrs=[...new Set(D.inc.map(x=>x[0].slice(0,4)))].sort(), types=['Dividendo','JCP','Rendimento'];
  const yoc=yrs.map(y=>{ const c=D.cost.filter(x=>x[0].startsWith(y)).map(x=>x[1]).filter(v=>v>0), m=c.length?c.reduce((a,b)=>a+b,0)/c.length:0; return m?D.inc.filter(x=>x[0].startsWith(y)).reduce((a,x)=>a+x[4],0)/m*100:null; });
  charts.y=new Chart($('#chYear'),{type:'bar',data:{labels:yrs,datasets:[...types.map(t=>({label:t,data:yrs.map(y=>D.inc.filter(x=>x[0].startsWith(y)&&x[2]===t).reduce((a,x)=>a+x[4],0)),backgroundColor:col(TYCOL[t]),borderRadius:4,maxBarThickness:34,yAxisID:'y'})),
      {type:'line',label:'Yield on cost',data:yoc,stack:'yoc',borderColor:css('--fg'),backgroundColor:css('--fg'),borderWidth:1.5,pointRadius:3,tension:.3,yAxisID:'y2'}]},
    options:{maintainAspectRatio:false,animation:barAnim(),interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',align:'end',labels:{boxWidth:10,boxHeight:10,useBorderRadius:true,borderRadius:3}},tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y2'?' Yield on cost: '+num(c.raw,1)+'% do valor investido':' '+c.dataset.label+': '+brl(c.raw),footer:it=>'Total: '+brl(it.filter(c=>c.dataset.yAxisID!=='y2').reduce((a,c)=>a+c.raw,0))}}},
      scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:css('--line')},border:{display:false},ticks:{callback:v=>'R$ '+(v/1000)+'k'}},y2:{axis:'y',position:'right',grid:{display:false},border:{display:false},beginAtZero:true,ticks:{callback:v=>v+'%'}}},
      onHover:(e,els)=>{e.native.target.style.cursor=els.length?'pointer':'default';},
      onClick:(e,els)=>{ if(els.length){S.year=yrs[els[0].index]; S.month=null; renderMonth(); renderPTable();} }}});
  renderPrevisao(pos,pv);
  const fut=D.futuros||[]; $('#futPanel').hidden=!fut.length;
  if(fut.length){ $('#futSub').textContent=`${fut.length} pagamentos anunciados · ${brl(fut.reduce((a,x)=>a+x[4],0))}`;
    $('#futBody').innerHTML=fut.map(x=>`<tr><td class="num">${fdate(x[0])}</td><td><span class="chip"><i class="dot" style="background:${tcol(x[1])}"></i>${x[1]}</span></td><td>${esc(x[2])}</td><td class="r num">${num(x[3])}</td><td class="r num pos">${brl(x[4])}</td></tr>`).join(''); }
  renderMonth(); renderPTable();
}
function renderMonth(){
  document.querySelectorAll('#yrs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.y===S.year));
  const y=S.year, rows=D.inc.filter(x=>x[0].startsWith(y)), tot=rows.reduce((a,x)=>a+x[4],0);
  $('#mTitle').textContent=`Proventos por mês em ${y} · ${brl0(tot)}`;
  const ticks=[...new Set(rows.map(x=>x[1]))]; const main=ticks.filter(t=>TCOL[t]); const others=ticks.filter(t=>!TCOL[t]);
  const series=[...main.map(t=>({label:t,f:x=>x[1]===t,c:tcol(t)})), ...(others.length?[{label:'Outros ('+others.length+')',f:x=>!TCOL[x[1]],c:'var(--c9)'}]:[])];
  if(charts.m) charts.m.destroy();
  charts.m=new Chart($('#chMonth'),{type:'bar',data:{labels:MES,datasets:series.map(s=>({label:s.label,data:MES.map((_,i)=>rows.filter(x=>+x[0].slice(5,7)===i+1&&s.f(x)).reduce((a,x)=>a+x[4],0)),backgroundColor:col(s.c),borderRadius:4,maxBarThickness:26}))},
    options:{maintainAspectRatio:false,animation:barAnim(),interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',align:'end',labels:{boxWidth:10,boxHeight:10,useBorderRadius:true,borderRadius:3}},tooltip:{filter:c=>c.raw>0,callbacks:{label:c=>' '+c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:css('--line')},border:{display:false},ticks:{callback:v=>'R$ '+v.toLocaleString('pt-BR')}}},
      onHover:(e,els)=>{e.native.target.style.cursor=els.length?'pointer':'default';},
      onClick:(e,els)=>{ if(els.length){ const m=els[0].index+1; S.month=S.month===m?null:m; renderPTable(); $('#pSub').closest('.panel').scrollIntoView({behavior:RM?'auto':'smooth',block:'start'}); } }}});
}
function renderPrevisao(pos,pv){
  const g=css('--line');
  $('#fcSub').innerHTML=`${brl0(pv.soma)} em 12 meses · quanto cada ação pagou por ação no mesmo mês do ano passado × a quantidade de hoje`;
  $('#fcNote').innerHTML=`É uma estimativa: empresas mudam os proventos de um ano para o outro. Na média por ação dos últimos 2 anos, seriam <b class="num">${brl0(pv.media2)}</b>.${(D.futuros||[]).length?' Pagamentos já anunciados entram com o valor anunciado.':''}`;
  charts.f=new Chart($('#chFut'),{type:'bar',data:{labels:pv.meses.map(mlab),datasets:pos.map(p=>({label:p.t,data:pv.por[p.t],backgroundColor:col(tcol(p.t)),borderRadius:4,maxBarThickness:26}))},
    options:{maintainAspectRatio:false,animation:barAnim(),interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',align:'end',labels:{boxWidth:10,boxHeight:10,useBorderRadius:true,borderRadius:3}},tooltip:{filter:c=>c.raw>0,callbacks:{label:c=>' '+c.dataset.label+': '+brl(c.raw),footer:it=>it.length>1?'Total: '+brl(it.reduce((a,c)=>a+c.raw,0)):''}}},
      scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:g},border:{display:false},ticks:{callback:v=>'R$ '+v.toLocaleString('pt-BR')}}}}});
  // calendário: em quantos dos últimos 3 anos cada ação pagou em cada mês
  const L36=janela(36);
  $('#cal').innerHTML=`<thead><tr><th></th>${MES.map(m=>`<th>${m}</th>`).join('')}</tr></thead><tbody>${pos.map(p=>{ const pa=porAcao(p.t);
    return `<tr><th><span class="chip"><i class="dot" style="background:${tcol(p.t)}"></i>${p.t}</span></th>${MES.map((_,i)=>{ const ms=L36.filter(m=>+m.slice(5)===i+1), pg=ms.filter(m=>pa[m]>0), n=pg.length;
      const tip=n?`${p.t} pagou em ${n} de ${ms.length} anos: `+pg.map(m=>m.slice(0,4)+' '+brl(pa[m])+'/ação').join(', '):`${p.t} não pagou em ${MES[i]} nos últimos 3 anos`;
      return `<td><span class="cal-c" style="--n:${n/3};--c:${tcol(p.t)}" title="${esc(tip)}">${n||''}</span></td>`; }).join('')}</tr>`; }).join('')}</tbody>`;
  $('#calSum').innerHTML=pos.map((p,i)=>{ const meses=MES.filter((_,k)=>L36.some(m=>+m.slice(5)===k+1&&porAcao(p.t)[m]>0)), v=p.ps12a?p.ps12/p.ps12a-1:null;
    return `<div class="cs-row" style="--i:${i}"><span class="chip"><i class="dot" style="background:${tcol(p.t)}"></i>${p.t}</span>
      <div><b class="num">${brl(p.ps12)}</b> por ação em 12 meses${v!=null?` <span class="pill ${v>=0?'in':'out'}">${pct(v,0)}</span>`:''}<small>${meses.length>=8?'paga quase todo mês':'costuma pagar em '+meses.join(', ')} · estimativa de ${brl0(p.prev12)} nos próximos 12 meses</small></div></div>`; }).join('');
}
function sortL(L,o,get){ return L.sort((a,b)=>{ const x=get(a,o.k), y=get(b,o.k); const r=typeof x==='number'?x-y:String(x).localeCompare(String(y),'pt-BR'); return (r||b[0].localeCompare(a[0]))*o.dir; }); }
function marcaSort(sel,o){ document.querySelectorAll(sel+' .sortbtn').forEach(b=>{ const on=b.dataset.sort===o.k; b.dataset.dir=on?(o.dir>0?'asc':'desc'):''; b.setAttribute('aria-sort',on?(o.dir>0?'ascending':'descending'):'none'); }); }
function renderPTable(){
  const t=$('#pTick').value, ty=$('#pType').value, mm=S.month?S.year+'-'+String(S.month).padStart(2,'0'):S.year;
  const L=sortL(D.inc.filter(x=>x[0].startsWith(mm)&&(!t||x[1]===t)&&(!ty||x[2]===ty)),S.psort,(x,k)=>k==='v'?x[4]:k==='t'?x[1]:x[0]);
  marcaSort('#v-proventos',S.psort);
  $('#pSub').innerHTML=`${S.month?`<button type="button" class="fchip" data-clear title="Mostrar o ano todo">${MESL[S.month-1]} ${S.year} <span aria-hidden="true">×</span></button>`:S.year} · ${L.length} pagamentos · <span class="num">${brl(L.reduce((a,x)=>a+x[4],0))}</span>`;
  $('#pBody').innerHTML=L.length?L.map((x,i)=>`<tr style="--i:${Math.min(i,30)}"><td class="num">${fdate(x[0])}</td><td><span class="chip"><i class="dot" style="background:${tcol(x[1])}"></i>${x[1]}</span></td><td><span class="kchip" style="color:${TYCOL[x[2]]}">${x[2]}</span></td><td class="r num">${qtd(x[3])}</td><td class="r num">${x[3]?(x[4]/x[3]).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4}):'—'}</td><td class="r num pos">${brl(x[4])}</td><td>${esc(x[5])}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum provento com esses filtros</td></tr>';
}

function renderHistorico(){
  const tr=D.trades, buys=tr.filter(x=>x[1]==='C'), sells=tr.filter(x=>x[1]==='V');
  const realized=D.realized.reduce((a,x)=>a+x[1],0);
  const tickers=new Set(tr.map(x=>x[2]));
  const td=D.tesouro, ipcaB=td.filter(x=>x[1].includes('IPCA')&&x[2]==='Compra').reduce((a,x)=>a+x[4],0), ipcaS=td.filter(x=>x[1].includes('IPCA')&&x[2]==='Venda').reduce((a,x)=>a+x[4],0), ipcaF=td.filter(x=>x[1].includes('IPCA')&&x[2].startsWith('Cobrança')).reduce((a,x)=>a+x[4],0);
  kpis('#hKpis',[
    ['Negociações',buys.length+sells.length,'',`<span class="delta">${buys.length} compras · ${sells.length} vendas</span>`,'',v=>num(v)],
    ['Ativos diferentes',tickers.size,'',`<span class="delta">desde ${fdate(tr.map(x=>x[0]).sort()[0])}</span>`,'',v=>num(v)],
    ['Resultado realizado',realized,realized>=0?'pos':'neg',`<span class="delta">ações, 2020 a 2023</span>`,''],
    ['Tesouro IPCA+ 2035',ipcaS-ipcaB-ipcaF,'pos',`<span class="delta">ganho líquido de taxas</span>`,''],
  ],'h');
  const yrs=[...new Set(tr.map(x=>x[0].slice(0,4)))].sort();
  charts.v=new Chart($('#chVol'),{data:{labels:yrs,datasets:[
    {type:'bar',label:'Compras',data:yrs.map(y=>buys.filter(x=>x[0].startsWith(y)).reduce((a,x)=>a+x[4],0)),backgroundColor:css('--accent'),borderRadius:5,maxBarThickness:26,order:2},
    {type:'bar',label:'Vendas',data:yrs.map(y=>sells.filter(x=>x[0].startsWith(y)).reduce((a,x)=>a+x[4],0)),backgroundColor:css('--c5'),borderRadius:5,maxBarThickness:26,order:2},
    {type:'line',label:'Resultado realizado',data:yrs.map(y=>D.realyear[y]??0),borderColor:css('--out'),backgroundColor:css('--out'),pointRadius:4,tension:.3,yAxisID:'y2',order:1}]},
    options:{maintainAspectRatio:false,animation:barAnim(),interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',align:'end',labels:{boxWidth:10,boxHeight:10,useBorderRadius:true,borderRadius:3}},tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+brl(c.raw)}}},
      scales:{x:{grid:{display:false}},y:{grid:{color:css('--line')},border:{display:false},ticks:{callback:v=>'R$ '+(v/1000)+'k'}},y2:{axis:'y',position:'right',grid:{display:false},border:{display:false},ticks:{callback:v=>(v/1000)+'k'}}}}});
  const selB=td.filter(x=>x[1].includes('Selic')&&x[2]==='Compra').reduce((a,x)=>a+x[4],0), selS=td.filter(x=>x[1].includes('Selic')&&x[2]==='Venda').reduce((a,x)=>a+x[4],0);
  $('#tdCard').innerHTML=`
    <div><span class="kchip">Tesouro IPCA+ 2035</span></div>
    <div class="td-row"><span>Compra em 29/04/2020</span><b class="num">${brl(ipcaB)}</b></div>
    <div class="td-row"><span>Venda em 26/12/2024</span><b class="num">${brl(ipcaS)}</b></div>
    <div class="td-row"><span>Taxas de custódia</span><b class="num neg">−${brl(ipcaF)}</b></div>
    <div class="td-row"><span>Ganho líquido</span><b class="num pos">${brl(ipcaS-ipcaB-ipcaF)} (${pct((ipcaS-ipcaB-ipcaF)/ipcaB)})</b></div>
    <div style="margin-top:8px"><span class="kchip">Tesouro Selic 2025</span></div>
    <div class="td-row"><span>Vendas em 2020 e 2021</span><b class="num">${brl(selS)}</b></div>
    <p class="note">O extrato da B3 só traz ${brl0(selB)} em compras do Selic, a partir de nov/2019. As compras anteriores não aparecem, então não dá para calcular o ganho.</p>`;
  const r=D.realized, sel=[...r.slice(-6).reverse(),...r.slice(0,6)]; const mx=Math.max(...sel.map(x=>Math.abs(x[1])));
  $('#rank').innerHTML=sel.map(([t,v],i)=>`<div class="rank-row" style="--i:${i}"><span class="t">${t}</span><div class="track"><i class="${v>=0?'g':'l'}" style="width:${Math.abs(v)/mx*50}%;background:${v>=0?'var(--in)':'var(--out)'}"></i></div><span class="v ${v>=0?'pos':'neg'}">${brl0(v)}</span></div>`).join('');
  renderTrades();
}
function renderTrades(){
  const q=$('#tq').value.trim().toUpperCase(), k=$('#tk').value;
  const L=sortL(D.trades.filter(x=>(!q||x[2].includes(q))&&(!k||x[1]===k)),S.tsort,(x,k)=>k==='v'?x[4]:k==='t'?x[2]:x[0]);
  marcaSort('#v-historico',S.tsort);
  S.tlim=S.tlim||30;
  const NM={C:['Compra','in'],V:['Venda','out'],B:['Desdobro/bonificação','warn']};
  const sc=L.filter(x=>x[1]==='C').reduce((a,x)=>a+x[4],0), sv=L.filter(x=>x[1]==='V').reduce((a,x)=>a+x[4],0);
  $('#tSub').innerHTML=`${L.length} registros · compras <b class="num">${brl0(sc)}</b> · vendas <b class="num">${brl0(sv)}</b>${L.length>S.tlim?' · mostrando '+S.tlim:''}`;
  $('#tMore').hidden=L.length<=S.tlim;
  $('#tBody').innerHTML=L.slice(0,S.tlim).map((x,i)=>`<tr style="--i:${Math.min(i,30)}"><td class="num">${fdate(x[0])}</td><td><span class="pill ${NM[x[1]][1]}">${NM[x[1]][0]}</span></td><td class="num">${x[2]}</td><td class="r num">${qtd(x[3],x[3]%1?2:0)}</td><td class="r num">${x[3]&&x[4]?brl(x[4]/x[3]):'—'}</td><td class="r num">${x[4]?brl(x[4]):'—'}</td><td>${esc(x[5])}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nada encontrado</td></tr>';
}

addEventListener('privado',()=>{ if(D) render(); });
