/* ===================== Orçamento e previsão do mês =====================
 * Usa as funções e dados de app.js (TX, MONTHS, FATS, summary, sel, brl…).
 */
const ORC = { metas: {}, origem: {}, sugestao: {} };
const diasNoMes = m => new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
const mediana = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const ultimoMes = () => MONTHS.filter(hasData).slice(-1)[0];
const dataRef = m => TX.filter(t => t.m === m).reduce((a, t) => t.d > a ? t.d : a, '');
const emAndamento = m => { const r = dataRef(m); return m === ultimoMes() && r && +r.slice(8) < diasNoMes(m) - 1; };
const fdm = d => d.slice(8) + '/' + d.slice(5, 7);
const NAO_ORCA = new Set(['Receitas', 'Rendimentos', 'Estornos', 'Ajustes', 'Transferência própria', 'Repasse']);

/* ---------- metas ---------- */
function prepOrcamento() {
  const meses = MONTHS.filter(m => hasData(m) && !emAndamento(m));
  const porMes = meses.map(m => summary(TX.filter(t => t.m === m), true).cat);
  const cats = new Set(); porMes.forEach(c => Object.keys(c).forEach(k => { if (!NAO_ORCA.has(k)) cats.add(k); }));
  ORC.cats = [...cats];
  ORC.cats.forEach(c => { ORC.sugestao[c] = Math.ceil(mediana(porMes.map(x => Math.max(0, x[c] || 0))) / 10) * 10; });
  let local = {}; try { local = JSON.parse(localStorage.getItem('fin-metas2') || '{}'); } catch {}
  const cofre = (D.metas && D.metas.mensal) || {};
  ORC.cats.forEach(c => {
    if (local[c] != null) { ORC.metas[c] = local[c]; ORC.origem[c] = 'local'; }
    else if (cofre[c] != null) { ORC.metas[c] = cofre[c]; ORC.origem[c] = 'cofre'; }
    else { ORC.metas[c] = ORC.sugestao[c]; ORC.origem[c] = 'sugestao'; }
  });
  // ordem: maiores metas primeiro
  ORC.cats.sort((a, b) => (ORC.metas[b] || 0) - (ORC.metas[a] || 0));
}
function salvarLocal() {
  const o = {}; ORC.cats.forEach(c => { if (ORC.origem[c] === 'local') o[c] = ORC.metas[c]; });
  try { localStorage.setItem('fin-metas2', JSON.stringify(o)); } catch {}
}

