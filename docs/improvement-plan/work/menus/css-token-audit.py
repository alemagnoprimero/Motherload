"""Static audit of src/campaign/style.css: colour literals, custom properties, type and spacing values."""
import re, collections, json
css = open('/home/user/Motherload/src/campaign/style.css').read()
hexes = re.findall(r'#[0-9a-fA-F]{3,8}\b', css)
out = {
  'lines': css.count('\n'),
  'hex_literals_total': len(hexes),
  'unique_hex': len(collections.Counter(h.lower() for h in hexes)),
  'custom_properties_defined': sorted(set(re.findall(r'(--[\w-]+)\s*:', css))),
  'var_uses': dict(collections.Counter(re.findall(r'var\((--[\w-]+)', css))),
  'font_sizes': dict(collections.Counter(re.findall(r'font-size:\s*([^;]+);', css))),
  'letter_spacings': dict(collections.Counter(re.findall(r'letter-spacing:\s*([^;]+);', css))),
  'unique_padding_values': len(set(re.findall(r'padding:\s*([^;]+);', css))),
  'unique_gap_values': len(set(re.findall(r'\bgap:\s*([^;]+);', css))),
  'media_queries': [m.strip() for m in re.findall(r'@media[^{]+', css)],
  'keyframes': len(re.findall(r'@keyframes', css)),
  'font_face': len(re.findall(r'@font-face', css)),
  'font_family': re.findall(r'font-family:\s*([^;]+);', css),
}
json.dump(out, open('/home/user/Motherload/docs/improvement-plan/work/menus/css-token-audit.json', 'w'), indent=1)
print({k: (v if not isinstance(v, (list, dict)) or len(str(v)) < 200 else str(v)[:200]) for k, v in out.items()})
