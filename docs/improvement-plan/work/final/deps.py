import re, sys
t = open(sys.argv[1], encoding='utf-8').read()
items = {}
for line in t.splitlines():
    if re.match(r'^\| [A-H]\d+[ab]? \|', line):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) == 6:
            deps = [d.strip() for d in re.split(r',\s*', cells[5]) if re.fullmatch(r'[A-H]\d+[ab]?', d.strip())]
            items[cells[0]] = deps
road = t.split('## 5. Roadmap')[1].split('**Cross-track')[0]
order = {}
rows = [l for l in road.splitlines() if re.match(r'^\| [0-3]:', l)]
for pi, row in enumerate(rows):
    cells = [c.strip() for c in row.strip().strip('|').split('|')]
    for ti, cell in enumerate(cells[1:3]):
        ids = re.findall(r'\b([A-H]\d+[ab]?)\b', cell)
        for pos, i in enumerate(ids):
            order.setdefault(i, (pi, ti, pos))
backlog = re.findall(r'\b([A-H]\d+[ab]?)\b', t.split('**Backlog (')[1].split('\n')[0])
for b in backlog: order.setdefault(b, (9, 0, 0))
probs = []
for i, deps in items.items():
    if i not in order: probs.append(f'{i} not scheduled'); continue
    for d in deps:
        if d not in order: probs.append(f'{i} dep {d} not scheduled'); continue
        a, b = order[i], order[d]
        if b[0] > a[0]: probs.append(f'{i} (P{a[0]}) depends on later {d} (P{b[0]})')
        elif b[0] == a[0] and b[1] == a[1] and b[2] > a[2]: probs.append(f'{i} before its dep {d} in same track')
        elif b[0] == a[0] and b[1] != a[1]: probs.append(f'cross-track same phase: {i} <- {d}')
print('\n'.join(probs) or 'no problems')
