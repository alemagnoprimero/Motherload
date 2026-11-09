"""A13: W01's core hero pages and the rig frames on them, before (item 2's
tip 2a6185a) and after (a revision with A13, default HEAD), read from the
committed manifests and pages with git (no build, no browser):

    python3 docs/qa/a13-rig-shading/pages.py [BEFORE [AFTER]] > docs/qa/a13-rig-shading/pages.json

Per W01 core hero page: size, decoded bytes (RGBA, 4 bytes a pixel), PNG
bytes, frame count; for rig-cabin and rig-cabin-emissive at every density:
the page, the trimmed size and the source size; and every W01 page's total
decoded bytes.
"""
import json
import subprocess
import sys


def show(rev, path, binary=False):
    out = subprocess.run(['git', 'show', f'{rev}:{path}'], capture_output=True, check=True).stdout
    return out if binary else out.decode()


def pages(rev):
    zones = json.loads(show(rev, 'assets/campaign/generated/w01-zones.json'))
    record = {'pages': {}, 'rig frames': {}, 'all W01 pages': {}}
    total = 0
    for page in zones['pages']:
        total += page['bytes']
        if not page['key'].startswith('campaign-w01-core-hero-'):
            continue
        png = show(rev, f"assets/campaign/generated/{page['image']}", binary=True)
        data = json.loads(show(rev, f"assets/campaign/generated/{page['data']}"))
        record['pages'][page['key']] = {
            'size': [page['width'], page['height']], 'decoded bytes': page['bytes'],
            'decoded MiB': round(page['bytes'] / 2 ** 20, 3), 'png bytes': len(png), 'frames': len(page['frames'])}
        for name in ('rig-cabin', 'rig-cabin-emissive'):
            frame = data['frames'].get(name)
            if frame:
                record['rig frames'].setdefault(name, {})[f"@{page['density']}x"] = {
                    'page': page['key'], 'trimmed': [frame['frame']['w'], frame['frame']['h']],
                    'source': [frame['sourceSize']['w'], frame['sourceSize']['h']],
                    'pivot': frame.get('pivot')}
    record['all W01 pages'] = {'pages': len(zones['pages']), 'decoded MiB': round(total / 2 ** 20, 2),
                               'frames on pages': len(zones['frames'])}
    return record


def main():
    before = sys.argv[1] if len(sys.argv) > 1 else '2a6185a'
    after = sys.argv[2] if len(sys.argv) > 2 else 'HEAD'
    report = {'before': before, 'after': after, before: pages(before), after: pages(after)}
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
