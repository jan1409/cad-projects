# Activate (or create) the build document of CFG["model"], tagged skadis/role = <model>-build,
# and write all parameters as user parameters (documentation; the steps read CFG).
ATTR_GROUP, ATTR_NAME = "skadis", "role"


def _find_build_doc(value):
    for i in range(app.documents.count):
        doc = app.documents.item(i)
        prod = doc.products.itemByProductType("DesignProductType")
        if prod is None:
            continue
        attr = adsk.fusion.Design.cast(prod).attributes.itemByName(ATTR_GROUP, ATTR_NAME)
        if attr is not None and attr.value == value:
            return doc
    return None


def run(_context: str):
    global design, root
    value = CFG["model"] + "-build"
    doc = _find_build_doc(value)
    created = doc is None
    if created:
        doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    else:
        doc.activate()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    if created:
        design.attributes.add(ATTR_GROUP, ATTR_NAME, value)
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
    ensure_hybrid_design()
    n = 0
    for prefix, values in (("sk_", CFG["skadis"]), ("p_", CFG.get("params", {}))):
        for k, v in sorted(values.items()):
            set_par(prefix + k, "%r" % float(v), unit="")
            n += 1
    print("build doc:", doc.name, "(new)" if created else "(existing)", "| model", CFG["model"], "|", n, "parameters",
          "| tab %.2f x gap %.2f" % (CFG["skadis"]["tab_w"], CFG["skadis"]["tab_gap"]))
