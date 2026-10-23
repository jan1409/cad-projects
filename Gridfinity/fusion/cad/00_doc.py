# Activate (or create) the build document, tagged with the attribute gridfinity/role = case-build,
# and set the case input parameters from CFG.
ATTR_GROUP, ATTR_NAME, ATTR_VALUE = "gridfinity", "role", "case-build"


def _find_build_doc():
    for i in range(app.documents.count):
        doc = app.documents.item(i)
        prod = doc.products.itemByProductType("DesignProductType")
        if prod is None:
            continue
        attr = adsk.fusion.Design.cast(prod).attributes.itemByName(ATTR_GROUP, ATTR_NAME)
        if attr is not None and attr.value == ATTR_VALUE:
            return doc
    return None


def run(_context: str):
    global design, root
    doc = _find_build_doc()
    if doc is None:
        doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        created = True
    else:
        doc.activate()
        created = False
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    if created:
        design.attributes.add(ATTR_GROUP, ATTR_NAME, ATTR_VALUE)
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
    ensure_case_params(CFG)
    env = case_env()
    print("build doc:", doc.name, "(new)" if created else "(existing)",
          "| x,y,z = %d,%d,%d  window_t = %.2f gap %.2f" % (env["x_count"], env["y_count"], env["z_count"], env["window_t"], env["window_gap"]),
          "| split %.2f top %.2f hinge_x %.2f" % (env["split"], env["top"], env["hinge_x"]))
