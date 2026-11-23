import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.spatial import HalfspaceIntersection, ConvexHull
from geom import faces, derived, P
d = derived(P); F = faces()
def vol(ds, dt):
    hs = np.array([list(f['n']) + [-(ds if f['kind'] == 'sq' else dt)] for f in F])
    h = HalfspaceIntersection(hs, np.zeros(3)); c = ConvexHull(h.intersections)
    return c.volume, h.intersections.min(0), h.intersections.max(0)
vo, lo, hi = vol(d['Rs'] - d['er'], d['Rt'] - d['er']); vi, _, _ = vol(d['Rs'] - d['hf'], d['Rt'] - d['hf'])
print('outer', vo, lo, hi); print('inner', vi); print('shell', vo - vi)
