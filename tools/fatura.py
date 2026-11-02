"""
Leitura das faturas do cartão (PDF convertido para .xlsx).

O texto costuma chegar bagunçado: palavras quebradas ("CA SA DO A LEM A O"), duas
colunas misturadas na mesma linha e valores na linha de baixo. Por isso a leitura
trabalha sobre o texto sem espaços e confere o resultado com os totais impressos
na própria fatura ("Lançamentos no cartão" / "Total dos lançamentos atuais").
"""
import collections, datetime as dt, re, unicodedata, warnings

import openpyxl

warnings.filterwarnings("ignore", module="openpyxl")

VALOR = r"-?\d{1,3}(?:\.\d{3})*,\d{2}"
ITEM = re.compile(rf"^(\d{{2}}/\d{{2}})(.+?)(\d{{2}}/\d{{2}})?({VALOR})")
CATS_CARTAO = ["supermercado", "restaurante", "transporte", "vestuário", "serviços", "saúde",
               "lazer", "outros", "educação", "viagem", "retail", "hospedagem", "farmácia"]
CABECALHOS = [r"^DATAESTABELECIMENTOVALOREMR\$", r"^DATAESTABELECIMENTOUS\$R\$", r"^DATAVALOREMR\$"]
CIDADES = re.compile(r"(DUQUEDE\w*|DUQUEDECAX\w*|RIODEJA\w*|RIODE$|RIOD$|RIO$|SAOPAU\w*|SaoPaulo\w*|SAOPAULO\w*|OSASCO\w*|sasco$|"
                     r"SANTACRUZ\w*|TIJUCAS|LINR$|BRS?$|ESR$|R$)", re.I)
MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7, "ago": 8,
         "set": 9, "out": 10, "nov": 11, "dez": 12}


def num(s):
    return float(str(s).replace(".", "").replace(",", "."))


def sem_espaco(s):
    return re.sub(r"\s+", "", str(s))


def linhas(arquivo):
    ws = openpyxl.load_workbook(arquivo, data_only=True).active
    out = []
    for r in ws.iter_rows(values_only=True):
        for c in r:
            if c in (None, ""): continue
            if isinstance(c, (int, float)):
                c = f"{c:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            out.append(str(c))
    return out


def _so_valor(s):
    m = re.fullmatch(VALOR, sem_espaco(s))
    return num(m.group(0)) if m else None


def _categoria(txt):
    t = txt.lower()
    melhor = None
    for c in CATS_CARTAO:
        i = t.find(c)
        if i >= 0 and (melhor is None or i < melhor[0]): melhor = (i, c)
    return melhor


def chave(desc):
    return re.sub(r"[^A-Z0-9]", "", desc.upper())[:12]


def _bonito(desc, quebrado):
    d = desc.strip(" *-'")
    if quebrado or " " not in d:
        for _ in range(2): d = CIDADES.sub("", d).strip(" *-'")
    if quebrado:  # recoloca espaços onde dá: antes de "*" e entre minúscula→maiúscula
        d = re.sub(r"\*", "* ", d)
        d = re.sub(r"([a-z])([A-Z])", r"\1 \2", d)
    return re.sub(r"\s+", " ", d).strip()


