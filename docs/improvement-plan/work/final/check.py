import re, sys
p = sys.argv[1]
text = open(p, encoding='utf-8').read()
print('words:', len(text.split()))
items = {}
for line in text.splitlines():
    m = re.match(r'^\| ([A-H]\d+[ab]?) \| (.*)\|\s*$', line)
    if m:
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) == 6:
            iid, change, why, effort, impact, deps = cells
            items[iid] = dict(effort=effort, impact=impact, deps=deps)
print('items:', len(items))
valid_eff = {'S', 'S–M', 'M', 'M–L', 'L', 'XL'}
for k, v in items.items():
    if v['effort'] not in valid_eff: print('bad effort', k, v['effort'])
    if not v['impact']: print('no impact', k)
# referenced ids anywhere
ref = set(re.findall(r'\b([A-H]\d{1,2}[ab]?)\b', text))
ref = {r for r in ref if re.fullmatch(r'[A-H]\d{1,2}[ab]?', r)}
# filter out things like D3, E4 from GFX-P tags etc: report only unknown
unknown = sorted(r for r in ref if r not in items)
print('referenced but not defined:', unknown)
# roadmap section
road = text.split('## 5. Roadmap')[1].split('**Cut lines')[0]
sched = set(re.findall(r'\b([A-H]\d{1,2}[ab]?)\b', road))
backlog = text.split('**Backlog (')[1].split('\n')[0]
bl = set(re.findall(r'\b([A-H]\d{1,2}[ab]?)\b', backlog))
print('in roadmap not defined:', sorted(s for s in sched | bl if s not in items))
print('defined not scheduled:', sorted(k for k in items if k not in sched and k not in bl))
