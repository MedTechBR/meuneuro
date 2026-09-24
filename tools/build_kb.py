#!/usr/bin/env python3
"""Gera kb.js a partir dos JSON verificados em kb-fontes/.

Cada JSON tem um objeto por fármaco (chaves fixas: id, nome, marcas, classe, indicacoes,
apresentacoes, posologiaUsual, doseMaxDia, portaria344, receituario, limiteQuantidade,
efeitosComuns, sinaisAlerta, monitorizacao, interacoes, gestacao, suspensao, orientacoes,
alertasMedico, fontes). Este script:
  - normaliza os ids (os mesmos que regras.js usa nos grupos);
  - quebra as apresentações em opções {dose, forma} para os botões da conversa;
  - marca excecao6meses (anticonvulsivantes e antiparkinsonianos da lista C1, Portaria 344 art. 59 p.u.);
  - acrescenta apelidos e erros de digitação comuns.
Uso: python3 tools/build_kb.py
"""
import json, re, sys, unicodedata, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTES = RAIZ / 'kb-fontes'

def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

IDS = {  # id do arquivo (ou slug do nome) -> id usado no app
    'acido-acetilsalicilico': 'aas',
    'acido-valproico': 'valproato', 'valproato-de-sodio': 'valproato', 'divalproato-de-sodio': 'valproato',
    'acido-valproico-valproato-de-sodio-divalproato-de-sodio': 'valproato',
    'candesartana-cilexetila': 'candesartana',
}
APELIDOS = {
    'aas': ['AAS', 'aspirina', 'acido acetil salicilico'],
    'valproato': ['ácido valproico', 'acido valproico', 'valproato de sódio', 'divalproato', 'divalproato de sódio', 'valproico', 'depakene', 'depakote'],
    'levetiracetam': ['levetiracetan', 'levetiracetame', 'levetiracetamo'],
    'lamotrigina': ['lamotrigine', 'lamotrigyna'],
    'carbamazepina': ['carbamazepine', 'carbamazepam', 'carbamazepna'],
    'oxcarbazepina': ['oxcarbazepine', 'oxicarbazepina'],
    'topiramato': ['topiramate', 'topiramatu'],
    'clonazepam': ['clonazepan', 'clonazepan gotas'],
    'fenobarbital': ['fenobarbitol', 'gardenal'],
    'fenitoina': ['fenitoína', 'hidantal'],
    'pregabalina': ['pregabalin'],
    'gabapentina': ['gabapentin'],
    'levodopa-carbidopa': ['levodopa carbidopa', 'carbidopa levodopa', 'sinemet'],
    'levodopa-benserazida': ['levodopa benserazida', 'benserazida', 'prolopa bd', 'prolopa hbs'],
    'rivastigmina-adesivo': ['adesivo de rivastigmina', 'exelon patch', 'rivastigmina patch'],
    'amitriptilina': ['amitriptilina', 'amitripitilina', 'amitriptilina'],
    'nortriptilina': ['nortripitilina'],
    'duloxetina': ['duloxetine'],
    'venlafaxina': ['venlafaxine'],
    'sumatriptana': ['sumatriptano', 'sumatripitana'],
    'zolpidem': ['zolpiden'],
    'insulina-nph': ['nph', 'insulina nph', 'humulin n', 'novolin n'],
    'insulina-regular': ['insulina regular', 'humulin r', 'novolin r'],
    'insulina-glargina': ['glargina', 'lantus', 'basaglar', 'toujeo', 'glargilin'],
    'levotiroxina': ['puran', 'puran t4', 'synthroid', 'euthyrox', 'levoid'],
    'metformina': ['glifage', 'glifage xr'],
}

# Portaria 344/98, art. 59, parágrafo único: anticonvulsivantes e antiparkinsonianos até 6 meses de tratamento
# Valor = condição que precisa estar presente: fora da indicação (dor, enxaqueca, tremor, pernas inquietas)
# a vigilância pode não aplicar a exceção, então o app limita a 60 dias. Fenobarbital (lista B1, Adendo 2)
# fica fora: a exceção do art. 59 cita só as listas C1 e C5.
EXCECAO_6M = {**{i: 'epilepsia' for i in ['levetiracetam', 'lamotrigina', 'carbamazepina', 'oxcarbazepina', 'valproato', 'fenitoina',
                                        'topiramato', 'lacosamida', 'gabapentina', 'pregabalina', 'primidona']},
              **{i: 'parkinson' for i in ['pramipexol', 'rasagilina', 'amantadina', 'entacapona', 'biperideno']}}

