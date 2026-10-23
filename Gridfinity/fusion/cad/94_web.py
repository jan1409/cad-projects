# Import the browser generator's STEP (CFG["web_step"]) into its own document tagged gridfinity/web = <tag>,
# replacing an earlier import of the same tag (closed without saving - these are throw-away comparison documents).
# Re-activates the build document afterwards. Compare with: --steps bdiff and CFG["against"] = "web".
def run(_context: str):
    tag = CFG["tag"]
    build_doc = None
    for i in range(app.documents.count - 1, -1, -1):
        doc = app.documents.item(i)
        prod = doc.products.itemByProductType("DesignProductType")
        if prod is None:
            continue
        d = adsk.fusion.Design.cast(prod)
        web = d.attributes.itemByName("gridfinity", "web")
        if web is not None and web.value == tag:
            doc.close(False)
        elif d.attributes.itemByName("gridfinity", "role") is not None:
            build_doc = doc
    im = app.importManager
    im.importToNewDocument(im.createSTEPImportOptions(CFG["web_step"]))
    d = adsk.fusion.Design.cast(app.activeProduct)
    d.attributes.add("gridfinity", "web", tag)
    names = [d.rootComponent.occurrences.item(k).component.name for k in range(d.rootComponent.occurrences.count)]
    print("imported", CFG["web_step"], "components:", names)
    if build_doc is not None:
        build_doc.activate()
