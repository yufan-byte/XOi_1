/** A small interpreter for NewAPI billing expressions. Never executes JavaScript. */
type Node = { kind: string; value?: any; args?: Node[] };
const precedence: Record<string, number> = { "??": 1, "||": 2, "&&": 3, "==": 4, "!=": 4, in: 4, ">": 5, "<": 5, ">=": 5, "<=": 5, "+": 6, "-": 6, "*": 7, "/": 7 };
const compiled = new Map<string, Node>();

function parse(source: string): Node {
  if (source.length > 80_000) throw new Error("计费表达式过长");
  const tokens: string[] = [];
  const pattern = /\s+|"(?:\\.|[^"\\])*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\?\?|&&|\|\||==|!=|>=|<=|[()[\],;?:+*/!<>=-]/gy;
  let position = 0;
  while (position < source.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(source);
    if (!match) throw new Error("不支持的计费语法");
    position = pattern.lastIndex;
    if (match[0].trim()) tokens.push(match[0]);
  }
  let i = 0;
  const take = (expected: string) => { if (tokens[i++] !== expected) throw new Error("计费表达式不完整"); };
  function expression(min = 0): Node {
    const token = tokens[i++];
    let left: Node;
    if (token === "!" || token === "-" || token === "+") left = { kind: "unary", value: token, args: [expression(8)] };
    else if (token === "(") { left = expression(); take(")"); }
    else if (token === "[") {
      const args: Node[] = [];
      while (tokens[i] !== "]") { args.push(expression()); if (tokens[i] !== ",") break; i++; }
      take("]"); left = { kind: "array", args };
    } else if (token?.startsWith('"')) left = { kind: "literal", value: JSON.parse(token) };
    else if (/^(?:\d|\.)/.test(token || "")) left = { kind: "literal", value: Number(token) };
    else if (["nil", "true", "false"].includes(token)) left = { kind: "literal", value: token === "nil" ? null : token === "true" };
    else if (/^[A-Za-z_]\w*$/.test(token || "")) {
      if (tokens[i] === "(") {
        i++; const args: Node[] = [];
        while (tokens[i] !== ")") { args.push(expression()); if (tokens[i] !== ",") break; i++; }
        take(")"); left = { kind: "call", value: token, args };
      } else left = { kind: "variable", value: token };
    } else throw new Error("不支持的计费表达式");
    while (i < tokens.length && (precedence[tokens[i]] ?? -1) >= min) {
      const op = tokens[i++];
      left = { kind: "binary", value: op, args: [left, expression(precedence[op] + 1)] };
    }
    if (min === 0 && tokens[i] === "?") {
      i++; const yes = expression(); take(":"); left = { kind: "conditional", args: [left, yes, expression()] };
    }
    return left;
  }
  const declarations: Node[] = [];
  while (tokens[i] === "let") {
    i++; const name = tokens[i++];
    if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error("无效计费变量");
    take("="); declarations.push({ kind: "declaration", value: name, args: [expression()] }); take(";");
  }
  const result = expression();
  if (i !== tokens.length) throw new Error("不支持的计费表达式尾部");
  return { kind: "program", args: [...declarations, result] };
}

