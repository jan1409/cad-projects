# Make sure the Onshape reference STEP for this configuration is open in its own document, tagged gridfinity/ref = <tag>.
# The first, untagged import (5x4x6) is tagged on the fly. Re-activates the build document afterwards.
import os

REF_DIR = r"D:\CreativeProjects\CAD_Projects\Gridfinity\reference"


def _designs():
    for i in range(app.documents.count):
        doc = app.documents.item(i)
        prod = doc.products.itemByProductType("DesignProductType")
        if prod is not None:
            yield doc, adsk.fusion.Design.cast(prod)


def run(_context: str):
    tag = CFG["tag"]
    build_doc = None
    found = False
    for doc, d in _designs():
        role = d.attributes.itemByName("gridfinity", "role")
        ref = d.attributes.itemByName("gridfinity", "ref")
        if role is not None:
            build_doc = doc
        elif ref is None and any(d.rootComponent.occurrences.item(k).component.name == "Base" for k in range(d.rootComponent.occurrences.count)):
            d.attributes.add("gridfinity", "ref", "5x4x6")  # first manual import
            ref = d.attributes.itemByName("gridfinity", "ref")
        if ref is not None and ref.value == tag:
            found = True
    if not found:
        path = os.path.join(REF_DIR, tag, "case_%s.step" % tag)
        if not os.path.exists(path):
            raise RuntimeError("no reference STEP " + path)
        im = app.importManager
        im.importToNewDocument(im.createSTEPImportOptions(path))
        d = adsk.fusion.Design.cast(app.activeProduct)
        d.attributes.add("gridfinity", "ref", tag)
        print("imported reference", path)
    else:
        print("reference %s already open" % tag)
    if build_doc is not None:
        build_doc.activate()
