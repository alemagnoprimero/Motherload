"""Audit T13b: the resident texture bytes tables of the README, from the two
runs of zone-runtime.mjs resident (before = item 1's tip 1a0b5db, after =
this item). One table per form; columns are the stages, rows the readout
groups (atlas pages by zone and density, band pages, backgrounds, layers,
other), before -> after, with the §7 limit and pass/fail.

Usage: python3 docs/qa/t13b-asset-pipeline/resident-table.py \
         docs/qa/t13b-asset-pipeline/resident-before.json \
         docs/qa/t13b-asset-pipeline/resident-after.json
"""
import json
import sys

MIB = 2**20
STAGES = [('boot', 'boot (surface)'), ('W01', 'W01 row 18 (shaft)'),
          ('cave', 'W01 row 43 (cave)'), ('W02', 'W02 row 26 (shaft)')]
FORMS = {
    'desktop': 'desktop 1440 × 900 @2',
    'phone': 'phone 393 × 851 @3 (touch)',
    'desktop-1728': 'desktop 1728 × 1117 @2 (@4x proof, real viewport)',
    'desktop-tile82': 'desktop 1440 × 900 @2, `?tile=82` (@4x proof, D1 option B)',
    'phone-tile56': 'phone 393 × 851 @3, `?tile=56` (phone @3x proof, D1 option B)',
}
GROUPS = [('bands', 'band pages'), ('bg', 'sky and ridges'),
          ('layers', 'layers (terrain, light map, T1-lite)'), ('other', 'other')]


def limit(form, stage):
    """render-memory.mjs and feel-smoke.mjs: 64 desktop; touch 20 boot, 40 active."""
    if form.startswith('phone'):
        return 20 if stage == 'boot' else 40
    return 64


def mib(value):
    return f'{value / MIB:.2f}'


def pages(sample):
    """Atlas bytes by (world, zone) at each density, e.g. 'W01 core 3.00 @3'."""
    parts = {}
    for texture in sample['textures']:
        if texture['group'] != 'atlas':
            continue
        world = texture['world'] or texture['key'][9:12].upper()
        zone = texture['zone'] or '?'
        key = (world, zone)
        entry = parts.setdefault(key, {})
        entry[texture['density']] = entry.get(texture['density'], 0) + texture['bytes']
    out = []
    for (world, zone), densities in sorted(parts.items()):
        if zone == 'legacy':
            out.append(' + '.join(f"{world} @{d}x {mib(b)}" for d, b in sorted(densities.items())))
        else:
            out.append(f"{world} {zone} " + ' + '.join(
                f"{mib(b)} @{d}x" for d, b in sorted(densities.items())))
    return '; '.join(out)


def main(before_path, after_path):
    before = {(s['form'], s['stage']): s for s in json.load(open(before_path))['samples']}
    after = {(s['form'], s['stage']): s for s in json.load(open(after_path))['samples']}
    for form, title in FORMS.items():
        if not any((form, stage) in after for stage, _ in STAGES):
            continue
        print(f'**{title}**\n')
        print('| group | ' + ' | '.join(label for _, label in STAGES) + ' |')
        print('|---|' + '---|' * len(STAGES))

        def row(label, cell):
            cells = []
            for stage, _ in STAGES:
                b, a = before.get((form, stage)), after.get((form, stage))
                cells.append(cell(b, a, stage))
            print(f'| {label} | ' + ' | '.join(cells) + ' |')

        def pair(get):
            def cell(b, a, stage):
                if a is None:
                    return '—'
                return (f'{mib(get(b))} → ' if b else '— → ') + f'**{mib(get(a))}**'
            return cell

        row('atlas pages', pair(lambda s: s['groups']['atlas']))
        row('atlas by world, zone and density',
            lambda b, a, stage: (pages(b) if b else '—') + ' → ' + (pages(a) if a else '—'))
        for group, label in GROUPS:
            row(label, pair(lambda s, g=group: s['groups'][g]))
        row('**total**', pair(lambda s: s['bytes']))
        row('§7 limit (MiB)', lambda b, a, stage: str(limit(form, stage)))

        def verdict(b, a, stage):
            def one(s):
                return 'pass' if s['bytes'] <= limit(form, stage) * MIB else '**over**'
            return (one(b) + ' → ' if b else '— → ') + (one(a) if a else '—')
        row('pass', verdict)
        row('pages after (data-atlas-density: other / hero; guard)',
            lambda b, a, stage: (f"@{a['density']}" + (f" · guard {a['guard']}" if a['guard'] else ''))
            if a else '—')
        print()


if __name__ == '__main__':
    main(*sys.argv[1:3])