export function evaluateBillingExpression(source: string, vars: Record<string, unknown>, params: Record<string, unknown>, usage: Record<string, unknown>): number {
  let ast = compiled.get(source);
  if (!ast) { ast = parse(source); if (compiled.size >= 256) compiled.clear(); compiled.set(source, ast); }
  const scope = Object.assign(Object.create(null), vars);
  let steps = 0;
  function run(node: Node): any {
    if (++steps > 20_000) throw new Error("计费表达式超出限制");
    const args = node.args || [];
    if (node.kind === "literal") return node.value;
    if (node.kind === "variable") { if (!(node.value in scope)) throw new Error(`未知计费变量 ${node.value}`); return scope[node.value]; }
    if (node.kind === "array") return args.map(run);
    if (node.kind === "program") { let value: any; for (const item of args) value = run(item); return value; }
    if (node.kind === "declaration") return scope[node.value] = run(args[0]);
    if (node.kind === "conditional") return run(args[0]) ? run(args[1]) : run(args[2]);
    if (node.kind === "unary") { const x = run(args[0]); return node.value === "!" ? !x : node.value === "-" ? -Number(x) : Number(x); }
    if (node.kind === "call") {
      if (node.value === "param") return params[String(run(args[0]))] ?? null;
      if (node.value === "u") return usage[String(run(args[0]))] ?? null;
      if (node.value === "tier") return run(args[1]);
      const x = args.map(run);
      if (node.value === "max") return Math.max(...x.map(Number));
      if (node.value === "min") return Math.min(...x.map(Number));
      if (["float", "int"].includes(node.value)) return Number(x[0]);
      if (node.value === "floor") return Math.floor(Number(x[0]));
      if (node.value === "ceil") return Math.ceil(Number(x[0]));
      if (node.value === "round") return Math.round(Number(x[0]));
      if (node.value === "string") return String(x[0] ?? "");
      if (node.value === "split") return String(x[0]).split(String(x[1]));
      if (node.value === "count" || node.value === "len") return x[0]?.length ?? 0;
      throw new Error(`不支持的计费函数 ${node.value}`);
    }
    if (node.kind === "binary") {
      const a = run(args[0]);
      if (node.value === "??") return a ?? run(args[1]);
      if (node.value === "&&") return a && run(args[1]);
      if (node.value === "||") return a || run(args[1]);
      const b = run(args[1]);
      switch (node.value) {
        case "in": return Array.isArray(b) && b.includes(a);
        case "==": return a === b;
        case "!=": return a !== b;
        case ">": return a > b;
        case "<": return a < b;
        case ">=": return a >= b;
        case "<=": return a <= b;
        case "+": return Number(a) + Number(b);
        case "-": return Number(a) - Number(b);
        case "*": return Number(a) * Number(b);
        case "/": return Number(a) / Number(b);
      }
    }
    throw new Error("无法计算计费表达式");
  }
  const amount = Number(run(ast));
  if (!Number.isFinite(amount) || amount < 0) throw new Error("计费结果无效");
  return amount;
}

