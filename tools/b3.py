"""
Leitura dos relatórios da Área do Investidor B3 (negociação, movimentação, eventos)
e cálculo de posição, preço médio, proventos e resultado realizado.
"""
import collections, datetime as dt, glob, os, warnings

import openpyxl

warnings.filterwarnings("ignore", module="openpyxl")

ALIAS = {"VVAR3": "VIIA3", "VIVT4": "VIVT3"}  # trocas de código
TIPOS_PROVENTO = {"Dividendo": "Dividendo", "Juros Sobre Capital Próprio": "JCP", "Rendimento": "Rendimento"}
EVENTOS_QTD = {"Desdobro", "Bonificação em Ativos", "Incorporação"}


def _d(s):
    if isinstance(s, dt.datetime): return s.date()
    if isinstance(s, dt.date): return s
    return dt.datetime.strptime(str(s).strip(), "%d/%m/%Y").date()


def _n(v):
    if v in (None, "", "-"): return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).replace("R$", "").strip()
    if "," in s: s = s.replace(".", "").replace(",", ".")
    try: return float(s)
    except ValueError: return None


def ticker(c):
    c = str(c).split(" - ")[0].strip()
    if c.endswith("F") and len(c) > 2 and c[-2].isdigit(): c = c[:-1]  # mercado fracionário
    return ALIAS.get(c, c)


def _ler(arquivo):
    ws = openpyxl.load_workbook(arquivo, data_only=True).active
    linhas = [r for r in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in r)]
    if not linhas: return None, []
    cab = [str(c or "").strip() for c in linhas[0]]
    if "Data do Negócio" in cab: tipo = "neg"
    elif "Entrada/Saída" in cab: tipo = "mov"
    elif "Previsão de pagamento" in cab: tipo = "evt"
    else: return None, []
    return tipo, [r for r in linhas[1:] if r[0] not in (None, "")]


def carregar(pasta):
    """Junta todos os .xlsx da pasta. A mesma linha em arquivos diferentes conta uma vez."""
    cont = {"neg": collections.Counter(), "mov": collections.Counter(), "evt": collections.Counter()}
    arquivos = sorted(glob.glob(os.path.join(pasta, "*.xlsx")))
    for a in arquivos:
        if os.path.basename(a).startswith("~$"): continue
        tipo, linhas = _ler(a)
        if not tipo: continue
        c = collections.Counter(tuple(r) for r in linhas)
        for k, n in c.items(): cont[tipo][k] = max(cont[tipo][k], n)
    expand = lambda c: [list(k) for k, n in c.items() for _ in range(n)]
    return expand(cont["neg"]), expand(cont["mov"]), expand(cont["evt"]), len(arquivos)


def calcular(neg, mov, evt, hoje=None):
    hoje = hoje or dt.date.today()
    nomes = {}
    for r in mov:
        if " - " in str(r[3]): nomes.setdefault(ticker(r[3]), str(r[3]).split(" - ", 1)[1].strip())

    # linha do tempo de quantidades: negócios + eventos corporativos
    ev = []
    for r in neg:
        q, v = _n(r[6]) or 0, _n(r[8]) or 0
        ev.append((_d(r[0]), 1, "C" if str(r[1]).startswith("Compra") else "V", ticker(r[5]), q, v, str(r[4])))
    for r in mov:
        nome = str(r[2])
        if nome in EVENTOS_QTD and r[0] == "Credito":
            ev.append((_d(r[1]), 0, "B", ticker(r[3]), _n(r[5]) or 0, 0.0, str(r[4])))
        elif nome == "Leilão de Fração":
            ev.append((_d(r[1]), 2, "V", ticker(r[3]), _n(r[5]) or 0, _n(r[7]) or 0, str(r[4])))
    ev.sort(key=lambda e: (e[0], e[1]))

    pos = collections.defaultdict(lambda: [0.0, 0.0])
    real = collections.defaultdict(float); realano = collections.defaultdict(float)
    custo_mes = []
    if ev:
        i, cur = 0, dt.date(ev[0][0].year, ev[0][0].month, 1)
        fim = dt.date(hoje.year, hoje.month, 1)
        while cur <= fim:
            prox = dt.date(cur.year + (cur.month == 12), cur.month % 12 + 1, 1)
            while i < len(ev) and ev[i][0] < prox:
                d, _, k, t, q, v, _inst = ev[i]; p = pos[t]
                if k in ("C", "B"): p[0] += q; p[1] += v
                else:
                    pm = p[1] / p[0] if p[0] > 1e-9 else 0
                    r_ = v - pm * q; real[t] += r_; realano[d.year] += r_
                    p[1] -= pm * q; p[0] = max(p[0] - q, 0.0)
                    if p[0] < 1e-6: p[1] = 0.0
                i += 1
            custo_mes.append([cur.strftime("%Y-%m"), round(sum(c for q, c in pos.values() if q > 1e-6), 2)])
            cur = prox

    corretora = lambda s: str(s).split(" ")[0].title()
    inc = []
    for r in mov:
        if r[0] == "Credito" and r[2] in TIPOS_PROVENTO and _n(r[7]) is not None:
            inc.append([_d(r[1]).isoformat(), ticker(r[3]), TIPOS_PROVENTO[r[2]], _n(r[5]) or 0, round(_n(r[7]), 2), corretora(r[4])])
    inc.sort(reverse=True)

    futuros, vistos = [], set()
    for r in evt:
        try: d = _d(r[3])
        except Exception: continue
        v = _n(r[8])
        if d > hoje and v:
            k = (d, ticker(r[0]), r[2], v)
            if k in vistos: continue
            vistos.add(k); futuros.append([d.isoformat(), ticker(r[0]), str(r[2]).title(), _n(r[6]) or 0, round(v, 2)])
    futuros.sort()

    tesouro = []
    for r in mov:
        if str(r[3]).startswith("Tesouro") and r[2] in ("Compra", "Venda", "Cobrança de Taxa Semestral"):
            tesouro.append([_d(r[1]).isoformat(), str(r[3]), r[2], _n(r[5]) or 0, _n(r[7]) or 0])

    trades = [[e[0].isoformat(), e[2], e[3], e[4], round(e[5], 2), corretora(e[6])] for e in ev]
    posicoes = [[t, round(q, 4), round(c, 2)] for t, (q, c) in sorted(pos.items()) if q > 1e-3]
    usados = {p[0] for p in posicoes} | {x[1] for x in inc} | {t[2] for t in trades}
    return {
        "positions": posicoes, "names": {t: nomes.get(t, "") for t in usados},
        "inc": inc, "futuros": futuros, "trades": trades, "cost": custo_mes,
        "realized": sorted([[t, round(v, 2)] for t, v in real.items()], key=lambda x: x[1]),
        "realyear": {str(k): round(v, 2) for k, v in realano.items()},
        "tesouro": tesouro, "geradoEm": hoje.isoformat(),
    }
