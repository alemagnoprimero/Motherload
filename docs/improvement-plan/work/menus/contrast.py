"""WCAG 2.x contrast of menu/terminal text, using the colours in src/campaign/style.css.
Opacity is composited over the panel background, exactly as the browser renders an
element with `opacity` (text and its own background are both blended with the backdrop)."""
import json

def hx(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lin(c):
    c = c/255
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4

def lum(rgb):
    r, g, b = (lin(v) for v in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi+0.05)/(lo+0.05), 2)

def mix(fg, bg, a):
    return tuple(round(a*f + (1-a)*b) for f, b in zip(fg, bg))

PANEL = hx('#101e25'); HEADER = hx('#17282e'); NAV = hx('#16272d'); FOOT = hx('#182a2d')
BTN = hx('#25353a'); PRIMARY = hx('#bb8640')
rows = []
def add(name, fg, bg, where, opacity=1.0, own_bg=None, size='12px'):
    if opacity < 1:
        under = own_bg if own_bg else bg
        t = mix(fg, PANEL if own_bg else bg, opacity) if not own_bg else mix(fg, PANEL, opacity)
        b = mix(under, PANEL, opacity) if own_bg else bg
        r = ratio(t, b)
    else:
        r = ratio(fg, own_bg or bg)
    rows.append({'element': name, 'where': where, 'size': size, 'opacity': opacity, 'ratio': r,
                 'AA_normal_4.5': r >= 4.5, 'AA_large_3': r >= 3})

add('Body text (#e9efdf)', hx('#e9efdf'), PANEL, 'panel', size='13px')
add('.muted copy (#a0b3b7)', hx('#a0b3b7'), PANEL, 'pause menu', size='12px')
add('.eyebrow (#c6b488)', hx('#c6b488'), HEADER, 'panel header', size='12px')
add('Equipment eyebrow (#9eb7ad)', hx('#9eb7ad'), PANEL, 'terminal cards', size='12px')
add('Equipment <small> (#90a9a2)', hx('#90a9a2'), PANEL, 'terminal cards', size='12px')
add('Upgrade preview (#e6c48f)', hx('#e6c48f'), PANEL, 'terminal cards', size='13px bold')
add('Inactive tab (#9eb5ae)', hx('#9eb5ae'), NAV, 'terminal tabs', size='12px bold')
add('Dock feedback line (#d2c5a6)', hx('#d2c5a6'), FOOT, 'terminal footer', size='12px')
add('Record <dt> (#96b0ad)', hx('#96b0ad'), PANEL, 'flight record', size='13px')
add('Enabled button label', hx('#e8efea'), PANEL, 'button', own_bg=BTN, size='12-13px bold')
add('Enabled primary label', hx('#101b1e'), PANEL, 'primary button', own_bg=PRIMARY, size='12-13px bold')
add('DISABLED button label (opacity .38)', hx('#e8efea'), PANEL, 'button', opacity=0.38, own_bg=BTN, size='12px bold')
add('DISABLED primary label (opacity .38)', hx('#101b1e'), PANEL, 'primary button', opacity=0.38, own_bg=PRIMARY, size='12px bold')
add('Locked milestone copy (#a2b9b3, opacity .52)', hx('#a2b9b3'), PANEL, 'lander tab', opacity=0.52, size='12px')
add('Locked milestone title (#e9efdf, opacity .52)', hx('#e9efdf'), PANEL, 'lander tab', opacity=0.52, size='14px bold')
add('Disabled "Bank without sale" link (#abc0b6, .38)', hx('#abc0b6'), PANEL, 'service card', opacity=0.38, size='12px bold')

# Non-text: can a player tell a disabled button from an enabled one?
enabled_fill = BTN; disabled_fill = mix(BTN, PANEL, 0.38)
nontext = {
  'enabled button fill vs panel': ratio(enabled_fill, PANEL),
  'disabled button fill vs panel': ratio(disabled_fill, PANEL),
  'enabled primary fill vs panel': ratio(PRIMARY, PANEL),
  'disabled primary fill vs panel': ratio(mix(PRIMARY, PANEL, 0.38), PANEL),
  'disabled primary fill vs enabled button fill': ratio(mix(PRIMARY, PANEL, 0.38), BTN),
}
out = {'text': rows, 'non_text': nontext}
json.dump(out, open('/home/user/Motherload/docs/improvement-plan/work/menus/contrast.json', 'w'), indent=1)
for r in rows: print(f"{r['ratio']:5}  {'PASS' if r['AA_normal_4.5'] else 'FAIL'}  {r['element']}  [{r['where']}, {r['size']}]")
print(nontext)
