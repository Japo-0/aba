"""Transforma a fila do /estudar (saída do fila.py) na lista de tarefas da mini aba.

uso:
  python3 -I tarefas.py FILA.json [--feitas ID,ID,...] [--livro "PV Matemática – L3"]
                        [--pos X,Y] [--js MINI-ABA.js]

Sem --js imprime o payload em JSON. Com --js imprime um trecho de JavaScript pronto
para rodar na aba do livro: o código da mini aba seguido de __miniAba.carregar(payload).

Cada item da fila vira uma tarefa por atividade, na ordem do plano:
  "Ler pp. 213–219 · 7 páginas · 21 min (...) | Fazer Revisando 9 (p. 233) · Propostos 3 (p. 234)"
vira
  1. Ler páginas 213–219 — 21 min
  2. Fazer Revisando 9 — página 233
  3. Fazer Propostos 3 — página 234
Bloco sem itens (Português, Redação, Simulado…) vira uma única tarefa com o tema.
"""
import sys, re, json, time

PAGS = re.compile(r'\((pp?)\. ([\d–-]+)\)\s*$')
LER = re.compile(r'^Ler (pp?)\. ([\d–-]+)(.*)$')
MIN = re.compile(r'(\d+) min')


def pagina_inicial(txt):
    m = re.match(r'\d+', txt)
    return int(m.group(0)) if m else None


def tarefas_do_item(item):
    out = []
    for parte in item['tarefa'].split(' | '):
        parte = parte.strip()
        ler = LER.match(parte)
        if ler:
            tipo, pags, resto = ler.groups()
            m = MIN.search(resto)
            out.append({
                'titulo': ('Ler páginas %s' if tipo == 'pp' else 'Ler página %s') % pags,
                'detalhe': '%s min' % m.group(1) if m else '',
                'pagina': pagina_inicial(pags),
            })
            continue
        if parte.startswith('Fazer '):
            # "Fazer Revisando 9 (p. 233) · Propostos 3 (p. 234)": uma tarefa por lista
            for lista in parte[len('Fazer '):].split(' · '):
                lista = lista.strip()
                p = PAGS.search(lista)
                nome = PAGS.sub('', lista).strip() if p else lista
                out.append({
                    'titulo': 'Fazer ' + nome,
                    'detalhe': (('páginas %s' if p.group(1) == 'pp' else 'página %s') % p.group(2)) if p else '',
                    'pagina': pagina_inicial(p.group(2)) if p else None,
                })
            continue
        if parte:
            out.append({'titulo': parte, 'detalhe': '', 'pagina': None})
    return out


def montar(fila, feitas=(), livro=None, pos=None):
    tarefas = []
    for bloco in fila['fila']:
        dia = re.match(r'Dia \d+', bloco['dia'])
        contexto = ' · '.join(x for x in [bloco['materia'], dia.group(0) if dia else ''] if x)
        if not bloco['itens']:
            tarefas.append({
                'id': '%s/-/0' % bloco['chave'], 'bloco': bloco['chave'], 'contexto': contexto,
                'titulo': bloco['tema'] or bloco['materia'], 'detalhe': bloco['horario'],
                'livro': None, 'pagina': None,
            })
            continue
        for i, item in enumerate(bloco['itens']):
            for n, t in enumerate(tarefas_do_item(item)):
                t.update({'id': '%s/%d/%d' % (bloco['chave'], i, n), 'bloco': bloco['chave'],
                          'contexto': contexto, 'livro': item['livro'], 'capitulo': item['capitulo']})
                if t['pagina'] is None:
                    t['pagina'] = item['pagina']
                tarefas.append(t)
    return {'id': 'fila-%s' % fila.get('hoje', ''), 'tarefas': tarefas,
            'feitas': [f for f in feitas if f], 'livroAberto': livro, 'pos': pos}


def main(argv):
    args = {'--feitas': '', '--livro': None, '--pos': None, '--js': None}
    fila_path = None
    i = 0
    while i < len(argv):
        if argv[i] in args:
            args[argv[i]] = argv[i + 1]
            i += 2
        else:
            fila_path = argv[i]
            i += 1
    fila = json.load(open(fila_path, encoding='utf8'))
    pos = None
    if args['--pos']:
        x, y = args['--pos'].split(',')
        # t = agora: a posição trazida da aba anterior vence a que ficou guardada nesta página
        pos = {'x': float(x), 'y': float(y), 't': int(time.time() * 1000)}
    payload = montar(fila, args['--feitas'].split(','), args['--livro'], pos)
    texto = json.dumps(payload, ensure_ascii=False)
    if args['--js']:
        codigo = open(args['--js'], encoding='utf8').read()
        print(codigo + '\n;window.__miniAba.carregar(' + texto + ');')
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main(sys.argv[1:])