/** Conservative interval evaluation: never guess an unknown cost or evaluate only one price tier. */
export function billingExpressionUpperBound(source: string, bounds: Record<string, number>, params: Record<string, unknown>, usage: Record<string, unknown>): number {
  type Range = { low: number; high: number };
  const unknown = Symbol("unknown-condition");
  const scope: Record<string, any> = Object.fromEntries(Object.entries(bounds).map(([key, high]) => [key, {low:0,high}]));
  const range = (v: any): Range => {
    if (typeof v === "number" && Number.isFinite(v)) return {low:v,high:v};
    if (v && Number.isFinite(v.low) && Number.isFinite(v.high)) return v;
    throw new Error("计费规则无法可靠封顶");
  };
  const truth = (v: any): boolean | symbol => {
    if (v === unknown) return unknown;
    if (v && typeof v === "object" && "low" in v) return v.low > 0 || v.high < 0 ? true : v.low === 0 && v.high === 0 ? false : unknown;
    return !!v;
  };
  let steps = 0;
  const run = (node: Node): any => {
    if (++steps > 20000) throw new Error("计费规则过于复杂");
    const args = node.args || [];
    if (node.kind === "literal") return node.value;
    if (node.kind === "variable") { if (!(node.value in scope)) throw new Error("计费变量无法封顶"); return scope[node.value]; }
    if (node.kind === "array") return args.map(run);
    if (node.kind === "program") { let result: any; for (const item of args) result = run(item); return result; }
    if (node.kind === "declaration") return scope[node.value] = run(args[0]);
    if (node.kind === "conditional") {
      const condition = truth(run(args[0]));
      if (condition !== unknown) return run(condition ? args[1] : args[2]);
      const a = range(run(args[1])), b = range(run(args[2])); return {low:Math.min(a.low,b.low),high:Math.max(a.high,b.high)};
    }
    if (node.kind === "unary") {
      const value = run(args[0]);
      if (node.value === "!") { const t = truth(value); return t === unknown ? unknown : !t; }
      const r = range(value); return node.value === "-" ? {low:-r.high,high:-r.low} : r;
    }
    if (node.kind === "call") {
      if (node.value === "tier") return run(args[1]);
      if (node.value === "param") return params[String(run(args[0]))] ?? null;
      if (node.value === "u") {
        const key = String(run(args[0]));
        if (key === "upstream_cost" || !(key in usage)) throw new Error("费用依赖未知上游实际用量，不能自动执行");
        return usage[key];
      }
      const values = args.map(run);
      if (["max","min"].includes(node.value)) {
        const r = values.map(range), f = node.value === "max" ? Math.max : Math.min;
        return {low:f(...r.map(x=>x.low)),high:f(...r.map(x=>x.high))};
      }
      if (node.value === "string") return String(values[0] ?? "");
      if (node.value === "split") return String(values[0]).split(String(values[1]));
      if (["count","len"].includes(node.value)) return values[0]?.length ?? 0;
      if (["float","int"].includes(node.value)) return range(values[0]);
      // 数量取整类函数对区间是单调的：low/high 分别取整即可继续封顶。
      if (node.value === "floor" || node.value === "ceil" || node.value === "round") {
        const r = range(values[0]);
        const f = node.value === "floor" ? Math.floor : node.value === "ceil" ? Math.ceil : Math.round;
        return {low: f(r.low), high: f(r.high)};
      }
      throw new Error("计费函数尚不支持预算封顶");
    }
    if (node.kind === "binary") {
      const a = run(args[0]);
      if (node.value === "??") return a ?? run(args[1]);
      if (["&&","||"].includes(node.value)) {
        const t = truth(a);
        if (node.value === "&&" && t === false) return false;
        if (node.value === "||" && t === true) return true;
        const b = truth(run(args[1]));
        if (node.value === "&&" && b === false) return false;
        if (node.value === "||" && b === true) return true;
        return t === unknown || b === unknown ? unknown : b;
      }
      const b = run(args[1]);
      if (["in","==","!=",">","<",">=","<="].includes(node.value)) {
        // A nonconstant token count may select any tier; reserve the most expensive.
        if ((a && typeof a === "object" && "low" in a) || (b && typeof b === "object" && "low" in b)) return unknown;
        if (node.value === "in") return Array.isArray(b) && b.includes(a);
        if (node.value === "==") return a === b;
        if (node.value === "!=") return a !== b;
        if (node.value === ">") return a > b;
        if (node.value === "<") return a < b;
        if (node.value === ">=") return a >= b;
        return a <= b;
      }
      const x = range(a), y = range(b);
      if (node.value === "+") return {low:x.low+y.low,high:x.high+y.high};
      if (node.value === "-") return {low:x.low-y.high,high:x.high-y.low};
      if (node.value === "*") { const n = [x.low*y.low,x.low*y.high,x.high*y.low,x.high*y.high]; return {low:Math.min(...n),high:Math.max(...n)}; }
      if (node.value === "/") {
        if (y.low <= 0 && y.high >= 0) throw new Error("计费分母无可靠边界");
        const n = [x.low/y.low,x.low/y.high,x.high/y.low,x.high/y.high]; return {low:Math.min(...n),high:Math.max(...n)};
      }
    }
    throw new Error("计费规则尚不支持预算封顶");
  };
  const result = range(run(parse(source))).high;
  if (!Number.isFinite(result) || result < 0) throw new Error("预算价格无效");
  return result;
}
