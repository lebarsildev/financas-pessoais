/*
 * Investimentos: comparação da carteira com CDI e IPCA e plano para o primeiro milhão.
 * Índices: data/indices.json (público, % ao mês), atualizado pelo tools/gerar_cofre.py.
 */
let IDX = null;
async function carregarIndices() {
  if (IDX) return IDX;
  try { IDX = window.__IDX || await (await fetch('data/indices.json', { cache: 'no-store' })).json(); } catch { IDX = null; }
  return IDX;
}
const pctA = (v, d = 1) => num(v * 100, d) + '%';
const ultimoMes = k => Object.keys(IDX[k]).sort().pop();
/** taxa acumulada dos últimos 12 meses publicados */
const taxa12 = k => { const ms = Object.keys(IDX[k]).sort().slice(-12); return ms.reduce((a, m) => a * (1 + IDX[k][m] / 100), 1) - 1; };

/* ---------- comparação: e se o dinheiro tivesse ido para o CDI ou só acompanhado a inflação? ---------- */
function fluxos() {
  // do ponto de vista do "investimento": compra entra (+), venda e provento saem (−)
  const f = D.trades.filter(x => (x[1] === 'C' || x[1] === 'V') && x[4]).map(x => [x[0], x[1] === 'C' ? x[4] : -x[4]]);
  D.inc.forEach(x => f.push([x[0], -x[4]]));
  return f.sort((a, b) => a[0].localeCompare(b[0]));
}
function simular(k, fl) {
  const fim = TODAY().slice(0, 7), ult = ultimoMes(k), ms = Object.keys(IDX[k]).sort();
  const med = ms.slice(-3).reduce((a, m) => a + IDX[k][m], 0) / 3;
  const serie = {}; let b = 0, i = 0, est = [];
  for (let m = fl[0][0].slice(0, 7); m <= fim; m = addM(m, 1)) {
    let r = IDX[k][m];
    if (r == null) { r = m === fim ? 0 : med; if (m < fim) est.push(m); }   // mês corrente ainda sem taxa
    r /= 100; const [y, mo] = m.split('-').map(Number), dim = new Date(y, mo, 0).getDate();
    b *= 1 + r;
    while (i < fl.length && fl[i][0].startsWith(m)) { const dd = +fl[i][0].slice(8); b += fl[i][1] * Math.pow(1 + r, (dim - dd) / dim); i++; }
    serie[m] = b;
  }
  return { serie, hoje: b, est, ult };
}
/** taxa interna de retorno anual (XIRR) dos fluxos + valor de hoje */
function tir(fl, valor) {
  const t0 = new Date(fl[0][0]), hoje = new Date(TODAY());
  const cf = fl.map(([d, v]) => [(new Date(d) - t0) / 31557600000, -v]); cf.push([(hoje - t0) / 31557600000, valor]);
  const npv = r => cf.reduce((a, [t, v]) => a + v / Math.pow(1 + r, t), 0);
  let lo = -0.9, hi = 2; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; npv(mid) > 0 ? lo = mid : hi = mid; } return (lo + hi) / 2;
}
function anualizado(k, de) { const ms = Object.keys(IDX[k]).filter(m => m >= de).sort(); const p = ms.reduce((a, m) => a * (1 + IDX[k][m] / 100), 1); return Math.pow(p, 12 / ms.length) - 1; }