/* ---------- previsão ---------- */
function preverMes(m) {
  const dias = diasNoMes(m), ref = dataRef(m), hoje = ref ? +ref.slice(8) : 0;
  const ant = MONTHS.filter(x => hasData(x) && x < m).slice(-4);
  const fora = t => FORA.has(t.c) || t.c === 'Cartão de crédito' || t.c === 'Saques' || t.c === 'Rendimentos';
  // contas e entradas que se repetem: o MESMO valor (±10%) do mesmo nome em pelo menos 3 dos últimos 4 meses
  const g = {};
  TX.filter(t => ant.includes(t.m) && !fora(t)).forEach(t => { const k = (t.v > 0 ? '+' : '-') + t.nome; (g[k] = g[k] || []).push(t); });
  const rec = [];
  Object.values(g).forEach(L => {
    const usados = new Set();
    L.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).forEach(t0 => {
      if (usados.has(t0)) return;
      const alvo = Math.abs(t0.v); if (alvo < 60) return;
      const grupo = L.filter(t => !usados.has(t) && Math.abs(Math.abs(t.v) - alvo) <= alvo * 0.1);
      const porMes = {}; grupo.forEach(t => { if (!porMes[t.m]) porMes[t.m] = t; });
      const ms = Object.keys(porMes); if (ms.length < Math.min(3, ant.length)) return;
      ms.forEach(k => usados.add(porMes[k]));
      const val = mediana(ms.map(k => Math.abs(porMes[k].v))), dia = Math.round(mediana(ms.map(k => +porMes[k].d.slice(8))));
      const sinal = Math.sign(t0.v), nome = t0.nome;
      const feito = TX.find(t => t.m === m && t.nome === nome && Math.sign(t.v) === sinal && Math.abs(Math.abs(t.v) - val) <= val * 0.15);
      rec.push({ nome, c: t0.c, sinal, val, dia, feito: feito ? Math.abs(feito.v) : null, dataFeito: feito?.d, chave: sinal + nome + val });
    });
  });
  // contas fixas marcadas à mão: entram mesmo com valor diferente (vale o do último mês)
  (D.fixos || []).forEach(fx => {
    const L = TX.filter(t => t.v < 0 && fx.nomes.includes(t.nome) && t.m < m);
    const ms = [...new Set(L.map(t => t.m))].sort().slice(-6); if (!ms.length) return;
    const ult = ms[ms.length - 1], val = -L.filter(t => t.m === ult).reduce((a, t) => a + t.v, 0);
    const dia = Math.round(mediana(ms.map(k => +L.filter(t => t.m === k).map(t => t.d).sort()[0].slice(8))));
    const feitos = TX.filter(t => t.m === m && t.v < 0 && fx.nomes.includes(t.nome));
    for (let i = rec.length - 1; i >= 0; i--) if (rec[i].sinal < 0 && fx.nomes.includes(rec[i].nome)) rec.splice(i, 1);
    rec.push({ nome: fx.nome, nomes: fx.nomes, c: L[0].c, sinal: -1, val, dia, fixa: true, feito: feitos.length ? -feitos.reduce((a, t) => a + t.v, 0) : null, dataFeito: feitos[0]?.d });
  });
  rec.sort((a, b) => a.dia - b.dia);
  // fatura do cartão
  const debito = TX.find(t => t.m === m && t.c === 'Cartão de crédito');
  let fat = null;
  if (debito) fat = { val: -debito.v, dia: +debito.d.slice(8), feito: true, data: debito.d };
  else if (FATS.length) {
    const ult = FATS.slice(-3), parc = FATS[FATS.length - 1].proxima || 0;
    const avista = mediana(ult.map(f => f.compras.filter(x => !x[2] && x[4] > 0).reduce((a, x) => a + x[4], 0)));
    const dia = Math.round(mediana(FATS.filter(f => f.venc).map(f => +f.venc.slice(8))));
    fat = { val: parc + avista, parc, avista, dia, feito: false };
  }
  // gastos do dia a dia: o que não se repete, nos últimos 3 meses completos
  const recNeg = rec.filter(r => r.sinal < 0); const ehRec = t => recNeg.some(r => r.fixa ? r.nomes.includes(t.nome) : (r.nome === t.nome && Math.abs(-t.v - r.val) <= r.val * 0.15));
  const base = MONTHS.filter(x => hasData(x) && x < m).slice(-3);
  const varTot = TX.filter(t => base.includes(t.m) && t.v < 0 && !FORA.has(t.c) && t.c !== 'Cartão de crédito' && !ehRec(t)).reduce((a, t) => a - t.v, 0);
  const porDia = base.length ? varTot / base.reduce((a, x) => a + diasNoMes(x), 0) : 0;
  const restam = Math.max(0, dias - hoje);
  // saldo de hoje e projeção dia a dia
  const sd = D.saldo.filter(([d]) => d <= (ref || m + '-01')); const saldo0 = sd.length ? sd[sd.length - 1][1] : 0;
  const pend = rec.filter(r => r.feito == null).map(r => ({ dia: Math.max(r.dia, hoje + 1), v: r.sinal * r.val, atrasado: r.dia <= hoje, ...r }));
  if (fat && !fat.feito) pend.push({ dia: Math.max(fat.dia, hoje + 1), v: -fat.val, nome: 'Fatura do cartão', fatura: true });
  const serie = []; let s = saldo0, min = { v: saldo0, d: hoje };
  for (let d = hoje + 1; d <= dias; d++) {
    s -= porDia; pend.filter(p => p.dia === d).forEach(p => s += p.v);
    serie.push([d, s]); if (s < min.v) min = { v: s, d };
  }
  const entradas = pend.filter(p => p.v > 0).reduce((a, p) => a + p.v, 0), saidas = -pend.filter(p => p.v < 0).reduce((a, p) => a + p.v, 0);
  return { m, dias, hoje, ref, rec, fat, porDia, restam, saldo0, fim: s, min, serie, entradas, saidas, variavel: porDia * restam };
}