LISTAS = ['marcas', 'indicacoes', 'apresentacoes', 'efeitosComuns', 'sinaisAlerta', 'monitorizacao', 'interacoes', 'orientacoes', 'alertasMedico', 'fontes']
TEXTOS = ['posologiaUsual', 'doseMaxDia', 'gestacao', 'suspensao', 'classe', 'nome']

FORMAS = [
    (r'aerossol oral|spray oral|aerossol', lambda m: 'aerossol oral (bombinha)'),
    (r'pó inalatório|pó para inalação', lambda m: 'pó inalatório'),
    (r'cápsulas? inalatórias?', lambda m: 'cápsula inalatória'),
    (r'solução para inalação', lambda m: 'solução para inalação'),
    (r'solução para nebulização', lambda m: 'solução para nebulização'),
    (r'comprimidos? mastigáve(?:l|is)', lambda m: 'comprimido mastigável'),
    (r'sachês?(?: de grânulos)?', lambda m: 'sachê'),
    (r'cápsulas? (?:duras? )?de liberação modificada', lambda m: 'cápsula de liberação modificada'),
    (r'caneta', lambda m: 'caneta preenchida'),
    (r'frasco', lambda m: 'frasco-ampola'),

    (r'comprimidos? revestidos? de liberação (prolongada|retardada|controlada)', lambda m: 'comprimido revestido de liberação ' + m.group(1)),
    (r'comprimidos? de liberação (prolongada|retardada|controlada)', lambda m: 'comprimido de liberação ' + m.group(1)),
    (r'cápsulas? (?:duras? )?de liberação (prolongada|retardada|controlada)', lambda m: 'cápsula de liberação ' + m.group(1)),
    (r'comprimidos? revestidos?', lambda m: 'comprimido revestido'),
    (r'comprimidos? orodispersíve(?:l|is)', lambda m: 'comprimido orodispersível'),
    (r'comprimidos? dispersíve(?:l|is)', lambda m: 'comprimido dispersível'),
    (r'comprimidos? sublinguais?', lambda m: 'comprimido sublingual'),
    (r'comprimidos?', lambda m: 'comprimido'),
    (r'cápsulas?', lambda m: 'cápsula'),
    (r'drágeas?', lambda m: 'drágea'),
    (r'solução oral \(gotas\)|gotas', lambda m: 'solução oral (gotas)'),
    (r'solução oral', lambda m: 'solução oral'),
    (r'suspensão oral', lambda m: 'suspensão oral'),
    (r'xarope', lambda m: 'xarope'),
    (r'adesivo', lambda m: 'adesivo transdérmico'),
    (r'spray nasal', lambda m: 'spray nasal'),
    (r'solução injetável', lambda m: 'solução injetável'),
]
PULAR = re.compile(r'doses expressas|associação fixa|uso hospitalar|suplemento alimentar|manipulad|não é mais comercializad|confirmar disponibilidade', re.I)

def num(s):
    return s.replace('.', ',')

