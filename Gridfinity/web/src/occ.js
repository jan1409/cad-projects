// OpenCascade boolean helpers shared by the box modules (src/bin.js, src/insert.js).
// replicad's fuse/cut end with UnifySameDomain, which can throw after a successful boolean: fall back to the raw one.
export function occHelpers(R) {
  const rawBool = (cls, a, b) => {
    const bld = new (R.getOC()[cls])(a.wrapped, b.wrapped);
    bld.Build();
    const s = R.cast(bld.Shape());
    bld.delete();
    return s;
  };
  const fuse = (a, b) => { try { return a.fuse(b); } catch { return rawBool("BRepAlgoAPI_Fuse", a, b); } };
  const cut = (a, b) => { try { return a.cut(b); } catch { return rawBool("BRepAlgoAPI_Cut", a, b); } };
  const common = (a, b) => { try { return a.intersect(b); } catch { return rawBool("BRepAlgoAPI_Common", a, b); } };
  const step = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      throw new Error(`${label} failed (${e?.message || "geometry kernel exception"})`);
    }
  };
  return { rawBool, fuse, cut, common, step };
}
