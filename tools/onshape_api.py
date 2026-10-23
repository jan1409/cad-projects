"""Small Onshape REST client (stdlib only).

Auth: Basic auth with ONSHAPE_ACCESS_KEY / ONSHAPE_SECRET_KEY (Windows user env vars). Without keys, calls go out
anonymously, which works for public documents (elements, features) but not for configuration/variables/exports.
Every request is appended to tools/.onshape_calls.log; the Free plan has a small yearly API quota.

<url> is an Onshape URL (https://cad.onshape.com/documents/<d>/w/<w>/e/<e>) or the short form d/<d>/w/<w>/e/<e>
(also v/<version> or m/<microversion> instead of w/<workspace>).
<config> is "name=value;name=value" (e.g. "x_count=3;y_count=2;z_count=4") or "-" for the default configuration.

Usage:
  python -I tools/onshape_api.py whoami
  python -I tools/onshape_api.py quota
  python -I tools/onshape_api.py doc <url>
  python -I tools/onshape_api.py elements <url>
  python -I tools/onshape_api.py features <url> <out.json> [<config>]
  python -I tools/onshape_api.py configuration <url> [<out.json>]
  python -I tools/onshape_api.py variables <url> [<config>]
  python -I tools/onshape_api.py parts <url> [<config>]
  python -I tools/onshape_api.py stl <url> <config> <out.stl> [<partId>]
  python -I tools/onshape_api.py step <url> <config> <out.step>
  python -I tools/onshape_api.py get <api-path>          (e.g. /api/v10/users/sessioninfo)

Add --anon to any command to skip the keys (public documents only).
"""
import base64
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://cad.onshape.com"
API = BASE + "/api/v10"
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".onshape_calls.log")
ANON = False  # set by --anon: skip keys for public reads (saves Free-plan quota)
URL_RE = re.compile(r"(?:documents|d)/([0-9a-f]{24})/([wvm])/([0-9a-f]{24})(?:/e/([0-9a-f]{24}))?")


def _key(name):
    """Env var, else the Windows user registry (keys set with SetEnvironmentVariable before VS Code was restarted)."""
    v = os.environ.get(name)
    if v or os.name != "nt":
        return v
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            return winreg.QueryValueEx(k, name)[0]
    except OSError:
        return None


def _auth():
    if ANON:
        return None
    ak, sk = _key("ONSHAPE_ACCESS_KEY"), _key("ONSHAPE_SECRET_KEY")
    if ak and sk:
        return "Basic " + base64.b64encode(("%s:%s" % (ak, sk)).encode()).decode()
    return None


def _log(method, url, status, authed):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write("%s\t%s\t%s\t%s\t%s\n" % (datetime.datetime.now().isoformat(timespec="seconds"), method, status,
                                          "auth" if authed else "anon", url.replace(BASE, "")))


def request(method, url, body=None, accept="application/json", raw=False, timeout=300):
    if not url.startswith("http"):
        url = BASE + url
    headers = {"Accept": accept}
    auth = _auth()
    if auth:
        headers["Authorization"] = auth
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            _log(method, url, resp.status, auth is not None)
            payload = resp.read()
    except urllib.error.HTTPError as e:
        _log(method, url, e.code, auth is not None)
        msg = e.read().decode("utf-8", "replace")[:500]
        hint = " (set ONSHAPE_ACCESS_KEY/ONSHAPE_SECRET_KEY)" if e.code == 401 and not auth else ""
        raise SystemExit("HTTP %d %s %s%s\n%s" % (e.code, method, url.replace(BASE, ""), hint, msg))
    if raw:
        return payload
    return json.loads(payload.decode("utf-8")) if payload.strip() else None


def parse(url):
    m = URL_RE.search(url)
    if not m:
        raise SystemExit("Not an Onshape document URL: " + url)
    d, wvm, wid, e = m.groups()
    return d, wvm, wid, e


def config_query(config):
    if not config or config == "-":
        return ""
    return "configuration=" + urllib.parse.quote(config, safe="")


def _q(*parts):
    parts = [p for p in parts if p]
    return ("?" + "&".join(parts)) if parts else ""


def whoami():
    info = request("GET", API + "/users/sessioninfo")
    print("user:", info.get("name"), "| id:", info.get("id"), "| plan:", (info.get("planGroup") or info.get("plan")))


def quota():
    year = str(datetime.date.today().year)
    auth = anon = 0
    if os.path.exists(LOG):
        with open(LOG, encoding="utf-8") as f:
            for line in f:
                if line.startswith(year):
                    if "\tauth\t" in line:
                        auth += 1
                    else:
                        anon += 1
    print("calls logged in %s: authenticated %d, anonymous %d (log: %s)" % (year, auth, anon, LOG))


def doc(url):
    d, _, _, _ = parse(url)
    j = request("GET", "%s/documents/%s" % (API, d))
    print("name:", j.get("name"), "| public:", j.get("public"), "| owner:", (j.get("owner") or {}).get("name"),
          "| modified:", j.get("modifiedAt"))


def elements(url):
    d, wvm, w, _ = parse(url)
    for e in request("GET", "%s/documents/d/%s/%s/%s/elements" % (API, d, wvm, w)):
        print(e.get("id"), "|", e.get("elementType"), "|", e.get("name"))


