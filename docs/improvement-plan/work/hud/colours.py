"""Colour-state distinguishability of HUD gauge states (CIE76 dE, normal and simulated CVD)."""
import json
import numpy as np

def srgb_to_lin(c):
    c = np.asarray(c, float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def lin_to_xyz(l):
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    return M @ l

def xyz_to_lab(x):
    w = np.array([0.95047, 1.0, 1.08883]); t = x / w
    f = np.where(t > 216 / 24389, np.cbrt(t), (24389 / 27 * t + 16) / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])

# Machado et al. 2009, severity 1.0, applied in linear RGB
CVD = {
    "deuteranopia": np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]),
    "protanopia": np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]),
    "tritanopia": np.array([[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]),
}

def lab(hexstr, sim=None):
    rgb = [int(hexstr[i:i + 2], 16) for i in (0, 2, 4)]
    l = srgb_to_lin(rgb)
    if sim is not None:
        l = np.clip(CVD[sim] @ l, 0, 1)
    return xyz_to_lab(lin_to_xyz(l))

pairs = {
    "energy normal vs critical (#8bdce2 vs #ffce78)": ("8bdce2", "ffce78"),
    "hull normal vs critical (#e5a494 vs #ed957f)": ("e5a494", "ed957f"),
    "hull bar vs energy-critical bar (#e5a494 vs #ffce78)": ("e5a494", "ffce78"),
    "mission pending vs carried glyph (#a6bcb1 vs #f0c584)": ("a6bcb1", "f0c584"),
    "mission complete vs pending glyph (#9cdec6 vs #a6bcb1)": ("9cdec6", "a6bcb1"),
    "signal tracking vs nearby (#a1b8aa vs #f0cc8d)": ("a1b8aa", "f0cc8d"),
    "signal nearby vs very close (#f0cc8d vs #c2eada)": ("f0cc8d", "c2eada"),
}
out = {}
for name, (a, b) in pairs.items():
    row = {"normal": round(float(np.linalg.norm(lab(a) - lab(b))), 1)}
    for sim in CVD:
        row[sim] = round(float(np.linalg.norm(lab(a, sim) - lab(b, sim))), 1)
    out[name] = row
    print(f"{name:58s} " + "  ".join(f"{k}={v}" for k, v in row.items()))
json.dump(out, open("data/colour-states.json", "w"), indent=1)