function renderComp(tot) {
  const box = $('#cmpStats');
  if (!IDX) { box.innerHTML = '<p class="note">Não encontrei data/indices.json com o CDI e o IPCA. Rode o tools/gerar_cofre.py para baixar.</p>'; return drawCost(tot, null); }
  const fl = fluxos(), cdi = simular('cdi', fl), ipca = simular('ipca', fl);
  const ret = tir(fl, tot.val), de = fl[0][0].slice(0, 7), aC = anualizado('cdi', de), aI = anualizado('ipca', de);
  const dif = tot.val - cdi.hoje;
  $('#cmpSub').textContent = `Se cada compra, venda e provento de ações desde ${mlab(de)} tivesse ido para o CDI, ou só acompanhado a inflação`;
  box.innerHTML = `
    <div class="cmp-row"><span><i class="dot" style="background:var(--in)"></i>Sua carteira hoje</span><b class="num">${brl0(tot.val)}</b><small>${pctA(ret)} ao ano</small></div>
    <div class="cmp-row"><span><i class="dot" style="background:var(--c5)"></i>No CDI</span><b class="num">${brl0(cdi.hoje)}</b><small>${pctA(aC)} ao ano</small></div>
    <div class="cmp-row"><span><i class="dot" style="background:var(--warn)"></i>Só a inflação (IPCA)</span><b class="num">${brl0(ipca.hoje)}</b><small>${pctA(aI)} ao ano</small></div>
    <p class="cmp-verdict ${dif >= 0 ? 'pos' : 'neg'}">${dif >= 0 ? `A carteira está <b class="num">${brl0(dif)}</b> à frente do CDI` : `A carteira está <b class="num">${brl0(-dif)}</b> atrás do CDI`} e <b class="num">${brl0(tot.val - ipca.hoje)}</b> acima da inflação.</p>
    <p class="note">Os proventos contam como dinheiro que saiu nos três casos, então a comparação é justa. Taxas da B3 e do IBGE até ${mlab(cdi.ult)} (CDI) e ${mlab(ipca.ult)} (IPCA)${ipca.est.length ? `; ${ipca.est.map(mlab).join(', ')} do IPCA pela média dos últimos 3 meses` : ''}. Não inclui taxas de corretagem.</p>`;
  drawCost(tot, { cdi: cdi.serie, ipca: ipca.serie });
}
function drawCost(tot, b) {
  const g = css('--line'), acc = css('--accent'), cin = css('--in');
  const cs = D.cost.map(x => x[1]), lab = D.cost.map(x => mlab(x[0]));
  const grad = c => { const { ctx, chartArea: a } = c.chart; if (!a) return acc + '22'; const x = ctx.createLinearGradient(0, a.top, 0, a.bottom); x.addColorStop(0, acc + '40'); x.addColorStop(1, acc + '00'); return x; };
  const ser = k => [...D.cost.map(x => b[k][x[0]] ?? null), b[k][TODAY().slice(0, 7)] ?? null];
  const ds = [{ label: 'Custo investido', data: [...cs, null], borderColor: acc, backgroundColor: grad, fill: true, stepped: true, pointRadius: 0, borderWidth: 2 }];
  if (b) ds.push({ label: 'No CDI', data: ser('cdi'), borderColor: css('--c5'), pointRadius: 0, borderWidth: 2, tension: .25 },
                 { label: 'Só inflação', data: ser('ipca'), borderColor: css('--warn'), pointRadius: 0, borderWidth: 2, borderDash: [4, 3], tension: .25 });
  ds.push({ label: 'Carteira hoje', data: [...cs.map(() => null), tot.val], borderColor: cin, backgroundColor: cin, pointRadius: 6, pointHoverRadius: 7, showLine: false });
  charts.c = new Chart($('#chCost'), { type: 'line', data: { labels: [...lab, 'hoje'], datasets: ds },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: RM ? false : { duration: 1200, easing: 'easeOutQuart' },
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } }, tooltip: { filter: c => c.raw != null, callbacks: { label: c => ' ' + c.dataset.label + ': ' + brl(c.raw) } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 9 } }, y: { grid: { color: g }, border: { display: false }, beginAtZero: true, ticks: { callback: v => 'R$ ' + (v / 1000) + 'k' } } } } });
}

/* ---------- plano para o primeiro milhão ---------- */
const PL_KEY = 'inv-plano';
function lerPlano() { try { return JSON.parse(localStorage.getItem(PL_KEY) || 'null'); } catch { return null; } }
function aporteMedio(meses = 24) {
  const de = janela(meses)[0], L = D.trades.filter(x => x[0].slice(0, 7) >= de && (x[1] === 'C' || x[1] === 'V'));
  const inc = D.inc.filter(x => x[0].slice(0, 7) >= de).reduce((a, x) => a + x[4], 0);
  // compras − vendas − proventos reinvestidos = dinheiro novo que saiu do seu bolso
  return Math.max(0, (L.reduce((a, x) => a + (x[1] === 'C' ? x[4] : -x[4]), 0) - inc) / meses);
}
/** meses até a meta; tudo em reais de hoje (aporte corrigido pela inflação) */
function mesesAte(ini, ap, real, meta, inf, metaHoje) {
  const rm = Math.pow(1 + real, 1 / 12) - 1, im = Math.pow(1 + inf, 1 / 12) - 1; let v = ini;
  for (let n = 0; n <= 720; n++) { const alvo = metaHoje ? meta : meta / Math.pow(1 + im, n); if (v >= alvo) return n; v = v * (1 + rm) + ap; }
  return null;
}
function aporteNec(ini, real, meta, meses, inf, metaHoje) {
  const rm = Math.pow(1 + real, 1 / 12) - 1, f = Math.pow(1 + rm, meses), alvo = metaHoje ? meta : meta / Math.pow(1 + inf, meses / 12);
  const a = (alvo - ini * f) * rm / (f - 1); return Math.max(0, a);
}
const quando = n => { if (n == null) return 'mais de 60 anos'; const a = Math.floor(n / 12), m = n % 12; return (a ? a + (a > 1 ? ' anos' : ' ano') : '') + (a && m ? ' e ' : '') + (m ? m + (m > 1 ? ' meses' : ' mês') : '') || 'já chegou'; };
const curto = n => n == null ? '60+ anos' : (Math.floor(n / 12) ? Math.floor(n / 12) + 'a' : '') + (n % 12 ? ' ' + (n % 12) + 'm' : '') || 'já';
const dataEm = n => { if (n == null) return ''; const m = addM(TODAY().slice(0, 7), n); return MESL[+m.slice(5) - 1].toLowerCase() + ' de ' + m.slice(0, 4); };

