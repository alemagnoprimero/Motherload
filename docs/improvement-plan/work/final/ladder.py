import itertools
ref = (30, 60, 100, 250)
def comps(vals, total, n=7):
    out = []
    for a in range(n + 1):
        for b in range(n + 1 - a):
            c = n - a - b
            if a * vals[0] + b * vals[1] + c * vals[2] == total:
                out.append((a, b, c))
    return out
res = []
for v1 in range(18, 29):
    for v2 in range(45, 75):
        for v3 in range(110, 181, 5):
            for v4 in range(300, 501, 25):
                vals = (v1, v2, v3, v4)
                if any(v == r for v, r in zip(vals, ref)):
                    continue
                mean = (60 * v1 + 30 * v2 + 9 * v3 + v4) / 100
                if not 47.0 <= mean <= 48.0:
                    continue
                A = comps(vals, 380); B = comps(vals, 480)
                if A and B:
                    roundness = sum(v % 5 == 0 for v in vals) + sum(v % 10 == 0 for v in vals)
                    res.append((roundness, v4 / v1, vals, round(mean, 2), A, B))
res.sort(key=lambda r: (-r[0], -r[1]))
for r in res[:25]:
    print(r)
print(len(res))
