/*
 * Cofre compartilhado pelos módulos Conta e Investimentos.
 * A senha nunca é guardada. No desbloqueio, derivamos (PBKDF2) a chave AES de cada
 * cofre e guardamos só as chaves nesta aba (sessionStorage), que some ao fechar a aba
 * ou ao clicar em Bloquear. Assim, trocar de módulo não pede a senha de novo.
 */
const Cofre = (() => {
  const ARQ = { conta: 'data/vault.json', inv: 'data/investimentos.json' };
  const SK = 'fin-keys';
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const tob64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const cache = {};

  async function arquivo(nome) {
    if (cache[nome]) return cache[nome];
    const r = await fetch(ARQ[nome], { cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error('sem-arquivo'), { code: 'sem-arquivo', nome });
    return (cache[nome] = await r.json());
  }
  function lerChaves() { try { return JSON.parse(sessionStorage.getItem(SK) || '{}'); } catch { return {}; } }
  function gravarChaves(k) { try { sessionStorage.setItem(SK, JSON.stringify(k)); } catch {} }

  async function derivar(v, senha) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(v.salt), iterations: v.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function abrirCom(v, chave) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(v.iv) }, chave, b64(v.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  const importar = raw => crypto.subtle.importKey('raw', b64(raw), { name: 'AES-GCM' }, false, ['decrypt']);

  return {
    /** true se esta aba já foi desbloqueada */
    aberto: () => Object.keys(lerChaves()).length > 0,

    /** Desbloqueia com a senha: abre o módulo pedido e prepara a chave do outro. */
    async desbloquear(nome, senha) {
      const v = await arquivo(nome);
      const chave = await derivar(v, senha);
      const dados = await abrirCom(v, chave);            // lança erro se a senha estiver errada
      const k = lerChaves();
      k[v.salt] = tob64(await crypto.subtle.exportKey('raw', chave));
      gravarChaves(k);
      // prepara os outros cofres em segundo plano (mesma senha)
      Object.keys(ARQ).filter(n => n !== nome).forEach(async n => {
        try {
          const o = await arquivo(n); const c = await derivar(o, senha); await abrirCom(o, c);
          const kk = lerChaves(); kk[o.salt] = tob64(await crypto.subtle.exportKey('raw', c)); gravarChaves(kk);
        } catch {}
      });
      return dados;
    },

    /** Abre usando a chave já guardada nesta aba; null se não houver. */
    async abrirSalvo(nome) {
      const k = lerChaves(); if (!Object.keys(k).length) return null;
      const v = await arquivo(nome);
      if (!k[v.salt]) return null;
      try { return await abrirCom(v, await importar(k[v.salt])); } catch { return null; }
    },

    bloquear() { try { sessionStorage.removeItem(SK); sessionStorage.removeItem('fin-pw'); } catch {} },

    /** Bloqueia sozinho depois de N minutos sem uso ou com a aba em segundo plano. */
    vigiar() {
      let min = 10; try { const v = parseFloat(localStorage.getItem('fin-bloqueio-min')); if (v > 0) min = v; } catch {}
      const ms = min * 60e3; let timer = null, oculto = 0;
      const app = () => document.getElementById('app');
      const travar = () => {
        const a = app(), b = document.getElementById('relock');
        if (!a || a.hidden || !b) return;
        b.click();
        const card = document.querySelector('.lock-card'); if (!card) return;
        let m = document.getElementById('lockMsg');
        if (!m) { m = document.createElement('p'); m.id = 'lockMsg'; m.className = 'lock-msg'; card.insertBefore(m, card.querySelector('.field')); }
        m.textContent = `Bloqueado depois de ${min} minuto${min === 1 ? '' : 's'} sem uso. Digite a senha para continuar.`;
      };
      const reset = () => { clearTimeout(timer); timer = setTimeout(travar, ms); };
      ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(e => addEventListener(e, reset, { passive: true, capture: true }));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) oculto = Date.now();
        else { if (oculto && Date.now() - oculto >= ms) travar(); else reset(); oculto = 0; }
      });
      // ao bloquear pelo botão, some o aviso de inatividade
      const rb = document.getElementById('relock');
      if (rb) rb.addEventListener('click', e => { if (e.isTrusted) document.getElementById('lockMsg')?.remove(); });
      reset();
    },
  };
})();

// Antes de pintar a página: se a aba já está aberta, troca a tela do cofre por "Abrindo…"
try { if (sessionStorage.getItem('fin-keys')) document.documentElement.classList.add('booting'); } catch {}
addEventListener('DOMContentLoaded', () => Cofre.vigiar());

/*
 * Ocultar valores: troca os valores em reais por "R$ ••••" e esconde a escala dos gráficos.
 * Vale para os dois módulos (fica salvo neste navegador). Cada página escuta o evento
 * "privado" para redesenhar.
 */
const PRIV = () => document.documentElement.classList.contains('privado');
try { if (localStorage.getItem('fin-privado') === '1') document.documentElement.classList.add('privado'); } catch {}
addEventListener('DOMContentLoaded', () => {
  const sync = () => document.querySelectorAll('[data-priv-toggle]').forEach(b => {
    const on = PRIV(); b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Mostrar valores' : 'Ocultar valores'); b.title = on ? 'Mostrar valores' : 'Ocultar valores';
  });
  sync();
  document.querySelectorAll('[data-priv-toggle]').forEach(b => b.addEventListener('click', () => {
    const on = document.documentElement.classList.toggle('privado');
    try { localStorage.setItem('fin-privado', on ? '1' : '0'); } catch {}
    sync(); dispatchEvent(new Event('privado'));
  }));
  // nos gráficos, some a escala de valores (o eixo das categorias continua)
  if (window.Chart) Chart.register({ id: 'privado', beforeUpdate(c) {
    const sc = c.options.scales || {}, horiz = c.options.indexAxis === 'y';
    Object.keys(sc).forEach(k => { const t = sc[k] && sc[k].ticks; if (!t || (horiz ? k !== 'x' : k === 'x')) return;
      if (t.$d === undefined) t.$d = t.display !== false; t.display = PRIV() ? false : t.$d; });
  } });
});
