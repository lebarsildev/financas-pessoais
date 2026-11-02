#!/usr/bin/env python3
"""
Gera os cofres cifrados do painel:
    data/vault.json          conta corrente  (extratos/*.txt do banco; *.xlsx completa os dias seguintes)
    data/investimentos.json  investimentos   (extratos/b3/*.xlsx, relatórios da Área do Investidor B3)

Uso:
    python3 tools/gerar_cofre.py                 # lê ./extratos e ./extratos/b3
    python3 tools/gerar_cofre.py arquivo.xlsx    # conta: lê só os arquivos indicados
    python3 tools/gerar_cofre.py --verificar     # confere se a senha abre os cofres atuais

A mesma senha cifra os dois cofres, então um desbloqueio abre os dois módulos do site.

A senha é pedida no Terminal e nunca é gravada. Os .xlsx ficam fora do Git (.gitignore).
Dependências: pip3 install --user openpyxl cryptography
"""
import base64, collections, datetime as dt, getpass, glob, json, os, re, sys

try:
    import openpyxl
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    sys.exit("Faltam bibliotecas. Rode:\n    pip3 install --user openpyxl cryptography")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "data", "vault.json")
SAIDA_INV = os.path.join(RAIZ, "data", "investimentos.json")
SAIDA_IDX = os.path.join(RAIZ, "data", "indices.json")   # público: CDI e IPCA não são dados pessoais
PASTA_B3 = os.path.join(RAIZ, "extratos", "b3")
PASTA_FAT = os.path.join(RAIZ, "extratos", "faturas")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Regras reais ficam fora do Git (extratos/ está no .gitignore). No repositório só há um exemplo.
REGRAS_LOCAL = os.path.join(RAIZ, "extratos", "categorias.json")
REGRAS_EXEMPLO = os.path.join(RAIZ, "tools", "categorias.exemplo.json")
REGRAS = REGRAS_LOCAL if os.path.exists(REGRAS_LOCAL) else REGRAS_EXEMPLO
ITER = 600_000
SENHA_MIN = 12


# ---------- leitura ----------
def to_date(v):
    if isinstance(v, dt.datetime): return v.date()
    if isinstance(v, dt.date): return v
    if isinstance(v, str):
        m = re.match(r"\s*(\d{2})/(\d{2})/(\d{4})", v)
        if m: return dt.date(int(m[3]), int(m[2]), int(m[1]))
    return None

def to_num(v):
    if v is None or v == "": return None
    if isinstance(v, (int, float)): return round(float(v), 2)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if "," in s: s = s.replace(".", "").replace(",", ".")
    try: return round(float(s), 2)
    except ValueError: return None

def achar_planilha(wb):
    nomes = ["Base"] + [n for n in wb.sheetnames if n != "Base"]
    for n in nomes:
        if n not in wb.sheetnames: continue
        ws = wb[n]
        cab = [str(c or "").strip().lower() for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True), [])]
        if any("data" in c for c in cab) and any("valor" in c for c in cab):
            return ws, cab
    return None, None

def col(cab, *nomes):
    for i, c in enumerate(cab):
        if any(n in c for n in nomes): return i
    return None

