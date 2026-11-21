"""Minimal 3MF writer (3MF core spec, mm): one object per mesh, placed where its vertices are.

PrusaSlicer opens these as separate objects at their positions (slice with --dont-arrange to keep them).
Usage (library): write_3mf(path, [(name, vertices Nx3, faces Mx3), ...]). Stdlib only.
"""
import zipfile
from xml.sax.saxutils import quoteattr

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
"""
RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""


def write_3mf(path, objects, title=None):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">']
    if title:
        out.append(' <metadata name="Title">%s</metadata>' % title)
    out.append(' <resources>')
    for i, (name, verts, faces) in enumerate(objects, start=1):
        out.append('  <object id="%d" name=%s type="model"><mesh><vertices>' % (i, quoteattr(name)))
        out.extend('<vertex x="%.5f" y="%.5f" z="%.5f"/>' % (v[0], v[1], v[2]) for v in verts)
        out.append('</vertices><triangles>')
        out.extend('<triangle v1="%d" v2="%d" v3="%d"/>' % (f[0], f[1], f[2]) for f in faces)
        out.append('</triangles></mesh></object>')
    out.append(' </resources>')
    out.append(' <build>')
    out.extend('  <item objectid="%d"/>' % i for i in range(1, len(objects) + 1))
    out.append(' </build>')
    out.append('</model>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", "\n".join(out))
