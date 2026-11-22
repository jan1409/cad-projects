"""Slice a painted 3MF with a slicer's CLI and report which filament prints each layer of the object.

Checks that a multi-colour 3MF (e.g. Christmas/web: paint per triangle) slices into the colour bands it should, and
compares them with a reference (Christmas/reference/tree_paint_reference.json: the bands of a print sliced by hand).

  python -I tools/slice_paint_check.py --slicer prusa|bambu|orca FILE.3mf [--expect REF.json] [--extra T:z0-z1] [--settings CFG] [--keep DIR]
  python -I tools/slice_paint_check.py --gcode FILE.gcode|FILE.gcode.3mf [--expect REF.json]

Slicers (override the executables with PRUSASLICER / BAMBUSTUDIO / ORCASLICER):
  prusa  prusa-slicer-console.exe with Original Prusa XL - 5T Input Shaper 0.4, 0.20mm STRUCTURAL @XLIS 0.4,
         Generic PLA @XLIS, placed at the bed centre (--center 180,180)
  bambu  bambu-studio.exe / orca-slicer.exe (also found in the Microsoft Store folder WindowsApps) on a temporary
  orca   Bambu project made from the 3MF: the complete settings of a real project (--settings; default
         Christmas/reference/bambu_x1c_2pla_project_settings.config: X1C 0.4, 0.20mm Standard, 2 x PLA), the object at
         the plate centre, and the tags each CLI accepts (Orca refuses a project from a newer Bambu Studio). Their CLIs
         cannot use the system presets directly (inherited values stay unresolved; two different filament files crash
         Bambu's), so the slice tests the paint codes, not how the slicer opens a 3MF without settings: check that once
         in its window.
Layers are counted from 0; tools as in the G-code (T0 = filament 1). Stdlib only.
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.stdout.reconfigure(encoding="utf-8")

PF = os.environ.get("ProgramFiles", r"C:\Program Files")
EXE = {
    "prusa": os.environ.get("PRUSASLICER", os.path.join(PF, "Prusa3D", "PrusaSlicer", "prusa-slicer-console.exe")),
    "bambu": os.environ.get("BAMBUSTUDIO", os.path.join(PF, "Bambu Studio", "bambu-studio.exe")),
    "orca": os.environ.get("ORCASLICER", os.path.join(PF, "OrcaSlicer", "orca-slicer.exe")),
}
if not os.path.exists(EXE["orca"]):  # the Microsoft Store install (newest version)
    _store = sorted(glob.glob(os.path.join(PF, "WindowsApps", "OrcaSlicer.OrcaSlicer_*", "orca-slicer.exe")))
    if _store:
        EXE["orca"] = _store[-1]
ENV = {"prusa": "PRUSASLICER", "bambu": "BAMBUSTUDIO", "orca": "ORCASLICER"}
PRUSA = {"printer": "Original Prusa XL - 5T Input Shaper 0.4 nozzle", "print": "0.20mm STRUCTURAL @XLIS 0.4",
         "material": "Generic PLA @XLIS", "centre": "180,180"}
SETTINGS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Christmas", "reference", "bambu_x1c_2pla_project_settings.config")
BED_CENTRE = (128, 128)  # X1C plate
SKIP_FEATURES = re.compile(r"wipe tower|prime tower|skirt|brim|purge|flush", re.I)


# ---------------------------------------------------------------- G-code
def layer_tools(lines):
    """[(z, {tools})] per layer: the tools that extrude the object (not towers, skirt or brim)."""
    layers, tool, feature, z, cur = [], None, "", None, None
    for line in lines:
        if line.startswith(";LAYER_CHANGE") or line.startswith("; CHANGE_LAYER"):
            cur = set()
            layers.append([None, cur])
            continue
        m = re.match(r";Z:([\d.]+)|; Z_HEIGHT: ([\d.]+)", line)
        if m and layers and layers[-1][0] is None:
            layers[-1][0] = float(m.group(1) or m.group(2))
            continue
        m = re.match(r";TYPE:(.*)|; FEATURE: (.*)", line)
        if m:
            feature = (m.group(1) or m.group(2)).strip()
            continue
        # tool selection: T<n>; Bambu/Orca also select a filament with M620 S<n>A before loading it
        m = re.match(r"T(\d+)\b|M620 S(\d+)A", line)
        if m and int(m.group(1) or m.group(2)) < 64:
            tool = int(m.group(1) or m.group(2))
            continue
        # printing: a move in X/Y that extrudes (relative E), not a de-retraction or a purge on the spot
        if cur is not None and tool is not None and line[:3] in ("G1 ", "G2 ", "G3 ") and not SKIP_FEATURES.search(feature):
            code = line.split(";")[0]
            m = re.search(r"\bE(-?[\d.]+)", code)
            if m and float(m.group(1)) > 0 and re.search(r"\b[XY]-?[\d.]", code):
                cur.add(tool)
    return [(z, tools) for z, tools in layers if tools]


def runs(layers):
    """Consecutive layers with the same tools: [(tools tuple, first, last, z_first, z_last)]."""
    out = []
    for i, (z, tools) in enumerate(layers):
        key = tuple(sorted(tools))
        if out and out[-1][0] == key:
            out[-1][2], out[-1][4] = i, z
        else:
            out.append([key, i, i, z, z])
    return [tuple(r) for r in out]


def read_gcode(path):
    if path.endswith(".3mf"):
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if re.match(r"Metadata/plate_\d+\.gcode$", n)]
            if not names:
                raise SystemExit(f"{path}: no G-code inside")
            return z.read(names[0]).decode("utf-8", "replace").splitlines()
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read().splitlines()


# ---------------------------------------------------------------- Bambu Studio / OrcaSlicer project wrapper
# tags that make each CLI load the project's settings: Bambu Studio wants its own Application tag; OrcaSlicer refuses a
# project from a newer Bambu Studio (exit -24) and takes the tags it writes itself (OrcaSlicer 2.5.1)
PROJECT_TAGS = {
    "bambu": [("Application", "BambuStudio-02.09.01.70")],
    "orca": [("Application", "BambuStudio-02.08.01.55"), ("OrcaSlicer", "2.5.1")],
}


def move_items(model, x, y):
    """Every build item moved by (x, y): items without a transform get one, items with one keep their offset to the
    others (e.g. a star lying beside its tree)."""
    def item(m):
        nums = [float(v) for v in m.group(2).split()] if m.group(2) else [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
        nums[9] += x
        nums[10] += y
        return b'<item objectid="%s" transform="%s"/>' % (m.group(1), " ".join("%g" % v for v in nums).encode())
    return re.sub(rb'<item objectid="(\d+)"(?:\s+transform="([^"]*)")?\s*/>', item, model)


def bambu_project(src, dst, settings, x, y, slicer="bambu"):
    """Copy of a painted 3MF as a Bambu/Orca project: the complete settings of a real project (machine, process and its
    filaments), the tags that make the CLI load them, and the objects moved onto the plate (centred at x, y).
    The meshes and their paint_color attributes stay as they are."""
    meta = "".join(f'\n <metadata name="{k}">{v}</metadata>' for k, v in PROJECT_TAGS[slicer]).encode()
    with zipfile.ZipFile(src) as z, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as o:
        for n in z.namelist():
            d = z.read(n)
            if n == "3D/3dmodel.model":
                d = move_items(d, x, y)
                d = re.sub(rb"(<model [^>]*>)", lambda m: m.group(1) + meta, d, count=1)
            o.writestr(n, d)
        with open(settings, "rb") as fh:
            o.writestr("Metadata/project_settings.config", fh.read())


# ---------------------------------------------------------------- slicing
def slice_file(slicer, path, work, settings):
    exe = EXE[slicer]
    if not os.path.exists(exe):
        raise SystemExit(f"{slicer}: {exe} not found (set {ENV[slicer]})")
    if slicer == "prusa":
        out = os.path.join(work, "out.gcode")
        cmd = [exe, "--datadir", os.path.join(os.environ["APPDATA"], "PrusaSlicer"),
               "--printer-profile", PRUSA["printer"], "--print-profile", PRUSA["print"], "--material-profile", PRUSA["material"],
               "--center", PRUSA["centre"], "--no-binary-gcode", "--export-gcode", "-o", out, path]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if not os.path.exists(out):
            raise SystemExit(f"prusa: slicing failed\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
        return out
    wrapped = os.path.join(work, "project.3mf")
    bambu_project(path, wrapped, settings, *BED_CENTRE, slicer=slicer)
    outdir = os.path.join(work, "out")
    os.makedirs(outdir, exist_ok=True)
    r = subprocess.run([exe, "--slice", "0", "--outputdir", outdir, "--export-3mf", "sliced.gcode.3mf", wrapped], capture_output=True, text=True)
    sliced = os.path.join(outdir, "sliced.gcode.3mf")
    if not os.path.exists(sliced):
        res = os.path.join(outdir, "result.json")
        why = open(res, encoding="utf-8").read() if os.path.exists(res) else (r.stdout + r.stderr)[-2000:] or "no result (crashed?)"
        raise SystemExit(f"{slicer}: slicing failed\n{why}")
    return sliced


def expected_runs(ref, extras=()):
    """Expected runs: the band layers use tool ref['band_tool'], the others ref['main_tool']; each extra (tool, z0, z1)
    adds its tool to the layers whose middle lies between z0 and z1 (a second object, e.g. a star printed beside)."""
    layer, band = ref.get("layer_height", 0.2), set()
    for x, y in ref["band_layers"]:
        band.update(range(x, y + 1))
    sets = []
    for i in range(ref["layers"]):
        tools = {ref["band_tool"] if i in band else ref["main_tool"]}
        tools.update(tool for tool, z0, z1 in extras if z0 < (i + 0.5) * layer < z1)
        sets.append(tuple(sorted(tools)))
    want = []
    for i, tools in enumerate(sets):
        if want and want[-1][0] == tools:
            want[-1][2] = i
        else:
            want.append([tools, i, i])
    return [tuple(w) for w in want]


def compare(rs, ref, extras=()):
    want = expected_runs(ref, extras)
    got = [(r[0], r[1], r[2]) for r in rs]
    return got == want, want


def reference_from_bands(spec, height, layer=0.2):
    """A reference from band heights "z0-z1,z0-z1,...": a layer is a band layer when its middle lies in a band
    (the slicers colour a layer by its slice plane, the layer's mid height)."""
    bands = [tuple(float(v) for v in b.split("-")) for b in spec.split(",")]
    n = round(height / layer)
    flags = [any(z0 < (i + 0.5) * layer < z1 for z0, z1 in bands) for i in range(n)]
    runs_, i = [], 0
    while i < n:
        j = i
        while j + 1 < n and flags[j + 1] == flags[i]:
            j += 1
        if flags[i]:
            runs_.append([i, j])
        i = j + 1
    return {"layers": n, "main_tool": 0, "band_tool": 1, "band_layers": runs_}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("file", nargs="?")
    ap.add_argument("--slicer", choices=["prusa", "bambu", "orca"])
    ap.add_argument("--gcode")
    ap.add_argument("--expect", help="reference JSON (band_layers, layers, main_tool, band_tool)")
    ap.add_argument("--bands", help='expected bands instead: "z0-z1,z0-z1,..." with --height (0.2 mm layers)')
    ap.add_argument("--height", type=float)
    ap.add_argument("--extra", action="append", default=[],
                    help='a second object\'s tool in its layers: "TOOL:z0-z1", e.g. "2:0-5" (a star in filament 3, 5 mm thick)')
    ap.add_argument("--settings", default=SETTINGS, help="Bambu project settings for bambu/orca")
    ap.add_argument("--keep", help="keep the work folder (project, G-code) here")
    a = ap.parse_args()
    # absolute: OrcaSlicer from the Microsoft Store (WindowsApps) does not start in the caller's folder
    work = os.path.abspath(a.keep or tempfile.mkdtemp(prefix="slice-paint-"))
    os.makedirs(work, exist_ok=True)
    try:
        if a.gcode:
            gpath = a.gcode
        elif a.slicer and a.file:
            gpath = slice_file(a.slicer, os.path.abspath(a.file), work, a.settings)
        else:
            ap.error("give --slicer and a 3MF, or --gcode")
        layers = layer_tools(read_gcode(gpath))
        rs = runs(layers)
        print(f"{len(layers)} layers with the object, {len(rs)} runs:")
        for tools, i0, i1, z0, z1 in rs:
            print(f"  layers {i0:4d}-{i1:4d}  z {z0:7.2f}-{z1:7.2f}  tools {','.join(f'T{t}' for t in tools)}")
        if a.expect or a.bands:
            if a.bands:
                ref = reference_from_bands(a.bands, a.height)
            else:
                with open(a.expect, encoding="utf-8") as f:
                    ref = json.load(f)
            extras = [(int(e.split(":")[0]), *(float(v) for v in e.split(":")[1].split("-"))) for e in a.extra]
            ok, want = compare(rs, ref, extras)
            if ok:
                print(f"matches the reference ({os.path.basename(a.expect) if a.expect else a.bands})")
            else:
                print("DIFFERENT from the reference, expected:")
                for tools, i0, i1 in want:
                    print(f"  layers {i0:4d}-{i1:4d}  tools {','.join(f'T{t}' for t in tools)}")
                sys.exit(1)
    finally:
        if not a.keep:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