def ler(arquivo):
    L = linhas(arquivo)
    texto = sem_espaco(" ".join(L))
    tokens = " ".join(L).split()
    quebrado = sum(len(t) <= 2 for t in tokens) / max(len(tokens), 1) > 0.3

    def total(rotulo):
        m = re.search(re.escape(sem_espaco(rotulo)) + r"(?:emR\$)?(" + VALOR + ")", texto, re.I)
        return num(m.group(1)) if m else None

    tot_atual = total("Total dos lançamentos atuais")
    tot_inter = total("Total lançamentos inter.") or 0.0
    iof = total("Repasse de IOF") or 0.0
    prox = total("Próxima fatura"); demais = total("Demais faturas")
    pag = re.search(r"PAGAMENTO\w*?(" + VALOR + ")", texto)

    itens = []
    for i, ln in enumerate(L):
        s = sem_espaco(ln)
        for h in CABECALHOS: s = re.sub(h, "", s)
        if "US$" in s and not ITEM.match(s): continue
        m = ITEM.match(s)
        valor = None; resto = ""
        if m:
            data, desc, parc, v = m.groups(); valor = num(v); resto = s[m.end():]
        else:
            m2 = re.match(r"^(\d{2}/\d{2})(.+)$", s)
            if not m2 or i + 1 >= len(L): continue
            v = _so_valor(L[i + 1])
            if v is None: continue
            data, desc, parc, valor = m2.group(1), m2.group(2), None, v
        if "PAGAMENTO" in desc.upper(): continue
        cat_linha = None
        if not quebrado:  # arquivo limpo: aproveita a descrição com os espaços originais
            mo = re.match(rf"^\s*\d{{2}}/\d{{2}}\s+(.+?)(?:\s+\d{{2}}/\d{{2}})?(?:\s+{VALOR})?\s*$", ln)
            if mo:
                original = mo.group(1)
                c = _categoria(original)
                if c: cat_linha = c[1]
                desc = original[:c[0]] if c else original
        # categoria: na mesma linha (dentro da descrição) ou no começo da linha seguinte
        cat = _categoria(desc)
        if cat_linha:
            cat = cat_linha
        elif cat:
            desc, cat = desc[:cat[0]], cat[1]
        else:
            prox_ln = sem_espaco(L[i + 1]) if i + 1 < len(L) else ""
            c2 = _categoria(prox_ln[:14])
            cat = c2[1] if c2 and c2[0] == 0 else "outros"
        itens.append({"data": data, "desc": _bonito(desc, quebrado), "chave": chave(desc),
                      "parcela": parc, "valor": valor, "cat": cat})

    # internacional: primeiro item depois do cabeçalho "US$ R$"
    inter = []
    k = texto.find("US$R$")
    if k >= 0 and tot_inter:
        m = re.search(rf"(\d{{2}}/\d{{2}})([A-Z][A-Z0-9\*\.]+?)({VALOR})", texto[k:])
        if m:
            inter.append({"data": m.group(1), "desc": _bonito(m.group(2), True), "chave": chave(m.group(2)), "parcela": None,
                          "valor": round(tot_inter - iof, 2), "cat": "internacional", "intl": True})
            dol = re.search(r"DólardeConversãoR\$(" + VALOR + ")", texto)
            if dol: inter[-1]["cambio"] = num(dol.group(1))
        if iof: inter.append({"data": inter[0]["data"] if inter else "", "desc": "IOF sobre compra internacional",
                              "chave": "IOF", "parcela": None, "valor": iof, "cat": "taxas", "intl": True})
    # remove itens internacionais que caíram na lista nacional
    chaves_int = {x["chave"] for x in inter}
    itens = [x for x in itens if x["chave"] not in chaves_int]

    # parcelas futuras: mesma compra com parcela seguinte (k+1/N) é da próxima fatura
    vistos = collections.defaultdict(set)
    for x in itens:
        if x["parcela"]:
            a, n = map(int, x["parcela"].split("/")); vistos[(x["chave"], n)].add(a)
    atuais, futuras = [], []
    for x in itens:
        if x["parcela"]:
            a, n = map(int, x["parcela"].split("/"))
            if a - 1 in vistos[(x["chave"], n)]:
                futuras.append(x); continue
        atuais.append(x)

    soma = round(sum(x["valor"] for x in atuais) + sum(x["valor"] for x in inter), 2)
    return {"itens": atuais + inter, "futuras": futuras, "total": tot_atual, "soma": soma,
            "confere": tot_atual is not None and abs(soma - tot_atual) < 0.02,
            "proxima": prox, "demais": demais, "pagamento_anterior": num(pag.group(1)) if pag else None}


def mes_do_nome(nome):
    n = unicodedata.normalize("NFKD", nome.lower())
    ano = re.search(r"20\d{2}", n)
    for k, v in MESES.items():
        if re.search(k, n): return (int(ano.group(0)) if ano else None, v)
    return (int(ano.group(0)) if ano else None, None)


def anexar_ano(itens, ano, mes):
    for x in itens:
        if not x.get("data"): continue
        d, m = map(int, x["data"].split("/"))
        y = ano if m <= mes else ano - 1
        x["data"] = f"{y}-{m:02d}-{d:02d}"
    return itens


