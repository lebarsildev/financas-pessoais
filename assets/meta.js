/*
 * Conta: liga a meta dos investimentos ao mês a mês e acompanha a reserva de emergência.
 * Lê o cofre de investimentos já aberto nesta aba (mesma senha) para saber o valor da carteira,
 * o plano salvo (aba Investimentos → Meta 1 milhão) e o que foi aplicado em cada mês.
 */
let INV = null;
async function carregarInv() {
  // a chave do outro cofre é preparada em segundo plano logo depois do desbloqueio
  for (const espera of [0, 1500, 4000, 8000]) {
    await new Promise(r => setTimeout(r, espera));
    try { INV = await Cofre.abrirSalvo('inv'); } catch { INV = null; }
    if (INV) break;
  }
  if (INV && D) render();
}
const mesMais = (ym, k) => { let [y, m] = ym.split('-').map(Number); m += k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + String(m).padStart(2, '0'); };
const pct1 = v => (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

function carteiraHoje() {
  let Q = {}; try { Q = JSON.parse(localStorage.getItem('inv-quotes') || '{}'); } catch {}
  let val = 0;
  INV.positions.forEach(([t, q, c]) => {
    const cs = []; if (Q[t]) cs.push([Q[t][1], Q[t][0]]); if (INV.quotes && INV.quotes[t]) cs.push([INV.quotes[t][1], INV.quotes[t][0]]);
    cs.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    val += (cs[0] ? cs[0][1] : c / q) * q;
  });
  return val;
}
/** por mês: quanto foi aplicado em ações (compras − vendas) e quanto entrou de proventos */
function movInv() {
  const m = {};
  const g = k => m[k] || (m[k] = { ap: 0, prov: 0 });
  INV.trades.forEach(x => { if (x[1] === 'C') g(x[0].slice(0, 7)).ap += x[4]; else if (x[1] === 'V') g(x[0].slice(0, 7)).ap -= x[4]; });
  INV.inc.forEach(x => { g(x[0].slice(0, 7)).prov += x[4]; });
  return m;
}
function planoMeta() {
  let p = null; try { p = JSON.parse(localStorage.getItem('inv-plano') || 'null'); } catch {}
  p = p || INV.plano || null;
  if (p && p.meta > 0) return { meta: p.meta, ap: p.ap || 0, juro: p.juro ?? 6, salvo: true };
  // sem plano salvo: mesma sugestão da aba Meta 1 milhão (dinheiro novo dos últimos 24 meses)
  const mv = movInv(), fim = D.geradoEm.slice(0, 7); let novo = 0;
  for (let i = 1; i <= 24; i++) { const x = mv[mesMais(fim, -i)]; if (x) novo += x.ap - x.prov; }
  return { meta: 1e6, ap: Math.max(500, Math.round(Math.max(0, novo / 24) / 100) * 100), juro: 6, salvo: false };
}
/** meses (com fração) até a meta, em reais de hoje, com rendimento real `juro`% ao ano */
function mesesMeta(ini, ap, juro, meta) {
  const r = Math.pow(1 + juro / 100, 1 / 12) - 1; let v = ini;
  for (let n = 0; n < 900; n++) { if (v >= meta) return n; const nx = v * (1 + r) + ap; if (nx >= meta) return n + (meta - v) / (nx - v); v = nx; }
  return null;
}
const emAnos = n => { if (n == null) return 'mais de 75 anos'; const a = Math.floor(n / 12), m = Math.round(n % 12); return (a ? a + (a > 1 ? ' anos' : ' ano') : '') + (a && m ? ' e ' : '') + (m || !a ? m + (m === 1 ? ' mês' : ' meses') : ''); };
const quandoMeta = n => { if (n == null) return '—'; const k = mesMais(D.geradoEm.slice(0, 7), Math.ceil(n)); return MES[+k.slice(5) - 1] + '/' + k.slice(0, 4); };

function dadosMeta() {
  const P = planoMeta(), val = carteiraHoje(), mv = movInv(), fim = D.geradoEm.slice(0, 7);
  let ap12 = 0, prov12 = 0; for (let i = 1; i <= 12; i++) { const x = mv[mesMais(fim, -i)]; if (x) { ap12 += x.ap; prov12 += x.prov; } }
  const novo = Math.max(0, ap12 - prov12) / 12;                    // dinheiro novo por mês
  const nPlano = mesesMeta(val, P.ap, P.juro, P.meta), nReal = mesesMeta(val, novo, P.juro, P.meta);
  const nPula = mesesMeta(Math.max(0, val - P.ap), P.ap, P.juro, P.meta);   // custo de um mês sem aportar
  return { P, val, mv, ap12, prov12, novo, nPlano, nReal, atraso: nPula != null && nPlano != null ? (nPula - nPlano) * 30 : null };
}

/* ---------- Visão geral: cartão da meta ---------- */
function renderMetaCard() {
  const el = $('#metaCard'); if (!el) return;
  if (!INV || !INV.positions || !INV.positions.length) { el.hidden = true; return; }
  let M; try { M = dadosMeta(); } catch (e) { console.error(e); el.hidden = true; return; }
  const { P, val } = M, f = Math.min(1, val / P.meta);
  el.hidden = false;
  el.innerHTML = `<div class="mc-top"><div><div class="eyebrow">Meta dos investimentos</div>
      <div class="mc-v"><b class="num">${brl0(val)}</b> de <span class="num">${brl0(P.meta)}</span> <span class="pill in">${pct1(f)} do caminho</span></div></div>
      <a class="linkbtn" href="investimentos.html">Ver o plano →</a></div>
    <div class="mc-bar" role="img" aria-label="${pct1(f)} da meta"><i style="width:${f * 100}%"></i></div>
    <div class="mc-facts">
      <span>No plano${P.salvo ? '' : ' sugerido'} (<b class="num">${brl0(P.ap)}</b>/mês, IPCA + ${String(P.juro).replace('.', ',')}%): chega em <b>${quandoMeta(M.nPlano)}</b></span>
      <span>No ritmo dos últimos 12 meses (<b class="num">${brl0(M.novo)}</b>/mês de dinheiro novo): <b class="${M.nReal == null || M.nReal > M.nPlano + 6 ? 'neg' : ''}">${M.nReal == null ? 'não chega' : quandoMeta(M.nReal)}</b>${M.nReal != null && M.nPlano != null && M.nReal > M.nPlano + 6 ? `, ${emAnos(M.nReal - M.nPlano)} depois` : ''}</span>
    </div>`;
}

/* ---------- Orçamento: sobra do mês → aporte ---------- */
function renderAporte(m, cm) {
  const el = $('#apBody'), pn = $('#apPanel'); if (!el) return;
  if (!INV || !INV.positions || !INV.positions.length) { pn.hidden = true; return; }
  pn.hidden = false;
  const M = dadosMeta(), { P, mv } = M, ref = m || cm, and = emAndamento(ref);
  const s = summary(TX.filter(t => t.m === ref)), feito = (mv[ref] || { ap: 0 }).ap, falta = Math.max(0, P.ap - feito);
  $('#apSub').textContent = `${MESL[+ref.slice(5) - 1]} ${ref.slice(0, 4)}${and ? ' · mês em andamento' : ''} · plano de ${brl0(P.ap)} por mês${P.salvo ? '' : ' (sugestão; salve o seu em Investimentos)'}`;
  let msg;
  if (feito >= P.ap && P.ap > 0) msg = ['in', `Aporte do mês feito: ${brl0(feito)} aplicados.`];
  else if (s.net >= falta && falta > 0) msg = ['in', `${and ? 'Até agora sobram' : 'Sobraram'} ${brl0(s.net)}: dá para aportar ${feito > 0 ? 'os ' + brl0(falta) + ' que faltam' : 'os ' + brl0(P.ap) + ' do plano'} e ainda ficam ${brl0(s.net - falta)}.`];
  else if (s.net > 0) msg = ['warn', `${and ? 'Até agora sobram' : 'Sobraram'} ${brl0(s.net)}: cobre ${Math.round(s.net / (falta || 1) * 100)}% do aporte do plano.`];
  else msg = ['out', `${and ? 'Até agora o mês está' : 'O mês fechou'} ${brl0(-s.net)} no vermelho: não houve sobra para aportar.`];
  const ult = MONTHS.filter(x => hasData(x) && x <= ref).slice(-6);
  const linhas = ult.map(x => { const r = summary(TX.filter(t => t.m === x)), a = (mv[x] || { ap: 0 }).ap; return { x, net: r.net, a }; });
  const mx = Math.max(P.ap, ...linhas.map(l => Math.max(Math.abs(l.net), Math.abs(l.a))), 1);
  const semAporte = linhas.filter(l => l.a <= 0).length;
  el.innerHTML = `<div class="ap-msg ${msg[0]}"><span class="pill ${msg[0]}">${msg[0] === 'in' ? '✓' : '!'}</span><span>${msg[1]}</span></div>
    <div class="txsum b-kpis">${[
      [and ? 'Sobra até agora' : 'Sobra do mês', brl0(s.net), s.net >= 0 ? 'pos' : 'neg', ''],
      ['Aplicado no mês', brl0(feito), '', ''], ['Aporte do plano', brl0(P.ap), '', ''],
      ['Um mês sem aportar', M.atraso == null ? '—' : '+' + Math.max(1, Math.round(M.atraso)) + ' dias', '', 'de atraso na meta'],
    ].map(([l, v, c, sub]) => `<div class="txt-tile"><div class="lbl">${l}</div><div class="v num ${c}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`).join('')}</div>
    <table class="ap-tab"><thead><tr><th>Mês</th><th>Sobrou na conta</th><th>Aplicou em ações</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td>${MES[+l.x.slice(5) - 1]}/${l.x.slice(2, 4)}</td>
        <td><span class="ap-bar ${l.net >= 0 ? 'pos' : 'neg'}"><i style="width:${Math.abs(l.net) / mx * 100}%"></i></span><b class="num ${l.net >= 0 ? '' : 'neg'}">${brl0(l.net)}</b></td>
        <td><span class="ap-bar inv"><i style="width:${Math.max(0, l.a) / mx * 100}%"></i></span><b class="num">${brl0(l.a)}</b></td></tr>`).join('')}
    </tbody></table>
    <p class="note">${semAporte ? `Em ${semAporte} dos últimos ${linhas.length} meses não houve compra de ações. ` : ''}Em 12 meses você aplicou <b class="num">${brl0(M.ap12)}</b> e recebeu <b class="num">${brl0(M.prov12)}</b> em proventos${M.ap12 <= M.prov12 ? ': não entrou dinheiro novo, só parte dos proventos foi reinvestida' : ''}.
      "Sobra" é o que entrou menos o que saiu, sem contar transferências entre as suas contas. "Aplicou" vem dos relatórios da B3 (compras menos vendas).</p>`;
}

/* ---------- Orçamento: reserva de emergência ---------- */
const RES_KEY = 'fin-reserva';
function lerReserva() { let r = null; try { r = JSON.parse(localStorage.getItem(RES_KEY) || 'null'); } catch {} return r || (D.metas && D.metas.reserva) || { valor: null, meses: 6 }; }
function renderReserva() {
  const el = $('#resBody'); if (!el) return;
  const R = lerReserva(), fech = MONTHS.filter(m => hasData(m) && !emAndamento(m)).slice(-6);
  const outs = fech.map(m => summary(TX.filter(t => t.m === m))), gasto = mediana(outs.map(o => o.out)), sobra = outs.reduce((a, o) => a + o.net, 0) / (outs.length || 1);
  const alvo = Math.ceil(gasto * R.meses / 100) * 100, tem = R.valor, f = tem == null ? 0 : Math.min(1, tem / (alvo || 1)), falta = Math.max(0, alvo - (tem || 0));
  $('#resSub').textContent = `${R.meses} meses de gastos · seu gasto típico é ${brl0(gasto)} por mês (mediana dos últimos ${fech.length} meses fechados)`;
  let frase;
  if (tem == null) frase = 'Informe quanto você tem guardado hoje (cofrinho, poupança, CDB com resgate no dia) para ver quanto falta.';
  else if (falta <= 0) frase = `Reserva completa: cobre ${(tem / (gasto || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses de gastos. A sobra do mês pode ir toda para a meta.`;
  else if (sobra > 0) frase = `Cobre ${(tem / (gasto || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses. Faltam ${brl0(falta)}; guardando a sobra média dos últimos meses (${brl0(sobra)}), completa em cerca de ${emAnos(falta / sobra)}.`;
  else frase = `Cobre ${(tem / (gasto || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses. Faltam ${brl0(falta)}, mas nos últimos ${fech.length} meses a conta fechou em média ${brl0(-sobra)} no vermelho: antes de reservar ou aportar, o mês precisa fechar no azul.`;
  el.innerHTML = `<div class="res-top">
      <label class="res-in">Guardado hoje<span class="in-wrap"><i>R$</i><input class="input" id="resValor" inputmode="numeric" placeholder="0" value="${tem == null ? '' : Math.round(tem).toLocaleString('pt-BR')}"></span></label>
      <label class="res-in">Quero cobrir<select class="input" id="resMeses">${[3, 6, 9, 12].map(n => `<option value="${n}" ${n === R.meses ? 'selected' : ''}>${n} meses</option>`).join('')}</select></label>
      <div class="res-alvo"><span class="k">Reserva ideal</span><b class="num">${brl0(alvo)}</b></div>
    </div>
    <div class="mc-bar res ${falta <= 0 && tem != null ? 'ok' : ''}" role="img" aria-label="${Math.round(f * 100)}% da reserva"><i style="width:${f * 100}%"></i></div>
    <p class="res-frase">${frase}</p>
    <p class="note">O valor fica neste navegador${R.data ? ` (informado em ${R.data.split('-').reverse().join('/')})` : ''}. O botão "Baixar metas.json", mais abaixo, leva junto para o cofre. O extrato não mostra o saldo do cofrinho, por isso é você quem informa.</p>`;
  const salvar = () => {
    const txt = $('#resValor').value.replace(/\./g, '').replace(',', '.').trim(), v = txt === '' ? null : Math.max(0, parseFloat(txt) || 0);
    try { localStorage.setItem(RES_KEY, JSON.stringify({ valor: v, meses: +$('#resMeses').value, data: new Date().toISOString().slice(0, 10) })); } catch {}
    renderReserva();
  };
  $('#resValor').onchange = salvar; $('#resMeses').onchange = salvar;
}