def features(url, out, config=None):
    d, wvm, w, e = parse(url)
    j = request("GET", "%s/partstudios/d/%s/%s/%s/e/%s/features%s" % (API, d, wvm, w, e, _q(config_query(config))))
    with open(out, "w", encoding="utf-8") as f:
        json.dump(j, f, indent=1, ensure_ascii=False)
    print("features: %d -> %s" % (len(j.get("features", [])), out))


def print_configuration(j):
    # v10 returns flat objects; older API versions wrap each one in {"message": ...}
    unwrap = lambda o: o.get("message", o) if isinstance(o, dict) else o
    for p in j.get("configurationParameters", []):
        m = unwrap(p)
        line = "%-16s %-40s" % (m.get("parameterId"), m.get("btType") or p.get("typeName"))
        if m.get("rangeAndDefault"):
            r = unwrap(m["rangeAndDefault"])
            line += " default=%s min=%s max=%s %s" % (r.get("defaultValue"), r.get("minValue"), r.get("maxValue"),
                                                     r.get("units", ""))
        if m.get("quantityType"):
            line += " (%s)" % m["quantityType"]
        if "defaultValue" in m:
            line += " default=%s" % m["defaultValue"]
        if m.get("options"):
            line += " options=%s default=%s" % ([unwrap(o).get("option") for o in m["options"]], m.get("default"))
        print(line + "  name=%r" % m.get("parameterName"))
    for c in j.get("currentConfiguration", []):
        m = unwrap(c)
        print("current: %s = %s" % (m.get("parameterId"), m.get("expression") or m.get("value")))


def configuration(url, out=None):
    d, wvm, w, e = parse(url)
    j = request("GET", "%s/elements/d/%s/%s/%s/e/%s/configuration" % (API, d, wvm, w, e))
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(j, f, indent=1, ensure_ascii=False)
    print_configuration(j)


def variables(url, config=None):
    d, wvm, w, e = parse(url)
    j = request("GET", "%s/variables/d/%s/%s/%s/e/%s/variables%s" % (API, d, wvm, w, e, _q(config_query(config))))
    for block in j or []:
        for v in block.get("variables", []):
            print("%-20s %-12s %s" % (v.get("name"), v.get("type"), v.get("expression") or v.get("value")))


def parts(url, config=None):
    d, wvm, w, e = parse(url)
    for p in request("GET", "%s/parts/d/%s/%s/%s/e/%s%s" % (API, d, wvm, w, e, _q(config_query(config)))):
        print(p.get("partId"), "|", p.get("name"), "|", p.get("bodyType"))


def stl(url, config, out, part_id=None):
    d, wvm, w, e = parse(url)
    q = _q("units=millimeter", "mode=binary", "grouping=true", "scale=1", config_query(config))
    if part_id:
        path = "%s/parts/d/%s/%s/%s/e/%s/partid/%s/stl%s" % (API, d, wvm, w, e, urllib.parse.quote(part_id), q)
    else:
        path = "%s/partstudios/d/%s/%s/%s/e/%s/stl%s" % (API, d, wvm, w, e, q)
    data = request("GET", path, accept="application/octet-stream", raw=True)
    with open(out, "wb") as f:
        f.write(data)
    print("stl: %d bytes -> %s" % (len(data), out))


def step(url, config, out):
    d, wvm, w, e = parse(url)
    body = {"formatName": "STEP", "storeInDocument": False, "flattenAssemblies": False, "yAxisIsUp": False,
            "includeExportIds": False}
    if config and config != "-":
        body["configuration"] = config
    t = request("POST", "%s/partstudios/d/%s/%s/%s/e/%s/translations" % (API, d, wvm, w, e), body)
    tid = t["id"]
    for _ in range(60):
        time.sleep(3)
        t = request("GET", "%s/translations/%s" % (API, tid))
        if t.get("requestState") in ("DONE", "FAILED"):
            break
    if t.get("requestState") != "DONE":
        raise SystemExit("translation %s: %s %s" % (tid, t.get("requestState"), t.get("failureReason")))
    fid = t["resultExternalDataIds"][0]
    data = request("GET", "%s/documents/d/%s/externaldata/%s" % (API, d, fid), accept="application/octet-stream",
                   raw=True)
    with open(out, "wb") as f:
        f.write(data)
    print("step: %d bytes -> %s" % (len(data), out))


def main(argv):
    global ANON
    sys.stdout.reconfigure(encoding="utf-8")
    ANON = "--anon" in argv
    argv = [a for a in argv if a != "--anon"]
    if len(argv) < 2:
        raise SystemExit(__doc__)
    cmd, args = argv[1], argv[2:]
    if cmd == "whoami":
        whoami()
    elif cmd == "quota":
        quota()
    elif cmd == "doc":
        doc(args[0])
    elif cmd == "elements":
        elements(args[0])
    elif cmd == "features":
        features(args[0], args[1], args[2] if len(args) > 2 else None)
    elif cmd == "configuration":
        configuration(args[0], args[1] if len(args) > 1 else None)
    elif cmd == "variables":
        variables(args[0], args[1] if len(args) > 1 else None)
    elif cmd == "parts":
        parts(args[0], args[1] if len(args) > 1 else None)
    elif cmd == "stl":
        stl(args[0], args[1], args[2], args[3] if len(args) > 3 else None)
    elif cmd == "step":
        step(args[0], args[1], args[2])
    elif cmd == "get":
        print(json.dumps(request("GET", args[0]), indent=1, ensure_ascii=False)[:20000])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
