"""Fit-test plates for the core star (X1C 256 x 256, centred on (128, 128))."""
import sys, os, numpy as np, trimesh
sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
from threemf import write_3mf
D = "Christmas/export/fit_test_core"
def place(f, x, y, rotz=0):
    m = trimesh.load(os.path.join(D, f), force="mesh")
    if rotz:
        m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(rotz), [0, 0, 1]))
    lo, hi = m.bounds
    m.apply_translation([x - lo[0], y - lo[1], -lo[2]])
    return m
def plate(path, items):
    ms = [(n, place(f, x, y, r)) for n, f, x, y, r in items]
    lo = np.min([m.bounds[0] for _, m in ms], axis=0); hi = np.max([m.bounds[1] for _, m in ms], axis=0)
    sh = np.array([128, 128, 0]) - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0])
    objs = []
    for n, m in ms:
        m.apply_translation(sh)
        objs.append((n, m.vertices, m.faces))
    lo2 = np.min([m.bounds[0] for _, m in ms], axis=0); hi2 = np.max([m.bounds[1] for _, m in ms], axis=0)
    # overlap check of footprints
    boxes = [(m.bounds[0][:2], m.bounds[1][:2], n) for n, m in ms]
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            if (a[0] < b[1]).all() and (b[0] < a[1]).all():
                print("  OVERLAP", a[2], b[2])
    write_3mf(path, objs)
    print(path, "extent", lo2.round(1), hi2.round(1))
plate(os.path.join(D, "Passprobe_A_Kern_und_Zacken_PLA.3mf"), [
    ("K Kernkrone", "K_Kernkrone.stl", 0, 0, 90),
    ("L Lampenplatte", "L_Lampenplatte.stl", 163, 0, 0),
    ("D Dreieck Vorspannung 0.2", "D_Dreieck_Vorspannung_0.2.stl", 163, 66, 0),
    ("Q1 Quadrat Vorspannung 0.1 (1 Kerbe)", "Q1_Quadrat_Vorspannung_0.1_1Kerbe.stl", 0, 127, 0),
    ("Q2 Quadrat Vorspannung 0.2 (2 Kerben)", "Q2_Quadrat_Vorspannung_0.2_2Kerben.stl", 70, 127, 0),
    ("Q3 Quadrat Vorspannung 0.3 (3 Kerben)", "Q3_Quadrat_Vorspannung_0.3_3Kerben.stl", 140, 127, 0),
])
plate(os.path.join(D, "Passprobe_B_Spitze_PLA.3mf"), [
    ("S Spitze Haelfte 1", "S_Spitze_Haelfte.stl", 0, 0, 0),
    ("S Spitze Haelfte 2", "S_Spitze_Haelfte.stl", 75, 0, 0),
    ("H Spitzenhuelse", "H_Spitzenhuelse.stl", 150, 20, 0),
])
