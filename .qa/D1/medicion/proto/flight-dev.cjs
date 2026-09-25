// ¿Qué hace React Flight (el serializador de Server Components y Server Actions de Next) con un Decimal?
const path = "/home/user/erp/node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.development.js";
const { renderToPipeableStream } = require(path);
const { Decimal } = require("/home/user/erp/node_modules/@prisma/client-runtime-utils");
const { Writable } = require("stream");
function probar(nombre, valor) {
  return new Promise((res) => {
    let texto = ""; const errores = [];
    const s = renderToPipeableStream(valor, {}, { onError: (e) => { errores.push(String(e && e.message || e).slice(0, 200)); } });
    s.pipe(new Writable({ write(c, _e, cb) { texto += c.toString(); cb(); }, final(cb) { res({ nombre, texto: texto.slice(0, 200), errores }); cb(); } }));
  });
}
(async () => {
  console.log(JSON.stringify(await probar("decimal", { total: new Decimal("1234.50") })));
  console.log(JSON.stringify(await probar("number", { total: 1234.5 })));
  console.log(JSON.stringify(await probar("string", { total: "1234.50" })));
})();
