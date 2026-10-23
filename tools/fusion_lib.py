# Shared helpers for Fusion scripts (prepended to each part script via tools/fusion_mcp.py run).
# Convention: all dimensions in mm (Fusion API works in cm internally); each project documents its own axes.
import math
import adsk.core
import adsk.fusion

app = adsk.core.Application.get()
design = adsk.fusion.Design.cast(app.activeProduct)
root = design.rootComponent
FOP = adsk.fusion.FeatureOperations
NEW, JOIN, CUT = FOP.NewBodyFeatureOperation, FOP.JoinFeatureOperation, FOP.CutFeatureOperation


def cm(v):
    return v / 10.0


def V(v_mm):
    return adsk.core.ValueInput.createByReal(cm(v_mm))


def P3(x, y, z):
    return adsk.core.Point3D.create(cm(x), cm(y), cm(z))


def ensure_hybrid_design():
    """New "Untitled" docs are Part documents (one component only); assemblies need hybrid intent."""
    if design.designIntent != adsk.fusion.DesignIntentTypes.HybridDesignIntentType:
        design.designIntent = adsk.fusion.DesignIntentTypes.HybridDesignIntentType


def set_par(name, expr, unit="mm", comment=""):
    """Create or update a user parameter; expr is a Fusion expression string, e.g. '42 mm' or 'x_count * 42 mm'."""
    p = design.userParameters.itemByName(name)
    if p is None:
        design.userParameters.add(name, adsk.core.ValueInput.createByString(expr), unit, comment)
    else:
        p.expression = expr
    return design.userParameters.itemByName(name)


def par(name):
    """User parameter in mm (lengths) or raw (unitless)."""
    p = design.userParameters.itemByName(name)
    if p is None:
        raise KeyError("Missing parameter: " + name)
    return p.value * 10.0 if p.unit == "mm" else p.value


def new_component(name):
    """Delete all occurrences of component <name> and create it fresh (rebuild after parameter change)."""
    for i in range(root.occurrences.count - 1, -1, -1):
        occ = root.occurrences.item(i)
        if occ.component.name == name:
            occ.deleteMe()
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    occ.component.name = name
    return occ


def find_component(name):
    for i in range(root.occurrences.count):
        occ = root.occurrences.item(i)
        if occ.component.name == name:
            return occ
    raise KeyError("Missing component: " + name)


def plane(comp, axis, offset_mm):
    """Construction plane normal to axis ('x','y','z') at offset_mm."""
    base = {"x": comp.yZConstructionPlane, "y": comp.xZConstructionPlane, "z": comp.xYConstructionPlane}[axis]
    if abs(offset_mm) < 1e-9:
        return base
    pi = comp.constructionPlanes.createInput()
    pi.setByOffset(base, V(offset_mm))
    return comp.constructionPlanes.add(pi)


def mapper(axis, offset_mm):
    """(u, v) in the plane -> global point. x-plane: (u,v)=(y,z); z-plane: (u,v)=(x,y); y-plane: (u,v)=(x,z)."""
    if axis == "x":
        return lambda u, v: (offset_mm, u, v)
    if axis == "z":
        return lambda u, v: (u, v, offset_mm)
    return lambda u, v: (u, offset_mm, v)


