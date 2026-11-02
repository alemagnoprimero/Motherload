ref = (30, 60, 100, 250)
def comps(vals, total, n=7):
    return [(a, b, n - a - b) for a in range(n + 1) for b in range(n + 1 - a)
            if a * vals[0] + b * vals[1] + (n - a - b) * vals[2] == total]
out = []
for v1 in range(22, 30):
    for v2 in range(45, 80):
        for v3 in range(105, 200):
            for v4 in range(300, 501, 5):
                vals = (v1, v2, v3, v4)
                if any(v == r for v, r in zip(vals, ref)):
                    continue
                if 60 * v1 + 30 * v2 + 9 * v3 + v4 != 4750:
                    continue
                A, B = comps(vals, 380), comps(vals, 480)
                if A and B:
                    out.append((sum(v % 5 == 0 for v in vals), vals, A, B))
out.sort(key=lambda r: -r[0])
for r in out[:20]:
    print(r)
print(len(out))
