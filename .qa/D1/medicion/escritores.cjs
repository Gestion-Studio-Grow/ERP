// Encuentra escrituras Prisma de columnas de importe (AST de TypeScript).
// uso: node escritores.cjs <raiz-del-repo>
const ts = require("/home/user/erp/node_modules/typescript");
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2];
const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8").split("\n");
const MONEY = {
  Tenant: ["bancosUmbralIdentificacion"],
  Service: ["price", "residentPrice", "depositAmount"],
  Product: ["price", "pricePerKg"],
  Appointment: ["priceAtBooking", "discountAmount"],
  CommissionPayout: ["amount"],
  Payment: ["amount"],
  Coupon: ["value"],
  Invoice: ["neto", "iva", "total"],
  MovimientoImportado: ["monto"],
  Order: ["subtotal", "discount", "total"],
  OrderItem: ["unitPrice", "lineTotal"],
  CashSession: ["openingFloat", "closingExpected", "closingCounted", "closingDiff"],
  CashMovement: ["amount"],
  StockPurchase: ["totalCost"],
  StockPurchaseItem: ["unitCost", "lineTotal"],
  StockMovement: ["unitCost"],
  Collection: ["amount"],
  AccountPayable: ["amount"],
  PayableCheque: ["amount"],
  AccountReceivable: ["amount"],
};
// relaciones: modelo -> { campo -> modeloDestino }
const models = new Set(); const rel = {}; let cur = null;
for (const l of schema) { const m = l.match(/^model (\w+)/); if (m) { cur = m[1]; models.add(cur); rel[cur] = {}; continue; } if (/^}/.test(l)) cur = null; }
cur = null;
for (const l of schema) { const m = l.match(/^model (\w+)/); if (m) { cur = m[1]; continue; } if (/^}/.test(l)) { cur = null; continue; }
  if (!cur) continue; const f = l.match(/^\s+(\w+)\s+(\w+)(\[\])?\??/); if (f && models.has(f[2])) rel[cur][f[1]] = f[2]; }
const accessor = {}; for (const m of models) accessor[m[0].toLowerCase() + m.slice(1)] = m;
const WRITE = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "updateManyAndReturn"]);
function files(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
  if (e.isDirectory()) { if (["node_modules", "generated", ".next"].includes(e.name)) continue; files(p, out); }
  else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(p); } return out; }
const res = [];
function propName(p) { if (!p.name) return null; if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text; return null; }
function scanData(node, model, sf, file, op, ctx) {
  if (!node) return;
  const pos = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  if (ts.isArrayLiteralExpression(node)) { node.elements.forEach((e) => scanData(e, model, sf, file, op, ctx)); return; }
  if (ts.isParenthesizedExpression(node)) return scanData(node.expression, model, sf, file, op, ctx);
  if (ts.isConditionalExpression(node)) { scanData(node.whenTrue, model, sf, file, op, ctx); scanData(node.whenFalse, model, sf, file, op, ctx); return; }
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) { res.push({ file, line: pos(p), model, field: "(spread)", op, how: "spread " + p.expression.getText(sf).slice(0, 60), ctx }); continue; }
      const n = propName(p); if (!n) continue;
      if ((MONEY[model] || []).includes(n)) {
        const val = ts.isPropertyAssignment(p) ? p.initializer.getText(sf).replace(/\s+/g, " ").slice(0, 90) : "(shorthand)";
        res.push({ file, line: pos(p), model, field: n, op, how: val, ctx });
      } else if (rel[model] && rel[model][n] && ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) {
        const target = rel[model][n];
        for (const q of p.initializer.properties) { const qn = propName(q);
          if (["create", "createMany", "update", "upsert", "updateMany", "connectOrCreate"].includes(qn) && ts.isPropertyAssignment(q)) {
            let init = q.initializer; if (qn === "createMany" && ts.isObjectLiteralExpression(init)) { const d = init.properties.find((z) => propName(z) === "data"); init = d && d.initializer; }
            scanData(init, target, sf, file, op + ">" + n + "." + qn, ctx);
          } }
      }
    }
    return;
  }
  // no literal: variable, llamada, etc.
  res.push({ file, line: pos(node), model, field: "(indirecto)", op, how: node.getText(sf).replace(/\s+/g, " ").slice(0, 90), ctx });
}
for (const file of [...files(path.join(ROOT, "src")), ...files(path.join(ROOT, "prisma")), ...files(path.join(ROOT, "scripts"))]) {
  const text = fs.readFileSync(file, "utf8"); const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rf = path.relative(ROOT, file);
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && WRITE.has(n.expression.name.text) && ts.isPropertyAccessExpression(n.expression.expression)) {
      const acc = n.expression.expression.name.text; const model = accessor[acc]; const op = n.expression.name.text;
      if (model && MONEY[model] !== undefined || (model && Object.values(rel[model] || {}).some((t) => MONEY[t]))) {
        const arg = n.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const get = (k) => { const p = arg.properties.find((z) => propName(z) === k); return p && (ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : null); };
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          if (op === "upsert") { scanData(get("create"), model, sf, rf, op + ".create", line); scanData(get("update"), model, sf, rf, op + ".update", line); }
          else scanData(get("data"), model, sf, rf, op, line);
        } else if (arg) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          res.push({ file: rf, line, model, field: "(indirecto)", op, how: "arg " + arg.getText(sf).slice(0, 60), ctx: line });
        }
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}
for (const r of res) console.log([r.model, r.field, r.file + ":" + r.line, r.op, "call@" + r.ctx, r.how].join("\t"));