/* ---------- tela ---------- */
function renderBudget(still) {
  const cm = ultimoMes(), m = S.month === 'all' ? null : S.month;
  const falha = (onde, e) => { console.error(e); const el = $(onde); if (el) el.innerHTML = `<p class="empty">Não consegui montar esta parte (${esc(e.message || e)}). Recarregue a página; se continuar, me mande um print.</p>`; };
  try { if (!ORC.cats) prepOrcamento(); } catch (e) { falha('#budget', e); return; }
  try { renderPrevisao(m, cm); } catch (e) { falha('#fcList', e); }
  try { renderMetas(m, cm, still); } catch (e) { falha('#budget', e); }
}

function renderPrevisao(m, cm) {
  const P = $('#fcPanel');
  if (m && m !== cm) {
    P.querySelector('.fc-body').hidden = true; $('#fcEmpty').hidden = false;
    $('#fcEmpty').innerHTML = `A previsão vale para o mês atual. <button type="button" class="linkbtn" id="fcGo">Ver ${MES[+cm.slice(5) - 1]}/${cm.slice(2, 4)} →</button>`;
    $('#fcGo').onclick = () => { S.month = cm; render(); };
    $('#fcTitle').textContent = 'Previsão do mês'; $('#fcSub').textContent = ''; $('#fcPill').hidden = true; return;
  }
  P.querySelector('.fc-body').hidden = false; $('#fcEmpty').hidden = true;
  const F = preverMes(cm), nm = MESL[+cm.slice(5) - 1];
  $('#fcTitle').textContent = `Previsão de ${nm.toLowerCase()}`;
  $('#fcSub').textContent = `Com dados até ${F.ref ? fdm(F.ref) : '—'} · contas que se repetem, fatura estimada e gastos do dia a dia`;
  const pill = $('#fcPill'); pill.hidden = false;
  pill.className = 'pill ' + (F.min.v < 0 ? 'out' : F.fim < F.saldo0 ? 'warn' : 'in');
  pill.textContent = F.min.v < 0 ? `Fica negativo por volta de ${String(F.min.d).padStart(2, '0')}/${cm.slice(5)}` : F.fim < F.saldo0 ? 'Saldo cai até o fim do mês' : 'Fecha no azul';
  $('#fcEnd').textContent = `${F.dias}/${cm.slice(5)}`;
  const el = $('#fcSaldo'); el.className = 'v num ' + (F.fim >= 0 ? 'pos' : 'neg'); countUp(el, S.prev.fc ?? 0, F.fim); S.prev.fc = F.fim;
  $('#fcNow').innerHTML = `Saldo em ${F.ref ? fdm(F.ref) : '—'}: <b class="num">${brl(F.saldo0)}</b> · ${F.restam} dias pela frente`;
  const row = (dia, nome, v, st, cls = '', sub = '') => `<li class="${cls}"><span class="d num">${dia}</span><span class="n"><b>${esc(nome)}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="st">${st}</span><span class="v num ${v > 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : '−'}${brl(Math.abs(v)).replace('-', '')}</span></li>`;
  const chip = (t, k) => `<span class="mini ${k}">${t}</span>`;
  const ent = F.rec.filter(r => r.sinal > 0), sai = F.rec.filter(r => r.sinal < 0);
  const lin = r => r.feito != null
    ? row(fdm(r.dataFeito), r.nome, r.sinal * r.feito, chip(r.sinal > 0 ? '✓ recebido' : '✓ pago', 'ok'), 'done')
    : row(String(r.dia).padStart(2, '0') + '/' + cm.slice(5), r.nome, r.sinal * r.val, r.dia <= F.hoje ? chip('ainda não apareceu', 'est') : chip(r.fixa ? 'conta fixa' : 'previsto', r.fixa ? 'intl' : ''), '', r.fixa ? `valor do último mês · costuma ser por volta do dia ${r.dia}` : `costuma ser por volta do dia ${r.dia}`);
  let h = '';
  if (ent.length) h += `<li class="grp">Entradas que se repetem</li>` + ent.map(lin).join('');
  if (sai.length) h += `<li class="grp">Contas que se repetem</li>` + sai.map(lin).join('');
  if (F.fat) h += `<li class="grp">Cartão</li>` + (F.fat.feito
    ? row(fdm(F.fat.data), 'Fatura do cartão', -F.fat.val, chip('✓ paga', 'ok'), 'done')
    : row(String(F.fat.dia).padStart(2, '0') + '/' + cm.slice(5), 'Fatura do cartão (estimada)', -F.fat.val, chip('estimativa', 'intl'), '', `${brl0(F.fat.parc)} em parcelas já lançadas + ~${brl0(F.fat.avista)} de compras à vista (mediana dos últimos 3 meses)`));
  h += `<li class="grp">Dia a dia</li>` + row(`${String(F.hoje + 1).padStart(2, '0')}–${F.dias}`, 'Gastos variáveis', -F.variavel, chip('média', ''), '', `${brl(F.porDia)} por dia · mercado, lanches, saques, Pix e o que não se repete`);
  $('#fcList').innerHTML = `<ul class="fx fc">${h}</ul>
    <div class="fc-tot"><span>Saldo de hoje</span><b class="num">${brl(F.saldo0)}</b></div>
    <div class="fc-tot"><span>+ Entradas previstas</span><b class="num pos">${brl(F.entradas)}</b></div>
    <div class="fc-tot"><span>− Contas e fatura previstas</span><b class="num neg">${brl(F.saidas)}</b></div>
    <div class="fc-tot"><span>− Dia a dia</span><b class="num neg">${brl(F.variavel)}</b></div>
    <div class="fc-tot big"><span>= Saldo previsto em ${F.dias}/${cm.slice(5)}</span><b class="num ${F.fim >= 0 ? 'pos' : 'neg'}">${brl(F.fim)}</b></div>`;
  $('#fcNote').textContent = 'É uma estimativa feita com o seu histórico: valores que se repetem usam a mediana dos últimos 4 meses, e o dia a dia usa a média diária dos últimos 3 meses.';
  // gráfico: saldo real do mês + projeção
  if (charts.fc) charts.fc.destroy();
  const real = D.saldo.filter(([d]) => d.startsWith(cm)).map(([d, v]) => [+d.slice(8), v]);
  const labels = Array.from({ length: F.dias }, (_, i) => i + 1);
  const mapR = Object.fromEntries(real), mapP = Object.fromEntries(F.serie);
  if (real.length) mapP[real[real.length - 1][0]] = real[real.length - 1][1]; else mapP[F.hoje || 1] = F.saldo0;
  const acc = css('--accent'), cout = css('--out'), grid = css('--line');
  charts.fc = new Chart($('#chFc'), { type: 'line', data: { labels, datasets: [
    { label: 'Saldo real', data: labels.map(d => mapR[d] ?? null), borderColor: acc, backgroundColor: acc, pointRadius: 3, borderWidth: 2.5, spanGaps: true, tension: .25 },
    { label: 'Previsão', data: labels.map(d => mapP[d] ?? null), borderColor: F.min.v < 0 ? cout : acc, borderDash: [6, 5], pointRadius: 0, borderWidth: 2, spanGaps: true, tension: .2,
      segment: { borderColor: c => (c.p1.parsed.y < 0 ? cout : undefined) } }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: RM ? false : { duration: 900 },
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } }, tooltip: { filter: c => c.raw != null, callbacks: { title: it => `${String(it[0].label).padStart(2, '0')}/${cm.slice(5)}`, label: c => ' ' + c.dataset.label + ': ' + brl(c.raw) } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { grid: { color: grid }, border: { display: false }, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } } } } });
}

