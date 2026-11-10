"""T8 evidence: side-by-side frames, each labelled, scaled to a common height.

Usage: python3 docs/qa/t8-scan-annotations/pairs.py OUT.png HEIGHT \
         "label one=path/one.png" "label two=path/two.png" ...

Each frame is scaled to HEIGHT px, keeping its proportions, with its label in
a strip above it.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

out, height = sys.argv[1], int(sys.argv[2])
panels = [arg.split("=", 1) for arg in sys.argv[3:]]
strip = 34
try:
    font = ImageFont.truetype("assets/ui/fonts/Inter.ttf", 20)
except OSError:
    font = ImageFont.load_default()
images = []
for label, path in panels:
    image = Image.open(path).convert("RGB")
    width = round(image.width * height / image.height)
    images.append((label, image.resize((width, height), Image.LANCZOS)))
gap = 12
total = sum(image.width for _, image in images) + gap * (len(images) - 1)
sheet = Image.new("RGB", (total, height + strip), (16, 25, 32))
draw = ImageDraw.Draw(sheet)
x = 0
for label, image in images:
    sheet.paste(image, (x, strip))
    draw.text((x + 6, 6), label, fill=(230, 236, 221), font=font)
    x += image.width + gap
sheet.save(out, quality=86, optimize=True) if out.endswith(".jpg") else sheet.save(out, optimize=True)
print(out, sheet.size)
