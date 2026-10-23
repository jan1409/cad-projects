// Evaluates the arithmetic expressions used in Gridfinity/spec/case_params.json
// (numbers, variable names, + - * / and parentheses). No eval/new Function, so it also runs under a strict CSP.

export function evaluate(expr, env) {
  if (typeof expr === "number") return expr;
  const src = String(expr);
  const tokens = src.match(/\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+|[A-Za-z_]\w*|[-+*/()]/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function primary() {
    const t = next();
    if (t === undefined) throw new Error(`unexpected end of expression: ${src}`);
    if (t === "(") {
      const v = sum();
      if (next() !== ")") throw new Error(`missing ) in: ${src}`);
      return v;
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    if (/^[\d.]/.test(t)) return parseFloat(t);
    if (!(t in env)) throw new Error(`unknown variable ${t} in: ${src}`);
    return env[t];
  }
  function product() {
    let v = primary();
    while (peek() === "*" || peek() === "/") v = next() === "*" ? v * primary() : v / primary();
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + product() : v - product();
    return v;
  }
  const v = sum();
  if (i !== tokens.length) throw new Error(`unexpected token ${tokens[i]} in: ${src}`);
  return v;
}

// Inputs + derived values (same order as the spec's "derived" block)
export function caseEnv(spec, inputs) {
  const env = {};
  for (const [k, p] of Object.entries(spec.parameters)) {
    if (p.type === "bool") continue;
    env[k] = inputs[k] ?? p.default;
  }
  for (const [k, v] of Object.entries(spec.derived)) env[k] = evaluate(v, env);
  return env;
}

export function profile(spec, name, env) {
  return spec.profiles[name].map((p) => [evaluate(p.s, env), evaluate(p.z, env), p.r ?? 0]);
}
