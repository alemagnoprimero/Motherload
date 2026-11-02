# Feel audit: share of the screen that is uniform undiscovered fog at the surface start.
# Usage: python3 fog-share.py <png> <first_row_px> <last_row_px>
import sys
from PIL import Image
path, y0, y1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()
dark = total = 0
for y in range(y0, min(y1, H)):
    for x in range(0, W, 4):
        r, g, b = px[x, y]
        total += 1
        if r < 45 and g < 55 and b < 65:
            dark += 1
print(f"{path}: size {W}x{H}; rows {y0}-{y1}: {dark/total:.3f} dark fog; rows are {(min(y1,H)-y0)/H:.3f} of screen height")
