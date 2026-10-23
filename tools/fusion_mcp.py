"""Minimal client for Fusion's built-in MCP server (Streamable HTTP, "MCP Server Adapter").

Works even when the `fusion` MCP tools did not load in Claude Code (e.g. Fusion started after the session).

Usage:
  python tools/fusion_mcp.py run <script.py> [<script2.py> ...] [--readonly]
  python tools/fusion_mcp.py screenshot <direction|current> <out.png> [width height] [--transparent]
  python tools/fusion_mcp.py doc <searchPattern> [apiCategory] [filter]
  python tools/fusion_mcp.py read '<json-args>'
  python tools/fusion_mcp.py ping

Scripts must define `def run(_context: str)`; print() output is returned. Several files are concatenated,
e.g. `run tools/fusion_lib.py Gridfinity/fusion/cad/10_base.py`.
"""
import base64
import json
import sys
import urllib.request

URL = "http://127.0.0.1:27182/mcp"
FIT_SCRIPT = (
    "import adsk.core\n"
    "def run(_context: str):\n"
    "    vp = adsk.core.Application.get().activeViewport\n"
    "    vp.fit()\n"
    "    vp.refresh()\n"
)
PING_SCRIPT = (
    "import adsk.core\n"
    "def run(_context: str):\n"
    "    app = adsk.core.Application.get()\n"
    "    doc = app.activeDocument\n"
    "    print('Fusion', app.version, '| user:', app.currentUser.displayName,\n"
    "          '| doc:', doc.name if doc else None, '| product:', app.activeProduct.productType if app.activeProduct else None)\n"
)
HEADERS = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}


def _post(payload, session=None, timeout=600):
    headers = dict(HEADERS)
    if session:
        headers["Mcp-Session-Id"] = session
    req = urllib.request.Request(URL, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        sid = resp.headers.get("Mcp-Session-Id")
        body = resp.read().decode("utf-8")
    if not body.strip():
        return sid, None
    if body.lstrip().startswith("{"):
        return sid, json.loads(body)
    # SSE: use the last data: line that carries JSON
    data = [line[5:].strip() for line in body.splitlines() if line.startswith("data:")]
    return sid, json.loads(data[-1]) if data else None


def session():
    sid, _ = _post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                               "clientInfo": {"name": "cad-projects-cli", "version": "1.0"}}})
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return sid


def call(tool, arguments):
    sid = session()
    _, res = _post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                    "params": {"name": tool, "arguments": arguments}}, sid)
    if res is None:
        raise RuntimeError("Empty response")
    if "error" in res:
        raise RuntimeError(json.dumps(res["error"], ensure_ascii=False))
    return res["result"]


def _texts(result):
    out = []
    for c in result.get("content", []):
        if c.get("type") == "text":
            out.append(c["text"])
    text = "\n".join(out)
    try:
        # Fusion sometimes returns UTF-8 print() output that was decoded as Latin-1
        text = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    try:
        j = json.loads(text)
        if isinstance(j, dict) and "message" in j and set(j) <= {"message", "success"}:
            return j["message"] if j.get("success", True) else text
    except ValueError:
        pass
    return text


def run_script(script, readonly=False):
    obj = {"script": script}
    if readonly:
        obj["readOnly"] = True
    return call("fusion_mcp_execute", {"featureType": "script", "object": obj})


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    cmd = argv[1]
    if cmd == "ping":
        print(_texts(run_script(PING_SCRIPT, readonly=True)))
    elif cmd == "run":
        files = [a for a in argv[2:] if not a.startswith("--")]
        parts = []
        for path in files:
            with open(path, encoding="utf-8") as f:
                parts.append(f.read())
        result = run_script("\n\n".join(parts), readonly="--readonly" in argv)
        print(_texts(result))
        if result.get("isError"):
            sys.exit(1)
    elif cmd == "screenshot":
        # Rotate to the direction and fit first, then capture with "current".
        # With "current" a camera set by a script stays unchanged.
        transparent = "--transparent" in argv
        argv = [a for a in argv if a != "--transparent"]
        if argv[2] != "current":
            call("fusion_mcp_read", {"queryType": "screenshot", "direction": argv[2], "width": 64, "height": 64})
            run_script(FIT_SCRIPT, readonly=True)
        args = {"queryType": "screenshot", "direction": "current", "transparentBackground": transparent}
        if len(argv) > 5:
            args["width"], args["height"] = int(argv[4]), int(argv[5])
        result = call("fusion_mcp_read", args)
        data = None
        for c in result.get("content", []):
            if c.get("type") == "image":
                data = c["data"]
                break
            if c.get("type") == "text":
                try:
                    data = json.loads(c["text"]).get("base64Data")
                except ValueError:
                    pass
                if data:
                    break
        if not data:
            print(json.dumps(result)[:2000])
            sys.exit(1)
        with open(argv[3], "wb") as f:
            f.write(base64.b64decode(data))
        print("saved:", argv[3])
    elif cmd == "doc":
        args = {"queryType": "apiDocumentation", "searchPattern": argv[2]}
        if len(argv) > 3:
            args["apiCategory"] = argv[3]
        if len(argv) > 4:
            args["filter"] = argv[4]
        print(_texts(call("fusion_mcp_read", args)))
    elif cmd == "read":
        print(_texts(call("fusion_mcp_read", json.loads(argv[2]))))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
