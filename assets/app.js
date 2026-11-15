const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const brl = v => PRIV() ? 'R$ ••••' : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brl0 = v => PRIV() ? 'R$ ••••' : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const $ = s => document.querySelector(s);
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const INTERNAL = 'Transferência própria';
const FORA = new Set([INTERNAL, 'Repasse']); // não contam como entrada nem saída
let D = null, S = {month:null, view:'overview', prev:{}}, charts = {}, budgets = {};

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r=>setTimeout(r, RM?0:ms));
$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const card=$('.lock-card'), btn=$('#unlockBtn');
  $('#err').textContent=''; card.classList.remove('bad'); btn.textContent='Decifrando…'; btn.classList.add('busy');
  try {
    D = await Cofre.desbloquear('conta', $('#pw').value);
    btn.classList.remove('busy'); card.classList.add('ok'); btn.textContent='Desbloqueado ✓';
    await wait(600); card.classList.add('leave'); await wait(320);
    init();
  } catch(err) {
    btn.classList.remove('busy');
    if(err&&err.code==='sem-arquivo'){ btn.textContent='Desbloquear'; $('#err').textContent='Não encontrei o arquivo data/vault.json. Gere o cofre com tools/gerar_cofre.py.'; return; } btn.textContent='Desbloquear';
    void card.offsetWidth; card.classList.add('bad');
    $('#err').textContent = 'Senha incorreta. Confira e tente de novo.';
  }
});
$('#relock').onclick = () => {
  if(!$('#drawer').hidden){ $('#drawer').hidden=true; document.body.style.overflow=''; }
  Cofre.bloquear();
  D=null; Object.values(charts).forEach(c=>c.destroy()); charts={}; S.kpiShown=false; S.prev={};
  $('#app').hidden=true; $('#lock').hidden=false; $('#pw').value='';
  const card=$('.lock-card'); card.className='lock-card'; $('#unlockBtn').textContent='Desbloquear';
  card.style.animation='none'; void card.offsetWidth; card.style.animation='';
};

/* ---------- data model ---------- */
let TX, MONTHS, YEARS, CATS, CATCOLOR, FATS=[];
/* "Tudo" vale para o ano escolhido (S.year); comparações entre meses continuam atravessando os anos */
const YM = () => MONTHS.filter(m=>m.startsWith(S.year));
const noAno = t => t.m.startsWith(S.year);
const FIXCOL={'PIX para pessoas':'var(--c2)','Viagem':'var(--c4)','Educação':'var(--c6)','Cartão de crédito':'var(--c1)','Transferências / Outros':'var(--c2)','Mercado':'var(--c3)','Contas fixas':'var(--c4)','Compras online':'var(--c5)','Lazer':'var(--c6)','Alimentação':'var(--c7)','Transporte':'var(--c8)','Assinaturas':'var(--c1)','Compras':'var(--c5)'};
const ccol = c => (CATCOLOR&&CATCOLOR[c]) || FIXCOL[c] || 'var(--c9)';
function prep(){
  TX = D.tx.map(([d,desc,v,c,nome]) => ({d,desc,v,c,nome:nome||desc,m:d.slice(0,7)}));
  // faturas detalhadas: liga cada fatura ao débito do extrato com o mesmo valor
  FATS = (D.faturas||[]).slice().sort((a,b)=>a.mes.localeCompare(b.mes));
  FATS.forEach(f=>{
    const t = TX.find(t=>t.c==='Cartão de crédito' && f.venc && t.d===f.venc) || TX.find(t=>t.c==='Cartão de crédito' && Math.abs(-t.v-f.total)<0.02);
    if(t){ t.fat=f; f.tx=t; }
    f.pago = t ? -t.v : (f.pago ?? f.total);
    f.ajuste = Math.round((f.pago - f.total)*100)/100;  // estorno descontado no pagamento etc.
    f.est=new Set(); // compra + cancelamento de mesmo valor se anulam
    f.itens.forEach((n,jn)=>{ if(n[4]>=0||f.est.has(jn)) return; const i=f.itens.findIndex((x,j)=>!f.est.has(j)&&j!==jn&&Math.abs(x[4]+n[4])<0.005); if(i>=0){ f.est.add(i); f.est.add(jn); } });
    f.compras=f.itens.filter((x,j)=>!f.est.has(j));
    f.dist = f.ajuste ? f.compras.concat([[f.venc||'', 'Diferença entre a fatura e o valor pago', null, 'Ajustes', f.ajuste, 0]]) : f.compras;
  });
  try{ const v=localStorage.getItem('fin-detalhar'); S.detalhar = v===null ? true : v==='1'; }catch{ S.detalhar=true; }
  MONTHS = [];
  const ms=TX.map(t=>t.m).sort(); let [y,mo]=ms[0].split('-').map(Number); const end=ms[ms.length-1];
  while(true){ const k=y+'-'+String(mo).padStart(2,'0'); MONTHS.push(k); if(k>=end) break; if(++mo>12){mo=1;y++;} }
  if(!S.month || (S.month!=='all' && !MONTHS.includes(S.month))) S.month = MONTHS[MONTHS.length-1];
  YEARS = [...new Set(MONTHS.map(m=>m.slice(0,4)))];
  S.year = S.month!=='all' ? S.month.slice(0,4) : (YEARS.includes(S.year) ? S.year : YEARS[YEARS.length-1]);
  const tot = {};
  TX.forEach(t => { if(t.v<0 && !FORA.has(t.c)) tot[t.c]=(tot[t.c]||0)-t.v; });
  CATS = Object.keys(tot).sort((a,b)=>tot[b]-tot[a]);
  CATCOLOR = {}; CATS.forEach(c=>CATCOLOR[c] = FIXCOL[c] || 'var(--c9)');
  CATCOLOR['Receitas']='var(--in)'; CATCOLOR[INTERNAL]='var(--c9)'; CATCOLOR['Repasse']='var(--c9)'; CATCOLOR['Rendimentos']='var(--in)';
  // metas padrão: média mensal dos meses com dados, arredondada
  const has = MONTHS.filter(m=>TX.some(t=>t.m===m));
  let saved={}; try{ saved=JSON.parse(localStorage.getItem('fin-metas')||'{}'); }catch{}
  CATS.forEach(c => { budgets[c] = saved[c] ?? Math.ceil((tot[c]/has.length)/10)*10; });
}
const hasData = m => TX.some(t=>t.m===m);
function sel(){ return S.month==='all' ? TX.filter(noAno) : TX.filter(t=>t.m===S.month); }
function summary(list, det=S.detalhar){
  let inn=0,out=0; const cat={}, card={};
  list.forEach(t=>{ if(FORA.has(t.c)) return; if(t.v>0) inn+=t.v; else { out-=t.v;
    if(det && t.fat){ t.fat.dist.forEach(x=>{ cat[x[3]]=(cat[x[3]]||0)+x[4]; card[x[3]]=(card[x[3]]||0)+x[4]; }); }
    else cat[t.c]=(cat[t.c]||0)-t.v; } });
  return {inn,out,net:inn-out,cat,card};
}
function lastSaldo(m){ const s=D.saldo.filter(([d])=>d.startsWith(m==='all'?S.year:m)); return s.length? s[s.length-1][1] : null; }
const label = m => m==='all' ? (YEARS.length>1 ? 'Ano de '+S.year : 'Todo o período') : MESL[+m.slice(5)-1]+' '+m.slice(0,4);

