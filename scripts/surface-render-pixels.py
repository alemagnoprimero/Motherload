"""Compare real GPU surface sprites to a CPU draw of their production atlas frames."""
import json
import sys
from PIL import Image, ImageChops, ImageFilter, ImageStat

actual = Image.open(sys.argv[1]).convert("RGB")
source = Image.open(sys.argv[2]).convert("RGBA")
assert actual.size == source.size, (actual.size, source.size)
expected = Image.new("RGBA", source.size, (23, 35, 43, 255))
expected.alpha_composite(source)
diff = ImageChops.difference(actual, expected.convert("RGB"))
histogram = diff.histogram()
histogram = [sum(histogram[channel * 256 + value] for channel in range(3)) for value in range(256)]
total = sum(histogram)
cumulative = 0
p95 = 0
for value, count in enumerate(histogram):
    cumulative += count
    if cumulative >= total * .95:
        p95 = value
        break
transparent = opaque = clear_errors = opaque_errors = 0
# Compare opaque interiors separately from outline resampling. The whole-image
# mean still includes every edge; different browser rasterizers need not draw
# a one-pixel diagonal identically to Canvas2D to preserve the actual artwork.
expected_rgb = expected.convert("RGB")
high = expected_rgb.filter(ImageFilter.MaxFilter(3))
low = expected_rgb.filter(ImageFilter.MinFilter(3))
for got, want, rgba, hi, lo in zip(actual.getdata(), expected_rgb.getdata(), source.getdata(), high.getdata(), low.getdata()):
    error = max(abs(a - b) for a, b in zip(got, want))
    if rgba[3] == 0:
        transparent += 1
        clear_errors += error > 12
    if rgba[3] == 255 and max(a - b for a, b in zip(hi, lo)) <= 12:
        opaque += 1
        opaque_errors += error > 35
print(json.dumps({
    "meanChannelError": sum(ImageStat.Stat(diff).mean) / 3,
    "p95ChannelError": p95,
    "transparentPixels": transparent,
    "transparentMismatchFraction": clear_errors / max(1, transparent),
    "opaquePixels": opaque,
    "opaqueMismatchFraction": opaque_errors / max(1, opaque),
}))