def classificar(itens, cfg):
    """Aplica as regras do cartão: nome amigável + categoria do painel."""
    regras = [(re.compile(p), c, n) for p, c, n in cfg["regras"]]
    for x in itens:
        k = re.sub(r"[^A-Z0-9]", "", x["desc"].upper())
        for rx, c, n in regras:
            if rx.search(k):
                x["nome"], x["categoria"] = n, c; break
        else:
            x["nome"], x["categoria"] = x["desc"].title(), cfg["mapa"].get(x["cat"], "Outros")
    return itens


def de_json(f):
    """Fatura transcrita (de imagem/PDF) no formato de extratos/faturas/*.json."""
    itens = [{"data": d, "desc": desc, "chave": chave(desc), "parcela": p, "valor": v, "cat": c} for d, desc, p, v, c in f["itens"]]
    cambio = None
    for d, desc, usd, cb, v, iof in f.get("intl", []):
        itens.append({"data": d, "desc": desc, "chave": chave(desc), "parcela": None, "valor": v, "cat": "internacional", "intl": True, "usd": usd, "cambio": cb})
        if iof: itens.append({"data": d, "desc": "IOF sobre compra internacional", "chave": "IOF", "parcela": None, "valor": iof, "cat": "taxas", "intl": True})
        cambio = cb
    soma = round(sum(x["valor"] for x in itens), 2)
    return {"itens": itens, "futuras": [{"desc": d, "chave": chave(d), "parcela": p, "valor": v, "cat": ""} for d, p, v in f.get("futuras", [])],
            "total": f["total"], "soma": soma, "confere": abs(soma - f["total"]) < 0.02, "proxima": f.get("proxima"),
            "demais": f.get("demais"), "pagamento_anterior": f.get("pagamento_anterior"), "mes": f["mes"], "cambio": cambio, "obs": f.get("obs")}


def montar(xlsx, jsons, tx, cfg):
    """Junta faturas (.xlsx e .json), classifica os itens e liga cada uma ao débito na conta.
    tx: lançamentos da conta [[data, desc, valor, categoria], ...]"""
    import json, os
    brutas = []
    for a in xlsx:
        r = ler(a); ano, mes = mes_do_nome(os.path.basename(a))
        # o débito da conta com o mesmo valor diz o mês com certeza
        deb = [t for t in tx if "FATURA" in t[1].upper() and r["total"] and abs(-t[2] - r["total"]) < 0.02]
        if deb: ano, mes = int(deb[0][0][:4]), int(deb[0][0][5:7])
        if not (ano and mes): continue
        r["mes"] = f"{ano}-{mes:02d}"; r["origem"] = os.path.basename(a); brutas.append(r)
    for a in jsons:
        for f in json.load(open(a, encoding="utf-8")).get("faturas", []):
            r = de_json(f); r["origem"] = os.path.basename(a); brutas.append(r)
    por_mes = {}
    for r in brutas: por_mes[r["mes"]] = r          # o último arquivo lido de um mês vence
    meses = sorted(por_mes)
    out = []
    for i, m in enumerate(meses):
        r = por_mes[m]; ano, mes = map(int, m.split("-"))
        classificar(r["itens"], cfg); classificar(r["futuras"], cfg); anexar_ano(r["itens"], ano, mes)
        deb = [t for t in tx if "FATURA" in t[1].upper() and t[0][:7] == m]
        venc, pago = (deb[0][0], round(-deb[0][2], 2)) if deb else (None, None)
        prox = por_mes.get(meses[i + 1]) if i + 1 < len(meses) else None
        pa = prox.get("pagamento_anterior") if prox else None
        if not venc and isinstance(pa, (list, tuple)) and str(pa[0])[:7] == m:
            venc, pago = prox["pagamento_anterior"][0], abs(prox["pagamento_anterior"][1])
        itens = [[x["data"], x["nome"], x["parcela"], x["categoria"], round(x["valor"], 2), 1 if x.get("intl") else 0, x["desc"]] for x in r["itens"]]
        out.append({"mes": m, "venc": venc, "pago": pago, "no_extrato": bool(deb), "total": r["total"], "confere": r["confere"],
                    "itens": itens, "futuras": [[x["nome"], x["parcela"], x["valor"]] for x in r["futuras"]],
                    "proxima": r.get("proxima"), "demais": r.get("demais"), "obs": r.get("obs"),
                    "cambio": r.get("cambio") or next((x.get("cambio") for x in r["itens"] if x.get("cambio")), None),
                    "origem": r["origem"]})
    return out