/* ---------- render ---------- */
function init(){
  prep(); $('#lock').hidden=true; $('#app').hidden=false; $('#app').classList.remove('enter'); void $('#app').offsetWidth; $('#app').classList.add('enter');
  barraMeses();
  const fc=$('#fcat'); fc.length=1; [...CATS,...new Set(FATS.flatMap(f=>f.compras.map(x=>x[3]))),'Receitas','Rendimentos',INTERNAL,'Repasse'].filter((v,i,a)=>a.indexOf(v)===i).forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;fc.appendChild(o);});
  ['q','fcat','ftype'].forEach(id=>$('#'+id).addEventListener('input',renderTx));
  document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>{S.view=b.dataset.v;render();});
  $('#revPanel').hidden = !D.revisar.length;
  $('#rev').innerHTML = D.revisar.map(r=>`<tr><td class="num">${r.linha}</td><td class="num">${esc(r.txt)}</td><td>${esc(r.motivo)}</td></tr>`).join('');
  $('#geradoEm').textContent = 'dados atualizados em '+D.geradoEm.split('-').reverse().join('/');
  render();
}
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* barra de meses do ano escolhido; com mais de um ano de dados aparece o seletor ‹ ano › */
function barraMeses(){
  const mb=$('#months'); mb.innerHTML=''; mb.dataset.ano=S.year;
  const mk=(v,t,dis)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.dataset.m=v;b.disabled=!!dis;if(dis)b.title='Sem lançamentos no extrato';b.onclick=()=>{S.month=v;render();};mb.appendChild(b);};
  if(YEARS.length>1){
    const i=YEARS.indexOf(S.year), g=document.createElement('span'); g.className='yr'; g.setAttribute('role','group'); g.setAttribute('aria-label','Ano');
    const seta=(d,t,rot)=>{const b=document.createElement('button');b.type='button';b.className='yr-b';b.textContent=t;b.setAttribute('aria-label',rot);b.disabled=!YEARS[i+d];
      b.onclick=()=>{ S.year=YEARS[i+d]; if(S.month!=='all'){ const c=YM().filter(hasData); S.month=c.length?c[d<0?c.length-1:0]:'all'; } S.openCat=null; render(); };g.appendChild(b);};
    seta(-1,'‹','Ano anterior'); const l=document.createElement('b'); l.textContent=S.year; l.setAttribute('aria-live','polite'); g.appendChild(l); seta(1,'›','Ano seguinte');
    mb.appendChild(g);
  }
  mk('all', YEARS.length>1 ? 'Ano todo' : 'Tudo');
  YM().forEach(m=>mk(m,MES[+m.slice(5)-1]+(YEARS.length>1?'':'/'+m.slice(2,4)),!hasData(m)));
}
function render(){
  if(S.month!=='all') S.year=S.month.slice(0,4);
  if($('#months').dataset.ano!==S.year) barraMeses();
  document.querySelectorAll('#months button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===S.month));
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===S.view));
  ['overview','tx','budget'].forEach(v=>$('#v-'+v).hidden = v!==S.view);
  if(S.view==='overview') renderOverview();
  if(S.view==='tx') renderTx();
  if(S.view==='budget') renderBudget();
  moveInd();
}
function moveInd(){ const b=document.querySelector('nav.tabs button[aria-selected="true"]'), i=$('#tabInd'); if(!b) return; i.style.width=b.offsetWidth+'px'; i.style.transform=`translateX(${b.offsetLeft}px)`; }
addEventListener('resize', moveInd);
function countUp(el, from, to){
  if(RM || from===to){ el.textContent=brl(to); return; }
  const t0=performance.now(), dur=900;
  const step=t=>{ const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,4); el.textContent=brl(from+(to-from)*e); if(k<1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function spark(vals, color, selIdx){
  const W=200,H=34,P=3, v=vals.filter(x=>x!=null); if(v.length<2) return '';
  const mn=Math.min(...v,0), mx=Math.max(...v), rg=(mx-mn)||1;
  const pts=[]; vals.forEach((x,i)=>{ if(x!=null) pts.push([P+i*(W-2*P)/(vals.length-1), H-P-(x-mn)/rg*(H-2*P), i]); });
  const f=n=>n.toFixed(1);
  let d='M'+f(pts[0][0])+' '+f(pts[0][1]);
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2, k=.18;
    const c1x=p1[0]+(p2[0]-p0[0])*k, c1y=Math.min(H-1,Math.max(1,p1[1]+(p2[1]-p0[1])*k));
    const c2x=p2[0]-(p3[0]-p1[0])*k, c2y=Math.min(H-1,Math.max(1,p2[1]-(p3[1]-p1[1])*k));
    d+=` C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  const a=d+` L${pts[pts.length-1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  const sp=pts.find(q=>q[2]===selIdx);
  const mark = sp ? `<line x1="${sp[0].toFixed(1)}" x2="${sp[0].toFixed(1)}" y1="0" y2="${H}" stroke="${color}" stroke-opacity=".35" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${a}" fill="${color}" fill-opacity=".12"/>${mark}<path class="l" d="${d}" stroke="${color}" pathLength="1"/></svg>`;
}
function prevMonth(m){ const i=MONTHS.indexOf(m); for(let j=i-1;j>=0;j--) if(hasData(MONTHS[j])) return MONTHS[j]; return null; }
function deltaTxt(cur,prev,goodUp){
  if(prev==null||!prev) return '<span class="delta">—</span>';
  const p=(cur-prev)/Math.abs(prev)*100, up=p>=0, good = goodUp?up:!up;
  return `<span class="pill ${good?'in':'out'}">${up?'▲':'▼'} ${Math.abs(p).toFixed(0)}%</span> <span class="delta">vs mês anterior</span>`;
}
function renderOverview(noCharts){
  const s=summary(sel()); const pm = S.month!=='all'?prevMonth(S.month):null; const ps = pm?summary(TX.filter(t=>t.m===pm)):null;
  const saldo=lastSaldo(S.month);
  // hero
  const ht=$('#heroTitle'), hl=$('#heroLine');
  ht.textContent=label(S.month); hl.innerHTML = `Entrou <b class="num">${brl(s.inn)}</b> e saiu <b class="num">${brl(s.out)}</b>. ${s.net>=0?'Sobrou':'Faltou'} <b class="num ${s.net>=0?'pos':'neg'}">${brl(Math.abs(s.net))}</b>.`;
  if(!noCharts) [ht,hl].forEach(el=>{ el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); });
  const pct = s.inn ? s.out/s.inn*100 : 0;
  $('#ringPr').style.strokeDashoffset = 100-Math.min(pct,100);
  $('#ringPr').style.stroke = pct>100?'var(--out)':pct>85?'var(--warn)':'var(--in)';
  $('#ringTxt').textContent = pct.toFixed(0)+'%';
  $('#ringCap').textContent = pct>100 ? 'gasto acima do que entrou' : 'das entradas foram gastas';

  // KPIs com sparkline e contagem
  const withData = MONTHS.filter(hasData), si = S.month==='all'?-1:withData.indexOf(S.month);
  const msum = withData.map(m=>summary(TX.filter(t=>t.m===m)));
  const kp=[
    ['Entradas',s.inn,'pos',deltaTxt(s.inn,ps&&ps.inn,true),msum.map(x=>x.inn),'var(--in)'],
    ['Saídas',s.out,'neg',deltaTxt(s.out,ps&&ps.out,false),msum.map(x=>x.out),'var(--out)'],
    ['Resultado',s.net,s.net>=0?'pos':'neg', `<span class="pill ${s.net>=0?'in':'out'}">${s.net>=0?'Sobrou':'Faltou'}</span> <span class="delta">${s.inn?Math.abs(s.net/s.inn*100).toFixed(0)+'% das entradas':''}</span>`,msum.map(x=>x.net),'var(--accent)'],
    ['Saldo em conta',saldo,'',`<span class="delta">último saldo do dia ${S.month==='all'?'no período':'em '+MES[+S.month.slice(5)-1]}</span>`,withData.map(m=>lastSaldo(m)),'var(--c6)'],
  ];
  if(!noCharts){
    $('#kpis').innerHTML = kp.map(([l,v,c,d,sv,col],i)=>`<div class="panel span-3 kpi lift ${S.kpiShown?'':'reveal'}" style="--i:${i}"><div class="lbl">${l}</div><div class="val num ${c}" data-k="${l}">${v==null?'—':brl(S.prev[l]??0)}</div><div>${d}</div>${spark(sv,col,si)}</div>`).join('');
    kp.forEach(([l,v])=>{ if(v==null) return; const el=$(`.val[data-k="${l}"]`); countUp(el, S.prev[l]??0, v); S.prev[l]=v; });
    S.kpiShown=true;
  }

  // categories
  const ents=Object.entries(s.cat).sort((a,b)=>b[1]-a[1]); const max=ents.length?ents[0][1]:1;
  // média mensal de cada categoria nos outros meses com dados (mesmo modo do cartão)
  const outros = S.month==='all' ? [] : MONTHS.filter(m=>hasData(m) && m!==S.month);
  const media={}; outros.forEach(m=>{ const sm=summary(TX.filter(t=>t.m===m)); Object.entries(sm.cat).forEach(([k,v])=>media[k]=(media[k]||0)+v/outros.length); });
  const cmp=(c,v)=>{ if(!outros.length||v<=0) return ''; const a=media[c]||0;
    if(a<1) return `<span class="cmp new" title="Não apareceu nos outros meses">novo</span>`;
    const d=(v-a)/a; if(Math.abs(d)<0.15 || Math.abs(v-a)<30) return `<span class="cmp eq" title="Média mensal: ${brl(a)}">≈ média</span>`;
    return `<span class="cmp ${d>0?'up':'down'}" title="Média mensal: ${brl(a)}">${d>0?'▲':'▼'} ${Math.abs(d*100).toFixed(0)}%</span>`; };
  $('#catSub').textContent = label(S.month)+' · '+ents.length+' categorias';
  if(S.openCat && !s.cat[S.openCat]) S.openCat=null;
  const fatsPer = sel().filter(t=>t.fat); $('#detSw').hidden = !fatsPer.length; $('#detalhar').checked = !!S.detalhar;
  if(fatsPer.length) $('#catSub').textContent += ` · ${fatsPer.length===1?'fatura de '+MES[+fatsPer[0].fat.mes.slice(5)-1]+' detalhada':fatsPer.length+' faturas detalhadas'}`;
  $('#cats').innerHTML = ents.length? ents.map(([c,v],i)=>{
    const open = S.openCat===c;
    let det='';
    if(open){
      const L = sel().filter(t=>t.c===c && t.v<0 && !(S.detalhar && t.fat)).map(t=>({d:t.d,desc:t.desc,v:t.v,t}));
      if(S.detalhar) sel().filter(t=>t.fat).forEach(t=>t.fat.dist.forEach(x=>{ if(x[3]===c) L.push({d:x[0],desc:x[1],v:-x[4],card:t.fat}); }));
      L.sort((a,b)=>b.d.localeCompare(a.d));
      const shown = L.slice(0,8);
      det = `<div class="cat-det"><ul class="cat-tx" id="cat-det-${i}">${shown.map((t,j)=>`<li style="--i:${j}"><span class="d num">${t.d.slice(8)}/${t.d.slice(5,7)}</span><span class="t">${esc(t.desc)}${t.card?'<span class="cardtag">cartão</span>':''}${t.t&&t.t.fat?` <button type="button" class="fatbtn" data-fat="${t.t.fat.mes}">Ver fatura ›</button>`:''}</span><span class="num neg">${brl(t.v)}</span></li>`).join('')}
        <li class="cat-more" style="display:flex"><span>${L.length} lançamento${L.length>1?'s':''}${L.length>8?' · mostrando os 8 mais recentes':''}</span><button type="button" class="linkbtn" data-go="${esc(c)}">Ver em Lançamentos →</button></li></ul></div>`;
    }
    return `<div class="cat-item${open?' open':''}" style="--i:${i}"><button type="button" class="cat-row" data-cat="${esc(c)}" aria-expanded="${open}" aria-controls="cat-det-${i}"><div class="nm"><i class="dot" style="background:${ccol(c)}"></i><span>${c}</span>${cmp(c,v)}${s.card[c]?`<span class="cardtag" title="${brl(s.card[c])} vieram da fatura do cartão">cartão</span>`:''}</div><div class="amt num ${v<0?'pos':''}">${brl(v)} <span class="count">${v<0?'crédito':(v/s.out*100).toFixed(0)+'%'}</span><span class="chev" aria-hidden="true">▶</span></div><div class="bar"><i style="--i:${i};width:${Math.max(0,v/max*100)}%;background:${ccol(c)}"></i></div></button>${det}</div>`;
  }).join('') : '<div class="empty">Sem saídas neste período</div>';
  $('#cats').classList.toggle('anim', !noCharts);
  document.querySelectorAll('#cats .cat-row').forEach(b=>b.onclick=()=>{
    const det=document.querySelector('#cats .cat-det');
    const next = S.openCat===b.dataset.cat?null:b.dataset.cat;
    if(det && next===null && !RM){ det.classList.add('closing'); det.addEventListener('animationend',()=>{ S.openCat=null; renderOverview(true); },{once:true}); return; }
    S.openCat=next; renderOverview(true);
  });
  document.querySelectorAll('#cats [data-fat]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); openFatura(b.dataset.fat, b); });
  $('#detalhar').onchange=e=>{ S.detalhar=e.target.checked; try{localStorage.setItem('fin-detalhar',S.detalhar?'1':'0');}catch{} S.openCat=null; renderOverview(true); $('#cats').classList.add('anim'); };
  document.querySelectorAll('#cats [data-go]').forEach(b=>b.onclick=()=>{ $('#q').value=''; $('#ftype').value=''; $('#fcat').value=b.dataset.go; S.view='tx'; render(); window.scrollTo({top:0}); });

  // insights: com um mês selecionado, fatos do mês; com "Tudo", resumo do período
  const I=[];
  if(S.month!=='all'){ monthInsights(I, s, outros, media); }
  else {
  const all=summary(sel(),false);
  const cc=all.cat['Cartão de crédito']||0;
  if(cc){ const bills=sel().filter(t=>t.c==='Cartão de crédito'), top=bills.reduce((a,t)=>t.v<a.v?t:a,bills[0]);
    I.push(['warn',`<b>Fatura do cartão</b> é ${(cc/all.out*100).toFixed(0)}% de tudo que saiu (${brl0(cc)}). A maior foi em ${MESL[+top.m.slice(5)-1].toLowerCase()}: ${brl0(-top.v)}.`]); }
  if(FATS.length){ const lf=FATS[FATS.length-1], ass=lf.compras.filter(x=>x[3]==='Assinaturas'), top=lf.compras.filter(x=>x[4]>0).sort((a,b)=>b[4]-a[4])[0];
    const byc={}; FATS.forEach(f=>f.compras.forEach(x=>{ if(x[4]>0) byc[x[3]]=(byc[x[3]]||0)+x[4]; })); const tc=Object.entries(byc).sort((a,b)=>b[1]-a[1])[0];
    const big=FATS.flatMap(f=>f.compras).sort((a,b)=>b[4]-a[4])[0];
    const span = FATS.length>2 ? `${MES[+FATS[0].mes.slice(5)-1]} a ${MES[+lf.mes.slice(5)-1]}` : FATS.map(f=>MES[+f.mes.slice(5)-1]).join(' e ');
    I.push(['in',`<b>${FATS.length} fatura${FATS.length>1?'s':''} do cartão detalhada${FATS.length>1?'s':''}</b> (${span}). No cartão, o que mais pesou foi ${esc(tc[0])} (${brl0(tc[1])}); a maior compra foi ${esc(big[1])}, ${brl0(big[4])}.${ass.length?` Assinaturas: ${brl0(ass.reduce((a,x)=>a+x[4],0))}/mês.`:''}`]); }
  if(all.cat['Saques']) I.push(['warn',`<b>${brl0(all.cat['Saques'])} em saques</b> no período. Dinheiro vivo some do controle; vale anotar o destino.`]);
  const gaps=YM().filter(m=>!hasData(m));
  if(gaps.length) I.push(['out',`<b>${gaps.map(m=>MESL[+m.slice(5)-1]).join(', ')} sem dados</b> no extrato. ${gaps.length>1?'Esses meses ficam vazios':'O mês fica vazio'} até você importar.`]);
  if(D.revisar&&D.revisar.length) I.push(['out',`<b>${D.revisar.length} linhas para revisar</b> na aba Lançamentos, com valores sem data ou sem descrição.`]);
  const ot=all.cat['Transferências / Outros']; if(ot) I.push(['warn',`<b>${brl0(ot)} sem categoria definida</b> em "Transferências / Outros". Ajuste as regras em extratos/categorias.json.`]);
  $('#insSub').textContent = YEARS.length>1 ? 'Resumo de '+S.year : 'Resumo de todo o período';
  }
  if(!noCharts) $('#insights').innerHTML = I.map(([k,t],i)=>`<li style="--i:${i}"><span class="pill ${k}">${k==='in'?'✓':'!'}</span><span>${t}</span></li>`).join('');

  if(!noCharts) drawCharts();
}
function monthInsights(I, s, outros, media){
  const m=S.month, Lm=sel(), nomeMes=MESL[+m.slice(5)-1].toLowerCase();
  const fd=d=>d.slice(8)+'/'+d.slice(5,7);
  // mês em andamento
  const ult=Lm.reduce((a,t)=>t.d>a?t.d:a,''); const fim=new Date(+m.slice(0,4), +m.slice(5), 0).toISOString().slice(0,10);
  if(m===MONTHS[MONTHS.length-1] && ult && ult<fim && (new Date(fim) - new Date(ult))/864e5 > 3) I.push(['warn',`<b>Mês em andamento</b>: há lançamentos até ${fd(ult)}. Os números ainda vão mudar.`]);
  // resultado vs média
  const nets=outros.map(mm=>summary(TX.filter(t=>t.m===mm)).net), avg=nets.length?nets.reduce((a,b)=>a+b,0)/nets.length:null;
  I.push([s.net>=0?'in':'out',`<b>${s.net>=0?'Sobrou':'Faltou'} ${brl0(Math.abs(s.net))}</b> em ${nomeMes}${avg!=null?`. Nos outros meses, em média, ${avg>=0?'sobrou':'faltou'} ${brl0(Math.abs(avg))}`:''}.`]);
  // categoria que mais subiu / caiu em relação à média
  const dif=Object.entries(s.cat).filter(([c,v])=>v>0&&(media[c]||0)>0).map(([c,v])=>[c,v,media[c],v-media[c]]);
  const up=dif.slice().sort((a,b)=>b[3]-a[3])[0], dn=dif.slice().sort((a,b)=>a[3]-b[3])[0];
  if(up&&up[3]>=50) I.push(['warn',`<b>${esc(up[0])} subiu</b>: ${brl0(up[1])}, ${brl0(up[3])} acima da sua média mensal (${brl0(up[2])}).`]);
  if(dn&&dn[3]<=-50&&dn[0]!==(up&&up[0])) I.push(['in',`<b>${esc(dn[0])} caiu</b>: ${brl0(dn[1])}, ${brl0(-dn[3])} abaixo da média (${brl0(dn[2])}).`]);
  // maior gasto do mês (abre a fatura quando ela está detalhada)
  const it=Lm.filter(t=>t.v<0&&!FORA.has(t.c)&&!t.fat&&t.c!=='Saques').map(t=>({n:t.nome||t.desc,v:-t.v}));
  Lm.filter(t=>t.fat).forEach(t=>t.fat.compras.forEach(x=>{ if(x[4]>0) it.push({n:x[1],v:x[4],card:true,parc:x[2]}); }));
  const big=it.sort((a,b)=>b.v-a.v)[0];
  if(big) I.push(['warn',`<b>Maior gasto: ${esc(big.n)}</b>, ${brl0(big.v)}${big.card?' no cartão'+(big.parc?` (parcela ${big.parc})`:''):''}.`]);
  // fatura do mês
  const ft=Lm.find(t=>t.fat);
  if(ft){ const f=ft.fat, byc={}; f.compras.forEach(x=>{ if(x[4]>0) byc[x[3]]=(byc[x[3]]||0)+x[4]; }); const tc=Object.entries(byc).sort((a,b)=>b[1]-a[1])[0];
    I.push(['warn',`<b>Fatura de ${brl0(f.pago)}</b>, ${(f.pago/s.out*100).toFixed(0)}% das saídas do mês${tc?`; no cartão, ${esc(tc[0])} pesou mais (${brl0(tc[1])})`:''}.${f.proxima?` A próxima fatura já tem ${brl0(f.proxima)} em parcelas.`:''}`]); }
  else { const fb=Lm.find(t=>t.c==='Cartão de crédito'); if(fb) I.push(['warn',`<b>Fatura de ${brl0(-fb.v)}</b> sem detalhe. Adicione a fatura de ${nomeMes} em extratos/faturas para ver as compras.`]); }
  // saques
  const sq=Lm.filter(t=>t.c==='Saques'); if(sq.length) I.push(['warn',`<b>${brl0(-sq.reduce((a,t)=>a+t.v,0))} em saques</b> (${sq.length}×). Dinheiro vivo some do controle; vale anotar o destino.`]);
  // saldo mínimo
  const sd=D.saldo.filter(([d])=>d.startsWith(m)); if(sd.length){ const mn=sd.reduce((a,b)=>b[1]<a[1]?b:a); if(mn[1]<300) I.push(['out',`<b>Saldo chegou a ${brl(mn[1])}</b> em ${fd(mn[0])}. A conta ficou perto de zerar.`]); }
  I.splice(6);
  $('#insSub').textContent=`Fatos de ${nomeMes}${outros.length?', comparados com a média dos outros meses':''}`;
}
function drawCharts(force){
  if(force){ Object.values(charts).forEach(c=>c.destroy()); charts={}; }
  const fg=css('--muted'), grid=css('--line'), cin=css('--in'), cout=css('--out'), acc=css('--accent');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.color = fg;
  const MS = YM();
  if(charts.m && charts.m.$ano!==S.year){ charts.m.destroy(); charts.m=null; }
  const ms = MS.map(m=>summary(TX.filter(t=>t.m===m)));
  const hl = i => S.month==='all'||MS[i]===S.month;
  const bgIn=ms.map((_,i)=>hl(i)?cin:cin+'40'), bgOut=ms.map((_,i)=>hl(i)?cout:cout+'40');
  if(charts.m){ charts.m.data.datasets[0].backgroundColor=bgIn; charts.m.data.datasets[1].backgroundColor=bgOut; charts.m.update(); }
  else { charts.m = new Chart($('#chMonths'),{type:'bar',data:{labels:MS.map(m=>MES[+m.slice(5)-1]),datasets:[
    {label:'Entradas',data:ms.map((x,i)=>hasData(MS[i])?x.inn:null),backgroundColor:bgIn,borderRadius:6,maxBarThickness:22,hoverBackgroundColor:cin},
    {label:'Saídas',data:ms.map((x,i)=>hasData(MS[i])?x.out:null),backgroundColor:bgOut,borderRadius:6,maxBarThickness:22,hoverBackgroundColor:cout}]},
    options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      animation:RM?false:{duration:850,easing:'easeOutQuart',delay:c=>c.type==='data'&&c.mode==='default'&&!c.chart.$done?c.dataIndex*60+c.datasetIndex*120:0,onComplete:a=>{a.chart.$done=true;}},
      onHover:(e,els)=>{ e.native.target.style.cursor = els.length?'pointer':'default'; },
      plugins:{legend:{position:'top',align:'end',labels:{boxWidth:10,boxHeight:10,useBorderRadius:true,borderRadius:3}},
        tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+(c.raw==null?'sem dados':brl(c.raw))}}},
      scales:{x:{grid:{display:false}},y:{grid:{color:grid},border:{display:false},ticks:{callback:v=>'R$ '+(v/1000)+'k'}}},
      onClick:(e,els)=>{ if(els.length){const m=MS[els[0].index]; if(hasData(m)){S.month=m;render();}} }}}); charts.m.$ano=S.year; }
  const sd = D.saldo.filter(([d])=>d.startsWith(S.month==='all'?S.year:S.month));
  if(charts.s) charts.s.destroy();
  const step = 1100/Math.max(sd.length,1);
  const prevY = c => c.index===0 ? c.chart.scales.y.getPixelForValue(0) : c.chart.getDatasetMeta(c.datasetIndex).data[c.index-1].getProps(['y'],true).y;
  const grad = c => { const {ctx:g,chartArea:a}=c.chart; if(!a) return acc+'22'; const x=g.createLinearGradient(0,a.top,0,a.bottom); x.addColorStop(0,acc+'59'); x.addColorStop(1,acc+'00'); return x; };
  charts.s = new Chart($('#chSaldo'),{type:'line',data:{labels:sd.map(([d])=>d.slice(8)+'/'+d.slice(5,7)),datasets:[{label:'Saldo',data:sd.map(x=>x[1]),borderColor:acc,backgroundColor:grad,fill:true,tension:.35,pointRadius:S.month==='all'?0:3,pointHoverRadius:6,pointBackgroundColor:acc,pointBorderColor:css('--surface'),pointBorderWidth:2,borderWidth:2.5}]},
    options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      animation:RM?false:{x:{type:'number',easing:'linear',duration:step,from:NaN,delay:c=>{ if(c.type!=='data'||c.xStarted) return 0; c.xStarted=true; return c.index*step; }},
                          y:{type:'number',easing:'linear',duration:step,from:prevY,delay:c=>{ if(c.type!=='data'||c.yStarted) return 0; c.yStarted=true; return c.index*step; }}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+brl(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{grid:{color:grid},border:{display:false},beginAtZero:true,ticks:{callback:v=>'R$ '+v.toLocaleString('pt-BR')}}}}});
}
document.addEventListener('click',e=>{ const b=e.target.closest('#tbody [data-fat]'); if(b) openFatura(b.dataset.fat,b); });
const norm = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function txList(){
  const inc=$('#incCard').checked, out=[];
  sel().forEach(t=>{
    if(inc && t.fat) t.fat.dist.forEach(x=>out.push({d:x[0]||t.d, desc:x[6]||'', nome:x[1], v:-x[4], c:x[3], card:t.fat, parc:x[2], intl:x[5]}));
    else out.push(t);
  });
  return out;
}
function setCat(c){
  const fc=$('#fcat'); if(![...fc.options].some(o=>o.value===c)) fc.add(new Option(c,c));
  fc.value = fc.value===c ? '' : c; renderTx();
}
function renderTx(){
  const q=norm($('#q').value.trim()), c=$('#fcat').value, ty=$('#ftype').value;
  S.sort = S.sort || {k:'d',dir:-1};
  const L = txList().filter(t=>(!q||norm(t.nome+' '+t.desc).includes(q))&&(!c||t.c===c)&&(!ty||(ty==='in'?t.v>0:t.v<0)));
  const k=S.sort.k, dir=S.sort.dir;
  L.sort((a,b)=>{ const r = k==='v' ? a.v-b.v : String(a[k]).localeCompare(String(b[k]),'pt-BR'); return (r||b.d.localeCompare(a.d))*dir || 0; });
  document.querySelectorAll('.sortbtn').forEach(b=>{ b.dataset.dir = b.dataset.sort===k ? (dir>0?'asc':'desc') : ''; b.setAttribute('aria-sort', b.dataset.sort===k?(dir>0?'ascending':'descending'):'none'); });
  const sum=L.reduce((a,t)=>a+t.v,0);
  const ins=L.filter(t=>t.v>0), outs=L.filter(t=>t.v<0);
  const inn=ins.reduce((a,t)=>a+t.v,0), out=-outs.reduce((a,t)=>a+t.v,0);
  const fora=L.filter(t=>FORA.has(t.c)), foraV=fora.reduce((a,t)=>a+Math.abs(t.v),0);
  const nCard=L.filter(t=>t.card).length;
  const filtros=[c&&('categoria '+c), ty&&(ty==='in'?'só entradas':'só saídas'), q&&('busca “'+esc($('#q').value.trim())+'”'), nCard&&(nCard+' do cartão')].filter(Boolean);
  $('#txSub').innerHTML = `${label(S.month)} · ${L.length} lançamento${L.length===1?'':'s'}${filtros.length?' · '+filtros.join(' · '):''}`;
  const pl=n=>`${n} lançamento${n===1?'':'s'}`;
  const tiles=[
    ['Entradas', inn, 'pos', pl(ins.length), ty==='out'||!ins.length],
    ['Saídas', -out, 'neg', pl(outs.length), ty==='in'||!outs.length],
    [ty?'Total':'Saldo do filtro', sum, sum>=0?'pos':'neg', ins.length&&outs.length?'entradas − saídas':(L.length?'média de '+brl(L.length?sum/L.length:0):'—'), false],
  ];
  $('#txSum').innerHTML = tiles.map(([l,v,cl,sub,dim],i)=>`<div class="txt-tile${dim?' dim':''}"><div class="lbl">${l}</div><div class="v num ${cl}" data-tk="${i}">${brl(S.prevTx?.[i]??0)}</div><div class="sub">${sub}</div></div>`).join('')
    + (foraV?`<p class="note txnote">Inclui ${brl(foraV)} em ${pl(fora.length)} de transferências entre suas contas e repasses, que a Visão geral não conta como entrada nem saída.</p>`:'');
  S.prevTx=S.prevTx||[];
  tiles.forEach(([,v],i)=>{ countUp($(`[data-tk="${i}"]`), S.prevTx[i]??0, v); S.prevTx[i]=v; });
  // ranking: onde mais saiu dinheiro (respeita os filtros)
  const g={}; outs.filter(t=>!FORA.has(t.c)).forEach(t=>{ const n=t.nome; (g[n]=g[n]||{v:0,n:0,c:t.c,card:!!t.card}); g[n].v-=t.v; g[n].n++; });
  const top=Object.entries(g).sort((a,b)=>b[1].v-a[1].v).slice(0,8), mx=top.length?top[0][1].v:1;
  $('#rankSub').textContent = top.length ? `top ${top.length} de ${Object.keys(g).length}` : '';
  $('#rankList').innerHTML = top.length ? top.map(([n,o],i)=>`<button type="button" class="rk" data-q="${esc(n)}" style="--i:${i}"><span class="rk-n"><i class="dot" style="background:${ccol(o.c)}"></i><b>${esc(n)}</b>${o.card?'<span class="cardtag">cartão</span>':''}</span><span class="rk-v num">${brl(o.v)}</span><span class="rk-bar"><i style="width:${o.v/mx*100}%;background:${ccol(o.c)}"></i></span><span class="rk-c">${o.n}× · ${(o.v/out*100).toFixed(0)}%</span></button>`).join('')
    + (!$('#incCard').checked && g['Fatura do cartão Itaú'] ? '<p class="note">Ligue “Incluir compras do cartão” para ver os estabelecimentos dentro das faturas.</p>' : '')
    : '<div class="empty">Sem saídas com esses filtros</div>';
  $('#rankList').querySelectorAll('.rk').forEach(b=>b.onclick=()=>{ const q=$('#q'); q.value = q.value===b.dataset.q ? '' : b.dataset.q; renderTx(); });
  $('#tfoot').innerHTML = L.length ? `<tr><td></td><td><b>Total</b> <span class="count">· ${pl(L.length)}</span></td><td></td><td class="r num ${sum>=0?'pos':'neg'}"><b>${sum>0?'+':''}${brl(sum)}</b></td></tr>` : '';
  $('#tbody').innerHTML = L.length ? L.slice(0,400).map((t,i)=>`<tr class="${t.card?'is-card':''}" style="--i:${Math.min(i,30)}"><td class="num">${t.d.slice(8)}/${t.d.slice(5,7)}</td>
    <td class="desc"><div class="dn"><b>${esc(t.nome)}</b>${t.card?`<span class="cardtag">cartão${t.parc?' · '+t.parc:''}</span>`:''}${t.fat?`<button type="button" class="fatbtn" data-fat="${t.fat.mes}">Ver ${t.fat.compras.length} compras ›</button>`:''}</div>${t.desc&&norm(t.desc)!==norm(t.nome)?`<small>${esc(t.desc)}</small>`:''}<span class="mcat"><i class="dot" style="background:${ccol(t.c)}"></i>${esc(t.c)}</span></td>
    <td><button type="button" class="chip chipbtn${c===t.c?' on':''}" data-fc="${esc(t.c)}" title="Filtrar por ${esc(t.c)}"><i class="dot" style="background:${ccol(t.c)}"></i>${esc(t.c)}</button></td>
    <td class="r num ${t.v>0?'pos':'neg'}">${t.v>0?'+':''}${brl(t.v)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Nenhum lançamento com esses filtros</td></tr>';
  $('#tbody').querySelectorAll('[data-fc]').forEach(b=>b.onclick=()=>setCat(b.dataset.fc));
}
document.querySelectorAll('.sortbtn').forEach(b=>b.onclick=()=>{ const k=b.dataset.sort; S.sort = S.sort&&S.sort.k===k ? {k,dir:-S.sort.dir} : {k,dir:k==='v'?1:(k==='d'?-1:1)}; renderTx(); });
$('#incCard').addEventListener('change',renderTx);
/* ---------- detalhe da fatura (painel lateral) ---------- */
let DW={f:null,cat:null,back:null};
function openFatura(mes, from){
  const f=FATS.find(x=>x.mes===mes); if(!f) return;
  DW={f,cat:null,back:from||document.activeElement};
  const dw=$('#drawer'); dw.classList.remove('closing'); dw.hidden=false; document.body.style.overflow='hidden';
  drawFatura(); setTimeout(()=>$('#dwClose').focus(),60);
}
function closeFatura(){
  const dw=$('#drawer'); if(dw.hidden) return;
  const done=()=>{ dw.hidden=true; dw.classList.remove('closing'); document.body.style.overflow=''; if(DW.back&&DW.back.isConnected) DW.back.focus(); };
  if(RM) return done(); dw.classList.add('closing'); dw.querySelector('.drawer-panel').addEventListener('animationend',done,{once:true});
}
function drawFatura(){
  const f=DW.f, i=FATS.indexOf(f), mn=+f.mes.slice(5)-1;
  $('#dwTitle').textContent=MESL[mn]+' '+f.mes.slice(0,4);
  $('#dwPrev').disabled=i<=0; $('#dwNext').disabled=i>=FATS.length-1;
  const byC={}; f.compras.forEach(x=>byC[x[3]]=(byC[x[3]]||0)+x[4]);
  const cats=Object.entries(byC).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]), tot=cats.reduce((a,[,v])=>a+v,0);
  const list=f.itens.map((x,j)=>({x,est:f.est.has(j)})).filter(o=>!DW.cat||o.x[3]===DW.cat).sort((a,b)=>b.x[0].localeCompare(a.x[0])||b.x[4]-a.x[4]);
  const intl=f.compras.some(x=>x[5]), parc=f.compras.filter(x=>x[2]);
  const fd=s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
  $('#dwBody').innerHTML=`
    <div class="dw-total reveal"><div class="v">${brl(f.total)}</div>
      <div class="dw-chips">${f.venc?`<span class="pill warn">${f.tx?'Debitada':'Paga'} em ${fd(f.venc)}</span>`:''}${!f.tx?'<span class="pill soft">Fora do extrato</span>':''}${f.confere?'<span class="pill in">✓ Confere com o total da fatura</span>':'<span class="pill out">Soma diferente do total impresso</span>'}<span class="pill soft">${f.compras.length} lançamentos</span>${parc.length?`<span class="pill soft">${parc.length} parcelados</span>`:''}</div>
      ${f.ajuste?`<p class="note">O débito foi de ${brl(f.pago)}, ${brl(Math.abs(f.ajuste))} ${f.ajuste<0?'a menos':'a mais'} que o total da fatura. Costuma ser um estorno descontado antes do pagamento ou cobrado no mês seguinte.</p>`:''}
      ${f.obs?`<p class="note">${esc(f.obs)}</p>`:''}</div>
    <div class="dw-sec reveal" style="--i:1"><h3>Por categoria · toque para filtrar</h3>
      <div class="stack">${cats.map(([c,v],k)=>`<i style="--i:${k};width:${v/tot*100}%;background:${ccol(c)}" title="${esc(c)} ${brl(v)}"></i>`).join('')}</div>
      <div class="stack-leg" style="margin-top:10px">${cats.map(([c,v])=>`<button type="button" data-c="${esc(c)}" aria-pressed="${DW.cat===c}"><i class="dot" style="background:${ccol(c)}"></i>${esc(c)} <b>${brl0(v)}</b></button>`).join('')}</div></div>
    <div class="dw-sec reveal" style="--i:2"><h3>${DW.cat?esc(DW.cat)+' · '+list.length+' lançamento'+(list.length>1?'s':''):'Lançamentos'}</h3>
      <ul class="fx">${list.map(({x,est},k)=>`<li class="${est?'est':''}" style="--i:${Math.min(k,20)}"><span class="d">${x[0].slice(8)}/${x[0].slice(5,7)}</span>
        <span class="n"><b>${esc(x[1])}</b><small><i class="dot" style="background:${ccol(x[3])}"></i>${esc(x[3])}${x[2]?` <span class="mini">parcela ${x[2]}</span>`:''}${x[5]?' <span class="mini intl">internacional</span>':''}${est?' <span class="mini est">estornado</span>':''}</small></span>
        <span class="v ${x[4]<0?'pos':''}">${brl(x[4])}</span></li>`).join('')}</ul>
      ${intl&&f.cambio?`<p class="note" style="margin-top:8px">Compra internacional convertida a R$ ${f.cambio.toLocaleString('pt-BR',{minimumFractionDigits:2})} por dólar, mais IOF.</p>`:''}</div>
    ${f.futuras.length?`<div class="dw-sec reveal" style="--i:3"><h3>Parcelas nas próximas faturas</h3>
      <ul class="fx">${f.futuras.map((x,k)=>`<li style="--i:${k}"><span class="d"></span><span class="n"><b>${esc(x[0])}</b><small><span class="mini">parcela ${x[1]}</span></small></span><span class="v">${brl(x[2])}</span></li>`).join('')}</ul>
      <div class="fut-tot"><span>Próxima fatura</span><b>${brl(f.proxima||0)}</b></div>${f.demais?`<div class="fut-tot"><span>Demais faturas</span><b>${brl(f.demais)}</b></div>`:''}</div>`:''}`;
  $('#dwBody').querySelectorAll('.stack-leg button').forEach(b=>b.onclick=()=>{ DW.cat = DW.cat===b.dataset.c?null:b.dataset.c; drawFatura(); });
}
$('#drawer').addEventListener('click',e=>{ if(e.target.closest('[data-close]')) closeFatura(); });
$('#dwPrev').onclick=()=>{ const i=FATS.indexOf(DW.f); if(i>0){ DW.f=FATS[i-1]; DW.cat=null; drawFatura(); $('#dwBody').scrollTop=0; } };
$('#dwNext').onclick=()=>{ const i=FATS.indexOf(DW.f); if(i<FATS.length-1){ DW.f=FATS[i+1]; DW.cat=null; drawFatura(); $('#dwBody').scrollTop=0; } };
addEventListener('keydown',e=>{ if($('#drawer').hidden) return; if(e.key==='Escape') closeFatura(); if(e.key==='ArrowLeft') $('#dwPrev').click(); if(e.key==='ArrowRight') $('#dwNext').click(); });

/* renderBudget: ver assets/orcamento.js */
const mqDark = matchMedia('(prefers-color-scheme: dark)');
function isDark(){ const t=document.documentElement.dataset.theme; return t ? t==='dark' : mqDark.matches; }
function syncThemeUI(){ const d=isDark(); document.documentElement.classList.toggle('is-dark', d); document.querySelectorAll('[data-theme-toggle]').forEach(b=>{ b.setAttribute('aria-label', d?'Ativar modo claro':'Ativar modo escuro'); b.title = d?'Modo claro':'Modo escuro'; }); }
try{ const saved=localStorage.getItem('fin-theme'); if(saved==='dark'||saved==='light') document.documentElement.dataset.theme=saved; }catch{}
syncThemeUI();
document.querySelectorAll('[data-theme-toggle]').forEach(btn=>btn.addEventListener('click', e=>{
  const next = isDark() ? 'light' : 'dark';
  const apply = ()=>{ document.documentElement.dataset.theme=next; syncThemeUI(); };
  try{ localStorage.setItem('fin-theme', next); }catch{}
  if(RM || !document.startViewTransition){ apply(); return; }
  const r=btn.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
  const rad=Math.hypot(Math.max(x,innerWidth-x), Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(apply);
  vt.ready.then(()=>document.documentElement.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${rad}px at ${x}px ${y}px)`]},{duration:600,easing:'cubic-bezier(.2,.75,.2,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
}));
mqDark.addEventListener('change',()=>{ syncThemeUI(); if(D&&S.view==='overview') drawCharts(true); });
new MutationObserver(()=>{ if(D&&S.view==='overview') drawCharts(true); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

// aba já desbloqueada (troca de módulo): abre direto com a chave guardada, sem pedir a senha
(async()=>{ if(!Cofre.aberto()) return;
  try{ const d=await Cofre.abrirSalvo('conta'); if(d){ D=d; init(); } }catch{}
  document.documentElement.classList.remove('booting'); })();

addEventListener('privado',()=>{ if(D) render(); });