function renderMetas(m, cm, still) {
  $('#budget').classList.toggle('still', !!still);
  const mult = m ? 1 : MONTHS.filter(hasData).length;
  const s = summary(m ? TX.filter(t => t.m === m) : TX, true);
  const andamento = m && emAndamento(m), ref = m ? dataRef(m) : '', frac = andamento ? (+ref.slice(8)) / diasNoMes(m) : 1;
  const cats = ORC.cats.concat(Object.keys(s.cat).filter(c => !NAO_ORCA.has(c) && !ORC.cats.includes(c) && s.cat[c] > 0)).filter(c => (ORC.metas[c] || 0) > 0 || (s.cat[c] || 0) > 0);
  let tB = 0, tS = 0, est = 0, aten = 0;
  const rows = cats.map((c, i) => {
    const meta = (ORC.metas[c] ?? 0) * mult, gasto = Math.max(0, s.cat[c] || 0), p = meta ? gasto / meta : (gasto ? 2 : 0);
    tB += meta; tS += gasto;
    let st, k;
    if (gasto > meta && meta > 0) { st = `estourou ${brl0(gasto - meta)}`; k = 'out'; est++; }
    else if (!meta && gasto) { st = 'sem meta'; k = 'warn'; }
    else if (andamento && gasto > meta * frac * 1.1 && gasto > 30) { st = 'acima do ritmo'; k = 'warn'; aten++; }
    else if (!andamento && p > .9) { st = 'no limite'; k = 'warn'; }
    else { st = andamento ? 'no ritmo' : 'dentro'; k = 'in'; }
    const col = k === 'out' ? 'var(--out)' : k === 'warn' ? 'var(--warn)' : 'var(--in)';
    const orig = ORC.origem[c] === 'local' ? '<span class="mini">editada</span>' : ORC.origem[c] === 'cofre' ? '<span class="mini ok">do cofre</span>' : '';
    return `<div class="b-row${k === 'out' ? ' over' : ''}" style="--i:${i}">
      <div class="nm"><i class="dot" style="background:${ccol(c)}"></i><span>${esc(c)}</span> ${orig}</div>
      <div class="b-bar"><div class="track">${andamento && meta ? `<b class="pace" style="left:${Math.min(frac, 1) * 100}%" title="Ritmo esperado até ${fdm(ref)}"></b>` : ''}<i style="--i:${i};width:${Math.min(p, 1) * 100}%;background:${col}"></i></div>
        <small><span class="num">${brl(gasto)}</span> de <span class="num">${brl0(meta)}</span> · <span class="pill ${k}">${st}</span>${meta > gasto ? ` · restam <span class="num">${brl0(meta - gasto)}</span>` : ''}</small></div>
      <input class="input" data-c="${esc(c)}" type="number" min="0" step="10" value="${ORC.metas[c] ?? 0}" aria-label="Meta mensal de ${esc(c)}" title="Sugestão: ${brl0(ORC.sugestao[c] || 0)}"></div>`;
  });
  $('#bSub').textContent = m ? `${label(m)}${andamento ? ` · dados até ${fdm(ref)} (${Math.round(frac * 100)}% do mês)` : ''} · com as compras do cartão nas categorias` : `Todo o período · metas × ${mult} meses`;
  $('#bTotal').textContent = `${brl0(tS)} de ${brl0(tB)}`; $('#bTotal').className = 'pill ' + (tS > tB ? 'out' : 'in');
  $('#bKpis').innerHTML = [
    ['Orçado', brl0(tB), ''], ['Gasto', brl0(tS), tS > tB ? 'neg' : ''], ['Disponível', brl0(Math.max(0, tB - tS)), tB - tS >= 0 ? 'pos' : 'neg'],
    ['Estouradas', `${est}`, est ? 'neg' : '', andamento ? `${aten} acima do ritmo` : `de ${cats.length} categorias`],
  ].map(([l, v, c, sub]) => `<div class="txt-tile"><div class="lbl">${l}</div><div class="v num ${c}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`).join('');
  $('#budget').innerHTML = rows.join('');
  $('#budget').querySelectorAll('input').forEach(inp => inp.onchange = () => {
    const c = inp.dataset.c; ORC.metas[c] = Math.max(0, +inp.value || 0); ORC.origem[c] = 'local'; salvarLocal(); renderMetas(m, cm, true);
  });
  const editadas = ORC.cats.filter(c => ORC.origem[c] === 'local').length;
  $('#bFoot').innerHTML = `<p class="note">As metas começam pela <b>mediana</b> do que você gastou por mês em cada categoria. ${editadas ? `${editadas} editada${editadas > 1 ? 's' : ''} neste navegador.` : ''}
    Para as metas valerem também no celular, baixe o arquivo e rode o gerador do cofre: ele pega o <code>metas.json</code> sozinho da pasta Downloads.</p>
    <div class="b-btns"><button type="button" class="btn-sec" id="bDown">Baixar metas.json</button><button type="button" class="btn-sec ghost" id="bReset">Voltar às sugestões</button></div>`;
  $('#bDown').onclick = () => {
    const o = { _gerado: new Date().toISOString().slice(0, 10), mensal: Object.fromEntries(ORC.cats.map(c => [c, ORC.metas[c] ?? 0])) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' })); a.download = 'metas.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  $('#bReset').onclick = () => { try { localStorage.removeItem('fin-metas2'); } catch {} ORC.cats = null; prepOrcamento(); renderMetas(m, cm); };
}