def formas_de(aps):
    out, vistos = [], set()
    for ap in aps:
        if PULAR.search(ap) and not re.search(r'\d+\s*(mg|mcg)', ap.split('(')[0]):
            continue
        low = ap.lower()
        forma = None
        for rx, f in FORMAS:
            m = re.search(rx, low)
            if m:
                forma = f(m); break
        if not forma:
            forma = 'comprimido'
        if 'liberação' not in forma and re.search(r'liberação (prolongada|retardada|controlada)', low):
            forma += ' de liberação ' + re.search(r'liberação (prolongada|retardada|controlada)', low).group(1)
        corpo = re.sub(r'\([^)]*\)', ' ', ap) if 'adesivo' not in forma else ap
        doses = []
        if 'adesivo' in forma:
            m = re.search(r'libera\s*([\d.,]+)\s*mg\s*/\s*24\s*h', corpo)
            if m: doses = [num(m.group(1)) + ' mg/24 h']
        else:
            combos = re.findall(r'(\d+(?:[.,]\d+)?)\s*mg\s*\+\s*(\d+(?:[.,]\d+)?)\s*mg', corpo)
            barra = re.findall(r'(\d+(?:[.,]\d+)?)\s*/\s*(\d+(?:[.,]\d+)?)\s*(mcg|mg)\b', corpo)
            liquido = re.search(r'(\d+(?:[.,]\d+)?)\s*mg\s*/\s*(\d+(?:[.,]\d+)?)\s*mL', corpo)
            ui = re.search(r'(\d+)\s*UI\s*/\s*mL', corpo)
            if combos:
                doses = [num(a) + '/' + num(b) + ' mg' for a, b in combos]
            elif barra:
                doses = [num(a) + '/' + num(b) + ' ' + u for a, b, u in barra]
            elif liquido:
                doses = [num(liquido.group(1)) + ' mg/' + num(liquido.group(2)) + ' mL']
            elif ui:
                doses = [ui.group(1) + ' UI/mL']
            else:
                # "0,125 mg, 0,25 mg e 1 mg" | "10 mg, 40 mg e 80 mg" | "25, 50 e 100 mg"
                for m in re.finditer(r'((?:\d+(?:[.,]\d+)?\s*(?:mg|mcg)?\s*(?:,|e|a)\s*)*\d+(?:[.,]\d+)?)\s*(mg/mL|mg/ml|mg por dose|mcg/dose|mcg/inalação|mg|mcg)\b', corpo):
                    unidade = m.group(2).replace('mg/ml', 'mg/mL').replace(' por dose', '').replace('/inalação', '/dose')
                    for n in re.findall(r'\d+(?:[.,]\d+)?', m.group(1)):
                        doses.append(num(n) + ' ' + unidade)
        for d in doses:
            if 'UI' in d and forma.startswith('comprimido'):
                continue
            k = (d, forma)
            if k in vistos: continue
            vistos.add(k)
            out.append({'dose': d, 'forma': forma})
    return out

def main():
    arquivos = sorted(FONTES.glob('*.json'))
    if not arquivos:
        sys.exit('Nenhum JSON em kb-fontes/')
    kb, ids = [], set()
    for arq in arquivos:
        for x in json.load(open(arq, encoding='utf-8')):
            i = IDS.get(x['id'], IDS.get(slug(x['nome']), x['id']))
            i = IDS.get(i, i)
            if i in ids:
                print('ids repetidos:', i, arq.name); continue
            ids.add(i)
            x['id'] = i
            for campo in LISTAS:
                v = x.get(campo)
                if v is None: x[campo] = []
                elif isinstance(v, str):
                    # texto corrido com itens separados por ';' vira lista de itens
                    partes = [t.strip().rstrip('.') for t in re.split(r';\s+', v) if t.strip()]
                    x[campo] = [pp[0].upper() + pp[1:] if pp else pp for pp in partes]
            for campo in TEXTOS:
                v = x.get(campo)
                if isinstance(v, list): print('  lista virou texto:', i, campo); x[campo] = ' '.join(v)
            x['excecao6meses'] = EXCECAO_6M.get(i) if x['receituario'] == 'controle_especial' else None
            x['formas'] = formas_de(x.get('apresentacoes') or [])
            x['aliases'] = APELIDOS.get(i, [])
            kb.append(x)
    kb.sort(key=lambda k: k['nome'])
    js = '/* RefilMed — banco de medicamentos neurológicos (GERADO por tools/build_kb.py; não editar à mão)\n' \
         '   Conteúdo verificado em bulas ANVISA, rótulos FDA/EMA, PCDT/MS e diretrizes (fontes em cada item). */\n' \
         '(typeof window !== "undefined" ? window : globalThis).RF_KB = ' + json.dumps(kb, ensure_ascii=False, indent=0) + ';\n'
    (RAIZ / 'kb.js').write_text(js, encoding='utf-8')
    print(len(kb), 'fármacos;', sum(1 for k in kb if k['excecao6meses']), 'com exceção de 6 meses')
    for k in kb:
        if not k['formas']: print('  sem formas:', k['id'], k['apresentacoes'])

if __name__ == '__main__':
    main()