class Sk:
    """Sketch on an axis-parallel plane, drawn in plane coordinates (u, v) in mm."""

    def __init__(self, comp, axis, offset_mm, name=None):
        self.comp = comp
        self.sk = comp.sketches.add(plane(comp, axis, offset_mm))
        if name:
            self.sk.name = name
        self.f = mapper(axis, offset_mm)
        self.lines = self.sk.sketchCurves.sketchLines
        self.arcs = self.sk.sketchCurves.sketchArcs
        self.circles = self.sk.sketchCurves.sketchCircles

    def p(self, u, v):
        return self.sk.modelToSketchSpace(P3(*self.f(u, v)))

    def poly(self, pts, closed=True):
        """Polyline through (u, v) points."""
        ls = []
        n = len(pts) if closed else len(pts) - 1
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            start = ls[-1].endSketchPoint if ls else self.p(*a)
            if closed and i == n - 1:
                ls.append(self.lines.addByTwoPoints(start, ls[0].startSketchPoint))
            else:
                ls.append(self.lines.addByTwoPoints(start, self.p(*b)))
        return ls

    def rrect(self, u0, v0, u1, v1, r):
        """Rectangle with corner radii r = (r_u0v0, r_u1v0, r_u1v1, r_u0v1) or a single radius."""
        ra, rb, rc, rd = r if isinstance(r, (tuple, list)) else (r, r, r, r)
        segs = [((u0 + ra, v0), (u1 - rb, v0)), ((u1, v0 + rb), (u1, v1 - rc)),
                ((u1 - rc, v1), (u0 + rd, v1)), ((u0, v1 - rd), (u0, v0 + ra))]
        corners = [((u1 - rb, v0 + rb), rb, -45), ((u1 - rc, v1 - rc), rc, 45),
                   ((u0 + rd, v1 - rd), rd, 135), ((u0 + ra, v0 + ra), ra, 225)]
        ls = [self.lines.addByTwoPoints(self.p(*a), self.p(*b)) for a, b in segs]
        for i, ((cu, cv), rr, ang) in enumerate(corners):
            nxt = ls[(i + 1) % 4]
            mid = self.p(cu + rr * math.cos(math.radians(ang)), cv + rr * math.sin(math.radians(ang)))
            self.arcs.addByThreePoints(ls[i].endSketchPoint, mid, nxt.startSketchPoint)

    def circle(self, u, v, d):
        return self.circles.addByCenterRadius(self.p(u, v), cm(d / 2.0))

    def teardrop(self, u, v, d, du_dir, dv_dir):
        """Teardrop (printable horizontal hole), tip pointing in direction (du_dir, dv_dir)."""
        r = d / 2.0
        a = math.atan2(dv_dir, du_dir)
        tip = (u + r * math.sqrt(2) * math.cos(a), v + r * math.sqrt(2) * math.sin(a))
        t1 = (u + r * math.cos(a + math.pi / 4), v + r * math.sin(a + math.pi / 4))
        t2 = (u + r * math.cos(a - math.pi / 4), v + r * math.sin(a - math.pi / 4))
        l1 = self.lines.addByTwoPoints(self.p(*t2), self.p(*tip))
        l2 = self.lines.addByTwoPoints(l1.endSketchPoint, self.p(*t1))
        back = (u - r * math.cos(a), v - r * math.sin(a))
        self.arcs.addByThreePoints(l2.endSketchPoint, self.p(*back), l1.startSketchPoint)

    def profiles(self):
        return [self.sk.profiles.item(i) for i in range(self.sk.profiles.count)]

    def all_profiles(self):
        oc = adsk.core.ObjectCollection.create()
        for p in self.profiles():
            oc.add(p)
        return oc

    def profile_with_loops(self, n):
        for p in self.profiles():
            if p.profileLoops.count == n:
                return p
        raise RuntimeError("No profile with %d loops" % n)

    def largest_profile(self):
        return max(self.profiles(), key=lambda p: p.areaProperties().area)


def extrude(comp, prof, dist_mm, op, negative=False, bodies=None, name=None, taper_deg=0.0):
    ext = comp.features.extrudeFeatures
    ei = ext.createInput(prof, op)
    direction = adsk.fusion.ExtentDirections.NegativeExtentDirection if negative else adsk.fusion.ExtentDirections.PositiveExtentDirection
    if taper_deg:
        ei.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(V(dist_mm)), direction,
                            adsk.core.ValueInput.createByString("%g deg" % taper_deg))
    else:
        ei.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(V(dist_mm)), direction)
    if bodies is not None:
        ei.participantBodies = list(bodies)
    f = ext.add(ei)
    if name:
        f.name = name
    return f


def bb_mm(entity):
    b = entity.boundingBox
    return (b.minPoint.x * 10, b.minPoint.y * 10, b.minPoint.z * 10,
            b.maxPoint.x * 10, b.maxPoint.y * 10, b.maxPoint.z * 10)


def edges_where(body, pred):
    """Edges whose bounding box (mm: x0,y0,z0,x1,y1,z1) satisfies the predicate."""
    return [body.edges.item(i) for i in range(body.edges.count) if pred(bb_mm(body.edges.item(i)))]


def near(a, b, tol=0.01):
    return abs(a - b) < tol


def fillet(comp, edges, r_mm, name=None):
    if not edges:
        raise RuntimeError("Fillet without edges: " + str(name))
    oc = adsk.core.ObjectCollection.create()
    for e in edges:
        oc.add(e)
    fi = comp.features.filletFeatures.createInput()
    fi.edgeSetInputs.addConstantRadiusEdgeSet(oc, V(r_mm), True)
    f = comp.features.filletFeatures.add(fi)
    if name:
        f.name = name
    return f


def chamfer(comp, edges, d_mm, name=None):
    if not edges:
        raise RuntimeError("Chamfer without edges: " + str(name))
    oc = adsk.core.ObjectCollection.create()
    for e in edges:
        oc.add(e)
    ci = comp.features.chamferFeatures.createInput2()
    ci.chamferEdgeSets.addEqualDistanceChamferEdgeSet(oc, V(d_mm), True)
    f = comp.features.chamferFeatures.add(ci)
    if name:
        f.name = name
    return f


def report(comp):
    for i in range(comp.bRepBodies.count):
        b = comp.bRepBodies.item(i)
        x0, y0, z0, x1, y1, z1 = bb_mm(b)
        vol = b.physicalProperties.volume  # cm^3
        print("%-22s X %7.2f..%7.2f  Y %7.2f..%7.2f  Z %7.2f..%7.2f  | %.1f x %.1f x %.1f mm  V=%.1f cm3  solid=%s"
              % (b.name, x0, x1, y0, y1, z0, z1, x1 - x0, y1 - y0, z1 - z0, vol, b.isSolid))