def ler(arquivo):
    wb = openpyxl.load_workbook(arquivo, data_only=True, read_only=True)
    ws, cab = achar_planilha(wb)
    if ws is None:
        print(f"  ! {os.path.basename(arquivo)}: não achei aba com colunas Data e Valor; pulando.")
        return [], {}, []
    iD, iL, iV, iS = col(cab, "data"), col(cab, "lança", "lanca", "descri", "histór", "histor"), col(cab, "valor"), col(cab, "saldo")
    tx, saldo = [], {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        d = to_date(r[iD]) if iD is not None else None
        if not d: continue
        desc = str(r[iL] or "").strip() if iL is not None else ""
        v = to_num(r[iV]) if iV is not None else None
        s = to_num(r[iS]) if iS is not None else None
        if s is not None and (v is None or "SALDO" in desc.upper()):
            saldo[d.isoformat()] = s
            continue
        if v is None or not desc: continue
        tx.append((d.isoformat(), desc, v))
    revisar = []
    if "Revisar" in wb.sheetnames:
        for r in wb["Revisar"].iter_rows(min_row=2, values_only=True):
            if r and r[0] is not None:
                revisar.append({"linha": r[0], "txt": str(r[1]), "motivo": r[2] or ""})
    return tx, saldo, revisar


# ---------- categorias ----------
def categorizador():
    cfg = json.load(open(REGRAS, encoding="utf-8"))
    regras = [(c, re.compile(p)) for c, p in cfg["regras"]]
    def cat(desc, v):
        D = desc.upper()
        for c, rx in regras:
            if rx.search(D): return c
        if v > 0: return cfg["padrao_entrada"]
        if D.startswith("PIX TRANSF") and cfg.get("padrao_pix_pessoa"): return cfg["padrao_pix_pessoa"]
        return cfg["padrao_saida"]
    return cat


def fixos(linhas):
    """Contas fixas marcadas à mão (categorias.json → fixos): devolve [{nome, padrao}] com o nome usado nos lançamentos."""
    cfg = json.load(open(REGRAS, encoding="utf-8")).get("fixos", {})
    out = []
    for p, nome in cfg.get("regras", []):
        rx = re.compile(p)
        nomes = sorted({l[4] for l in linhas if l[2] < 0 and rx.search(l[1].upper())})
        if nomes: out.append({"nome": nome, "nomes": nomes})
    if out: print("Contas fixas: " + ", ".join(f["nome"] for f in out))
    return out


def nomeador():
    cfg = json.load(open(REGRAS, encoding="utf-8")).get("nomes", {})
    regras = [(re.compile(p), n) for p, n in cfg.get("regras", [])]
    def nome(desc):
        D = desc.upper()
        for rx, n in regras:
            if rx.search(D): return n
        s = re.sub(r"^(PIX TRANSF|PIX QRS|RSHOP-?|RSCSS|TED)\s*", "", desc, flags=re.I)
        s = re.sub(r"[-\s]*\d{2}/\d{2}$|\s*\d{4}$|\d{2}/\d{2}$", "", s).strip(" -*")
        s = s.title() if s.isupper() or s.islower() else s
        return s or desc
    return nome


def ajustes(linhas):
    """Depois das regras: períodos (ex.: viagem) e repasses."""
    cfg = json.load(open(REGRAS, encoding="utf-8"))
    sem = {cfg["padrao_saida"], cfg.get("padrao_pix_pessoa"), "Transferências / Outros"}
    for p in cfg.get("periodos", []):
        for l in linhas:
            if p["de"] <= l[0] <= p["ate"] and l[2] < 0 and l[3] in sem: l[3] = p["categoria"]
    rp = cfg.get("repasses", {})
    n = 0
    if rp.get("ativo"):
        dias, tol = rp.get("dias", 3), rp.get("tolerancia", 0.5)
        dt_ = lambda s: dt.date.fromisoformat(s)
        entradas = [l for l in linhas if l[2] > 0 and l[3] == cfg["padrao_entrada"] and l[1].upper().startswith("PIX TRANSF")]
        usadas = set()
        for s_ in sorted((l for l in linhas if l[2] < 0 and l[3] in sem and l[1].upper().startswith("PIX TRANSF")), key=lambda l: l[0]):
            for i, e in enumerate(entradas):
                if i in usadas: continue
                if abs(abs(s_[2]) - e[2]) <= tol and abs((dt_(s_[0]) - dt_(e[0])).days) <= dias:
                    s_[3] = e[3] = "Repasse"; usadas.add(i); n += 1; break
    return n


# ---------- cripto ----------
def chave(senha, salt):
    return PBKDF2HMAC(hashes.SHA256(), 32, salt, ITER).derive(senha.encode("utf-8"))

def cifrar(obj, senha):
    salt, iv = os.urandom(16), os.urandom(12)
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(chave(senha, salt)).encrypt(iv, raw, None)
    b = lambda x: base64.b64encode(x).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": b(salt), "iv": b(iv), "data": b(ct)}

def decifrar(vault, senha):
    d = lambda x: base64.b64decode(x)
    k = PBKDF2HMAC(hashes.SHA256(), 32, d(vault["salt"]), vault["iter"]).derive(senha.encode("utf-8"))
    return json.loads(AESGCM(k).decrypt(d(vault["iv"]), d(vault["data"]), None))


def verificar():
    senha = getpass.getpass("Senha do cofre: ")
    for arq, nome, chave_n in ((SAIDA, "conta", "tx"), (SAIDA_INV, "investimentos", "trades")):
        if not os.path.exists(arq): print(f"  {nome}: ainda não gerado"); continue
        try: dados = decifrar(json.load(open(arq)), senha)
        except Exception: sys.exit(f"  {nome}: senha incorreta.")
        print(f"  {nome}: OK, {len(dados[chave_n])} registros, gerado em {dados['geradoEm']}.")

def faturas(linhas):
    """Faturas do cartão: .xlsx (PDF convertido) e .json (transcrição) em extratos/faturas."""
    if not os.path.isdir(PASTA_FAT): return []
    import fatura
    xs = sorted(glob.glob(os.path.join(PASTA_FAT, "*.xlsx"))); js = sorted(glob.glob(os.path.join(PASTA_FAT, "*.json")))
    if not (xs or js): return []
    cfg = json.load(open(REGRAS, encoding="utf-8"))["cartao"]
    fs = fatura.montar(xs, js, linhas, cfg)
    print(f"\nFaturas do cartão ({len(fs)}):")
    for f in fs:
        ok = "confere" if f["confere"] else "NÃO CONFERE com o total impresso"
        dif = f" · débito {brl(f['pago'])}" if f["pago"] and abs(f["pago"] - f["total"]) > 0.01 else ""
        print(f"  {f['mes']}  {brl(f['total']):>14}  {len(f['itens']):>2} itens  {ok}{dif}{'' if f['no_extrato'] else ' · fora do extrato'}")
    return fs

def brl(v):
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def investimentos():
    if not os.path.isdir(PASTA_B3): return None
    import b3
    neg, mov, evt, n = b3.carregar(PASTA_B3)
    if not (neg or mov): return None
    d = b3.calcular(neg, mov, evt)
    print(f"\nInvestimentos ({n} arquivos da B3):")
    custo = sum(p[2] for p in d["positions"])
    for t, q, c in d["positions"]:
        print(f"  {t:<8} {f'{q:,.0f}'.replace(',', '.'):>10} ações · preço médio {brl(c/q)}")
    print(f"  Custo da carteira: {brl(custo)} · proventos recebidos: {brl(sum(x[4] for x in d['inc']))}")
    if d["futuros"]: print(f"  Proventos a receber: {brl(sum(x[4] for x in d['futuros']))}")
    return d


def indices():
    """Baixa do Banco Central (SGS) o CDI do mês (série 4391) e o IPCA do mês (série 433), em % ao mês.
    Junta com o data/indices.json que já existe; sem internet, mantém o arquivo como está."""
    import urllib.request
    atual = json.load(open(SAIDA_IDX, encoding="utf-8")) if os.path.exists(SAIDA_IDX) else {"cdi": {}, "ipca": {}}
    novos = 0
    for nome, serie in (("cdi", 4391), ("ipca", 433)):
        url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json&dataInicial=01/01/2019"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "financas-pessoais"})
            for x in json.load(urllib.request.urlopen(req, timeout=20)):
                d, m, a = x["data"].split("/")
                k = f"{a}-{m}"
                if k not in atual[nome]: novos += 1
                atual[nome][k] = round(float(x["valor"]), 4)
        except Exception as e:
            print(f"Aviso: não consegui baixar o {nome.upper()} do Banco Central ({e.__class__.__name__}). Mantive os números que já estavam.")
            return
    atual.update({"fonte": "Banco Central (SGS): CDI série 4391, IPCA série 433; % ao mês", "atualizado": dt.date.today().isoformat()})
    atual["cdi"] = dict(sorted(atual["cdi"].items())); atual["ipca"] = dict(sorted(atual["ipca"].items()))
    json.dump(atual, open(SAIDA_IDX, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"CDI até {max(atual['cdi'])} e IPCA até {max(atual['ipca'])} em data/indices.json" + (f" ({novos} meses novos)." if novos else "."))


def main():
    args = sys.argv[1:]
    if REGRAS == REGRAS_EXEMPLO:
        print("Aviso: usando as regras de EXEMPLO. Copie tools/categorias.exemplo.json para extratos/categorias.json e ajuste com as suas.\n")
    if "--verificar" in args: return verificar()
    arquivos = args or sorted(glob.glob(os.path.join(RAIZ, "extratos", "*.txt")) + glob.glob(os.path.join(RAIZ, "extratos", "*.xlsx")))
    arquivos = [a for a in arquivos if not os.path.basename(a).startswith("~$")]
    if arquivos: linhas, saldo, revisar = conta(arquivos)
    fats = faturas(linhas) if arquivos else []
    inv = investimentos()
    if not arquivos and not inv:
        sys.exit("Nenhum extrato encontrado. Coloque os .xlsx em 'extratos' (conta) e 'extratos/b3' (B3).")
    if not arquivos:
        print("Sem extratos da conta em 'extratos'; o cofre da conta não será alterado.")

    senha = pedir_senha()
    hoje = dt.date.today().isoformat()
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    if arquivos:
        metas_arq = os.path.join(RAIZ, "extratos", "metas.json")
        metas = json.load(open(metas_arq, encoding="utf-8")) if os.path.exists(metas_arq) else None
        if metas: print(f"Metas do orçamento: {len(metas.get('mensal', {}))} categorias (extratos/metas.json)")
        json.dump(cifrar({"tx": linhas, "saldo": sorted(saldo.items()), "revisar": revisar, "faturas": fats, "metas": metas, "fixos": fixos(linhas), "geradoEm": hoje}, senha), open(SAIDA, "w"))
        print(f"\nCofre da conta gravado em data/vault.json ({os.path.getsize(SAIDA)//1024} KB).")
    if inv:
        json.dump(cifrar(inv, senha), open(SAIDA_INV, "w"))
        print(f"Cofre de investimentos gravado em data/investimentos.json ({os.path.getsize(SAIDA_INV)//1024} KB).")
        indices()
    print("Pode publicar.")


def ler_txt(arquivo):
    """Extrato exportado pelo banco: DD/MM/AAAA;DESCRIÇÃO;VALOR (vírgula decimal)."""
    tx = []
    for enc in ("utf-8-sig", "latin-1"):
        try: texto = open(arquivo, encoding=enc).read(); break
        except UnicodeDecodeError: continue
    for ln in texto.splitlines():
        p = [x.strip() for x in ln.split(";")]
        if len(p) < 3: continue
        d = to_date(p[0]); v = to_num(p[2])
        if d and v is not None and p[1]: tx.append((d.isoformat(), p[1], v))
    return tx


def calcular_saldo(tx, conhecidos):
    """Saldo diário a partir dos lançamentos, ancorado nos saldos conhecidos (planilha).
    Devolve (saldo por dia, dias conferidos, dias divergentes)."""
    por_dia = collections.defaultdict(float)
    for d, _, v in tx: por_dia[d] += v
    corrido, run = {}, 0.0
    for d in sorted(por_dia): run = round(run + por_dia[d], 2); corrido[d] = run
    difs = collections.Counter(round(conhecidos[d] - corrido[d], 2) for d in corrido if d in conhecidos)
    if not difs: return {}, 0, 0
    ancora, ok = difs.most_common(1)[0]
    return {d: round(v + ancora, 2) for d, v in corrido.items()}, ok, sum(difs.values()) - ok


def conta(arquivos):
    cat = categorizador()
    contagem, saldo, revisar = collections.Counter(), {}, []
    print("Lendo extratos:")
    txts = [a for a in arquivos if a.lower().endswith(".txt")]
    base = []
    for a in txts:
        t = ler_txt(a); base += t
        print(f"  • {os.path.basename(a)}: {len(t)} lançamentos (base)")
    fim_txt = max((t[0] for t in base), default="")
    c = collections.Counter(base)
    for k, n in c.items(): contagem[k] = max(contagem[k], n)
    for a in arquivos:
        if a in txts: continue
        tx, s, rv = ler(a)
        # o .txt do banco é a base; a planilha só completa os dias depois do fim do .txt
        extra = [t for t in tx if t[0] > fim_txt]
        print(f"  • {os.path.basename(a)}: {len(tx)} lançamentos" + (f", {len(extra)} usados (depois de {fim_txt})" if fim_txt else ""))
        # mesmo lançamento em dois arquivos conta uma vez; repetido no mesmo arquivo conta as vezes que aparece
        c = collections.Counter(extra)
        for k, n in c.items(): contagem[k] = max(contagem[k], n)
        saldo.update(s)
        if not fim_txt: revisar += rv
    if fim_txt:
        calc, ok, div = calcular_saldo(base, saldo)
        if calc:
            print(f"  Saldo calculado do .txt confere com a planilha em {ok} dias" + (f" ({div} divergentes)" if div else "."))
            saldo = {**{d: v for d, v in saldo.items() if d > fim_txt}, **calc}
    linhas = []
    for (d, desc, v), n in contagem.items():
        linhas += [[d, desc, v, cat(desc, v)] for _ in range(n)]
    linhas.sort(key=lambda x: x[0], reverse=True)
    nrep = ajustes(linhas)
    nome = nomeador()
    for l in linhas: l.append(nome(l[1]))
    if nrep: print(f"  {nrep} repasses identificados (entrada e saída do mesmo valor em poucos dias)")
    meses = sorted({l[0][:7] for l in linhas})
    print(f"\n{len(linhas)} lançamentos de {meses[0]} a {meses[-1]}.")
    por_cat = collections.Counter()
    for l in linhas:
        if l[2] < 0: por_cat[l[3]] += -l[2]
    for c, v in por_cat.most_common():
        print(f"  {c:<26} {brl(v):>15}")
    return linhas, saldo, revisar


def pedir_senha():
    print(f"\nDefina a senha do cofre (mínimo {SENHA_MIN} caracteres). Ela não aparece na tela.")
    while True:
        s1 = getpass.getpass("Senha: ")
        if len(s1) < SENHA_MIN:
            print(f"  Muito curta: use pelo menos {SENHA_MIN} caracteres. Uma frase com 3 ou 4 palavras funciona bem."); continue
        if getpass.getpass("Repita a senha: ") != s1:
            print("  As senhas não conferem. Tente de novo."); continue
        break
    return s1


if __name__ == "__main__":
    main()
