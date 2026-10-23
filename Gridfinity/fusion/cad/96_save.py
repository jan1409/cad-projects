# Save the build document to the Fusion project PROJECT_NAME (created if missing) as DOC_NAME,
# or save a new version if it is already saved. Only run on an explicit request.
PROJECT_NAME = "Gridfinity Tools"
DOC_NAME = "Gridfinity Rugged Case"


def run(_context: str):
    doc = app.activeDocument
    attr = design.attributes.itemByName("gridfinity", "role")
    if attr is None or attr.value != "case-build":
        raise RuntimeError("active document is not the case build document (run the 'doc' step first)")
    env = case_env()
    desc = "Gridfinity Rugged Case %dx%dx%d, window %.2f mm, gap %.2f mm (built by Gridfinity/fusion/build.py)" % (
        env["x_count"], env["y_count"], env["z_count"], env["window_t"], env["window_gap"])
    if doc.isSaved:
        print("saved new version:", doc.save(desc), "|", doc.name)
        return
    projects = app.data.dataProjects
    project = next((projects.item(i) for i in range(projects.count) if projects.item(i).name == PROJECT_NAME), None)
    if project is None:
        project = projects.add(PROJECT_NAME)
        print("created project", PROJECT_NAME)
    ok = doc.saveAs(DOC_NAME, project.rootFolder, desc, "")
    print("saved:", ok, "| project:", project.name, "| document:", DOC_NAME)