let PL = null;
function renderPlano() {
  const { tot } = model();
  if (!IDX) { $('#plBody').hidden = true; $('#plErr').hidden = false; return; }
  $('#plBody').hidden = false; $('#plErr').hidden = true;
  const sug = { ini: Math.round(tot.val / 1000) * 1000, ap: Math.max(500, Math.round(aporteMedio() / 100) * 100), cdi: +(taxa12('cdi') * 100).toFixed(1), inf: +(taxa12('ipca') * 100).toFixed(1), juro: 6, prazo: 15, meta: 1000000, hoje: true };
  if (!PL) { PL = Object.assign({}, sug); try { Object.assign(PL, JSON.parse(localStorage.getItem('inv-plano-form') || '{}')); } catch {} }
  const f = $('#plForm');
  if (!f.dataset.ok) {
    f.dataset.ok = 1; f.addEventListener('submit', e => e.preventDefault());
    f.addEventListener('input', e => { const el = e.target; if (!el.name) return; PL[el.name] = el.type === 'checkbox' ? el.checked : parseFloat(String(el.value).replace(/\./g, '').replace(',', '.')) || 0;
      try { localStorage.setItem('inv-plano-form', JSON.stringify(PL)); } catch {} calcPlano(tot, sug, false); });
    $('#plReset').onclick = () => { PL = Object.assign({}, sug); try { localStorage.removeItem('inv-plano-form'); } catch {} preencher(); calcPlano(tot, sug, true); };
    $('#plSave').onclick = () => { const p = Object.assign({ data: TODAY(), valor: tot.val }, PL); try { localStorage.setItem(PL_KEY, JSON.stringify(p)); } catch {} calcPlano(tot, sug, false); };
    $('#plTrack').addEventListener('click', e => { if (e.target.closest('[data-apagar]')) { try { localStorage.removeItem(PL_KEY); } catch {} calcPlano(tot, sug, false); } });
  }
  const preencher = () => f.querySelectorAll('[name]').forEach(el => { if (el.type === 'checkbox') el.checked = !!PL[el.name]; else el.value = el.dataset.fmt === 'brl' ? num(PL[el.name]) : String(PL[el.name]).replace('.', ','); });
  preencher();
  $('#plHint').innerHTML = `Sugestões tiradas dos seus dados: carteira de hoje, aporte médio dos últimos 24 meses (${brl0(aporteMedio())} por mês), CDI e IPCA dos últimos 12 meses.`;
  calcPlano(tot, sug, true);
}
function calcPlano(tot, sug, anim) {
  const inf = PL.inf / 100, cdiN = PL.cdi / 100, rC = (1 + cdiN) / (1 + inf) - 1, rI = PL.juro / 100;
  const op = [
    { k: 'cdi', nome: 'Pelo CDI', taxa: `${num(PL.cdi, 1)}% ao ano`, real: rC, cor: 'var(--c5)' },
    { k: 'ipca', nome: `IPCA + ${num(PL.juro, 1)}%`, taxa: `${num((1 + inf) * (1 + rI) * 100 - 100, 1)}% ao ano com a inflação de hoje`, real: rI, cor: 'var(--accent)' },
  ];
  op.forEach(o => { o.n = mesesAte(PL.ini, PL.ap, o.real, PL.meta, inf, PL.hoje); o.nec = aporteNec(PL.ini, o.real, PL.meta, PL.prazo * 12, inf, PL.hoje);
    o.nom = o.n == null ? null : (PL.hoje ? PL.meta * Math.pow(1 + inf, o.n / 12) : PL.meta); });
  $('#plCards').innerHTML = op.map((o, i) => `<div class="pl-card reveal" style="--i:${i};--c:${o.cor}">
      <div class="pl-h"><span class="dot" style="background:${o.cor}"></span><b>${o.nome}</b><span class="pill soft">${o.taxa}</span></div>
      <div class="pl-big">${o.n == null ? 'Não chega' : quando(o.n)}</div>
      <div class="pl-sub">${o.n == null ? 'em 60 anos com esse aporte' : 'chega em ' + dataEm(o.n)}</div>
      <ul class="pl-facts">
        <li><span>Rendimento acima da inflação</span><b class="num">${pctA(o.real)} ao ano</b></li>
        ${o.nom ? `<li><span>${PL.hoje ? "Em reais da época (com inflação)" : "Equivale hoje a"}</span><b class="num">${PL.hoje ? brl0(o.nom) : brl0(PL.meta / Math.pow(1 + inf, o.n / 12))}</b></li>` : ''}
        <li><span>Aporte para chegar em ${PL.prazo} anos</span><b class="num">${brl0(o.nec)}/mês</b></li>
      </ul></div>`).join('');
  // gráfico em reais de hoje
  const anos = Math.min(60, Math.max(PL.prazo, ...op.map(o => o.n == null ? 40 : Math.ceil(o.n / 12))) + 1);
  const serie = real => { const rm = Math.pow(1 + real, 1 / 12) - 1; let v = PL.ini; const out = [v]; for (let a = 1; a <= anos; a++) { for (let m = 0; m < 12; m++) v = v * (1 + rm) + PL.ap; out.push(v); } return out; };
  const meta = Array.from({ length: anos + 1 }, (_, a) => PL.hoje ? PL.meta : PL.meta / Math.pow(1 + inf, a));
  const y0 = +TODAY().slice(0, 4), g = css('--line');
  const cfg = { type: 'line', data: { labels: meta.map((_, a) => String(y0 + a)), datasets: [
      ...op.map(o => ({ label: o.nome, data: serie(o.real), borderColor: col(o.cor), backgroundColor: col(o.cor), pointRadius: 0, borderWidth: 2.5, tension: .3 })),
      { label: PL.hoje ? 'Meta' : 'Meta (em reais de hoje)', data: meta, borderColor: css('--muted'), borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: RM || !anim ? false : { duration: 1000, easing: 'easeOutQuart' },
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + brl0(c.raw) } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { grid: { color: g }, border: { display: false }, beginAtZero: true, ticks: { callback: v => v >= 1e6 ? 'R$ ' + num(v / 1e6, 1) + 'mi' : 'R$ ' + (v / 1000) + 'k' } } } } };
  if (charts.pl) { charts.pl.data = cfg.data; charts.pl.update('none'); } else charts.pl = new Chart($('#chPlano'), cfg);
  // sensibilidade do aporte
  const aps = [...new Set([1000, 2000, 3000, 5000, PL.ap].map(v => Math.round(v)))].sort((a, b) => a - b);
  $('#plSens').innerHTML = `<thead><tr><th>Aporte por mês</th>${op.map(o => `<th class="r">${o.nome}</th>`).join('')}</tr></thead><tbody>${aps.map(a => `<tr class="${a === Math.round(PL.ap) ? 'on' : ''}"><td class="num">${brl0(a)}${a === Math.round(PL.ap) ? ' <span class="mini">atual</span>' : ''}</td>${op.map(o => `<td class="r num">${curto(mesesAte(PL.ini, a, o.real, PL.meta, inf, PL.hoje))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  // acompanhamento
  const sp = lerPlano(), tr = $('#plTrack');
  if (!sp) { tr.innerHTML = `<p class="note">Salve o plano para acompanhar, mês a mês, se a carteira está à frente ou atrás do caminho até a meta.</p>`; }
  else {
    // caminho de referência: IPCA + juros do plano, aporte corrigido pela inflação
    const ms = Math.max(0, (new Date(TODAY()) - new Date(sp.data)) / 2629800000);
    const rr = Math.pow(1 + sp.juro / 100, 1 / 12) - 1, im = Math.pow(1 + sp.inf / 100, 1 / 12) - 1;
    let v = sp.valor; for (let i = 0; i < Math.floor(ms); i++) v = v * (1 + rr) + sp.ap; const prev = v * Math.pow(1 + im, ms), d = tot.val - prev;
    tr.innerHTML = `<div class="pl-track"><div><span class="k">Plano salvo em ${fdate(sp.data)}</span><b class="num">${brl0(sp.valor)}</b></div>
      <div><span class="k">Previsto para hoje</span><b class="num">${brl0(prev)}</b></div>
      <div><span class="k">Carteira hoje</span><b class="num">${brl0(tot.val)}</b></div>
      <div><span class="k">${d >= 0 ? 'À frente' : 'Atrás'}</span><b class="num ${d >= 0 ? 'pos' : 'neg'}">${brl0(Math.abs(d))}</b></div></div>
      <p class="note">Usa IPCA + ${num(sp.juro, 1)}% e aporte de ${brl0(sp.ap)} por mês. Quedas da bolsa mexem no valor de um mês para o outro; o que conta é a tendência. <button type="button" class="linkbtn" data-apagar>Apagar plano salvo</button></p>`;
  }
}
