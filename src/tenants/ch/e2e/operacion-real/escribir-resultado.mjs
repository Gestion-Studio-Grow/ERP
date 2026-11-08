// Arma resultado.md a partir de pasos.json, visual.json, verificacion-base.json y semilla-run.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const A = process.env.SALIDA_OPERACION_REAL ?? path.join(os.tmpdir(), "operacion-real-ch", "recorrido");
const j = (f) => JSON.parse(readFileSync(path.join(A, f), "utf8"));
const { filas, capturas } = j("pasos.json");
const vis = j("visual.json");
const base = j("verificacion-base.json");
const sem = j("semilla-run.json");
const egr = j("egresos-23.json");
const esc = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const n = (e) => filas.filter((f) => f.estado === e).length;
const pct = (k) => Math.round((100 * sem.octubre.porMedio[k]) / sem.octubre.facturado);
const ESTRELLA = new Set(["01", "02", "03", "05", "06", "08", "10", "12", "14", "15", "16", "18", "19", "20", "21", "22", "23", "24"]);
const QUE = {
  "01": "Inicio con «18 turnos hoy». En 01c, la Caja del día con el fondo de $20.000 cargado como ingreso en Efectivo, porque CH no tiene «Abrir caja».",
  "02": "Agenda del sábado por profesional, con 4 columnas (Belén, Carla, Laura y Marina). Fijarse si el bloque de Lucía de las 10:00 se pisa con el de Paula de las 10:45: se midieron 32 px.",
  "03": "Agenda de Laura a 390: sólo sus 11 turnos y sin scroll lateral. Los nombres de los servicios salen cortados con «…».",
  "05": "A 1440, la recepción después de cobrar. A 390, Prof A con el aviso «Ese turno ya está cerrado» o «Terminado y cobrado». El turno se cobró una sola vez.",
  "06": "Cajón de Lucía con dos pagos (Efectivo $10.000 y Transferencia $12.000) y «Pagado ✓».",
  "08": "Agenda con Paula como «No vino». El bloque sigue ocupando la celda: el hueco NO se libera. En 08b, la hoja «No vino» con la pregunta sobre la seña.",
  "10": "Confirmación de la reserva web a 390. Dice la seña de $5.000, pero NO muestra alias ni vencimiento. Además, el contraste de los huecos de foto da 4,32:1.",
  "12": "Agenda/cajón después de cobrar el servicio y la crema por separado. En 12b, el mostrador con la crema y la clienta del turno ya cargada.",
  "14": "Pagos del turno de Camila con el cobro de MP anulado. En 14b, «Sí, anular» deshabilitado sin código. En 14c, el código de la dueña.",
  "15": "R2 entra a las 14:00 y ve la agenda de la tarde. La prueba de la cookie de R1 no tiene captura: el resultado está en la tabla.",
  "16": "Prof B a 390 después de cobrar aparte $4.000 en efectivo.",
  "18": "Cajón de Victoria con los medios Efectivo, Mercado Pago y Transferencia. No hay Tarjeta.",
  "19": "«Cerrar lo pendiente» después del lote: quedan 6 turnos de Belén, que cobra aparte. En 19b, la misma pantalla antes del lote.",
  "20": "Cierre con la diferencia «Faltan $3.000» y la nota escrita, antes de deslizar. En 20b, el día ya cerrado.",
  "21": "El cierre en el celular: dice «cerrado» y muestra el faltante de $3.000, sin scroll lateral.",
  "22": "Reporte del mes pasado: ingresos de $6.259.000, 18 ausencias y los medios EF/TR/MP, todo igual que la semilla.",
  "23": "Comisiones después de liquidar: «Ya pagadas» con 4. En 23b, las 4 que había para liquidar antes.",
  "24": "Prof A a 390 ve «Comisiones no está disponible».",
};
const comisionesEf = egr.filter((x) => /Comisión/.test(x.reason ?? ""));
const out = [];
out.push("# Recorrido de un sábado de CH Estética: resultado", "");
out.push("**Corrido en `next dev` (Turbopack), no en `next start`.** El build de producción no compila en este entorno: con Turbopack fallan las fuentes de Google, y con `--webpack` da «Selector body is not pure». Es un desvío del método que dispuso el coordinador.");
out.push("Base Postgres LOCAL efímera (puerto 5433), con migraciones y RLS (`app_rls`, `RLS_ENFORCEMENT=on`). Nunca se tocó Neon, y la base se borró al terminar.");
out.push("**Sábado elegido: 14/11/2026.** En AR, hoy era el sábado 07/11 a las 23:5x, sin día por delante; por eso se tomó el próximo. Zona horaria: America/Argentina/Buenos_Aires.");
out.push("El reloj del servidor se adelanta con `reloj.mjs`: NODE_OPTIONS --import y un desfase leído de un archivo. El de los navegadores se adelanta con un init script y la cookie `__reloj`. Cada paso corre a su hora.");
out.push("Limitación: el `now()` de Postgres no se adelanta. Los `createdAt` de Prisma sí, porque los genera JS.");
out.push(`Antes del recorrido se precalentaron 12 pantallas (≈19 s). En una corrida anterior, \`next dev\` contestó 404 en rutas anidadas que todavía no había compilado (\`/admin/turnos/cerrar\`, \`/admin/caja/cierre\`). Ahora se reintenta y queda anotado: en la corrida final hubo ${base.reintentos404.length} reintentos.`, "");
out.push(`**Totales:** ${n("OK")} OK · ${n("FALLA")} FALLA · ${n("CALLEJÓN")} CALLEJÓN, de ${filas.length} pasos.`, "");
out.push("Semilla (`semilla-sabado-ch.mts`):");
out.push(`- Octubre: ${sem.octubre.turnos} turnos, ${sem.octubre.noShow} no-show (${((100 * sem.octubre.noShow) / sem.octubre.turnos).toFixed(1)} %) y $${sem.octubre.facturado.toLocaleString("es-AR")} facturados.`);
out.push(`- Medios de octubre: EF ${pct("EFECTIVO")} % · TR ${pct("TRANSFERENCIA")} % · MP/tarjeta ${pct("MERCADOPAGO")} %. La tarjeta se cargó como MERCADOPAGO porque DEBITO/CREDITO no existen en una base sin Gate 2.`);
out.push("- Comisiones pendientes de 4 profesionales, al 40 %.");
out.push("- Sábado: 18 turnos. Laura (A, cobra en mostrador) tiene 11 y Belén (B, `cobraEnMostrador=false`) tiene 7. 9 de los 18 tienen seña de $5.000.");
out.push("- Usuarios: dueña, R1, R2, prof A y prof B.");
out.push("- Supuestos provisionales a confirmar: horario 09-20, fondo de $20.000, nombres, precios y política de seña.");
out.push("- Se borraron los 4 turnos «de ahora» que trae la semilla base.", "");
out.push("## Pasos", "", "| paso | hora | quién | estado | qué se vio | archivo:línea |", "|---|---|---|---|---|---|");
for (const f of filas) out.push(`| ${f.id}${ESTRELLA.has(f.id) ? " ★" : ""} | ${f.hora} | ${esc(f.quien)} | ${f.estado} | ${esc(f.visto)} | ${esc(f.ref)} |`);
out.push("", "Notas de criterio:");
out.push("- 02 queda en FALLA por la superposición medida. Que haya 4 columnas (2 sin turnos) es un dato, no una falla.");
out.push("- 12 queda en FALLA porque el guion pide que la crema «sume al ticket». El producto la cobra aparte, por decisión de diseño: «Es otro cobro, aparte del turno», en `TurnoCajon.tsx:664-668`.");
out.push("- 17 queda en FALLA porque no hay una política de seña por horas de aviso: la recepción elige a mano si la seña se queda o se devuelve.");
out.push("- 19 queda OK porque los 6 turnos que quedan son de Belén, que cobra aparte, y la pantalla lo explica.");
out.push(`- 23 queda OK, con una observación de plata. Las 4 liquidaciones salen como EGRESO en **Efectivo**, que es el medio por defecto del combo. Suman $${comisionesEf.reduce((a, x) => a + x.amount, 0).toLocaleString("es-AR")}, contra un cajón con unos $158.500. Quedan fechadas el 15/11 a las 12:00 AR (${comisionesEf[0]?.occurredAt}) porque el 14/11 ya estaba cerrado. Nada advierte que no hay efectivo para pagarlas.`);
out.push("- 15 queda en FALLA de seguridad: el token `userId.firma` no vence en el servidor. La cookie dura 8 h, pero sólo en el navegador.", "");
out.push("## Verificación en la base (después del paso 25)", "");
out.push(`- Cobros duplicados (mismo turno, medio y monto): ${base.duplicados.length ? base.duplicados.join("; ") : "ninguno"}. En el paso 05 quedaron 2 cobros: la seña y un único saldo.`);
out.push(`- Saldos (turnos terminados con pagado ≠ precio, o sobrepagos): ${base.saldos.length ? base.saldos.join("; ") : "ninguno"}.`);
out.push(`- Libro de caja del 14/11, por tipo y medio: ${base.libro.join(" · ")}.`);
out.push(`- Efectivo esperado en el cierre: $${(base.efectivoEsperadoEnCierre ?? 0).toLocaleString("es-AR")}. Se contaron $3.000 menos.`);
out.push("- El cobro aparte de Belén ($4.000 en efectivo) entra al libro como VENTA/EFECTIVO del local (D6).");
out.push(`- Stock de la crema: 10 → ${base.stockCrema} (${base.movimientosDeStock} movimiento de stock).`);
out.push(`- Auditoría del día: ${base.auditoria.join(" · ")}.`, "");
out.push("## Chequeos visuales automáticos (sin modelo)", "");
out.push("El detalle está en `visual.json`. Hay falsos positivos conocidos:");
out.push("- Los «cortados» incluyen elementos `sr-only`, como «Saltar al contenido» y algunas leyendas.");
out.push("- Los «tapados» por `nextjs-portal` son el overlay de `next dev`.");
out.push("- Con un cajón abierto, sólo se miran los botones de adentro del cajón.", "");
out.push("| paso | ancho | desborde | cortados | tapados | contraste | img rotas | consola |", "|---|---|---|---|---|---|---|---|");
for (const r of vis) out.push(`| ${r.paso} | ${r.ancho} | ${r.desborde ? `sí (${r.desborde.scrollWidth}>${r.desborde.clientWidth})` : "no"} | ${r.cortados.length} | ${r.totalTapados} | ${r.contraste.nodos} | ${r.imgRotas.length} | ${r.consola.length} |`);
out.push("", "Hallazgos visuales reales:");
out.push("- En los bloques de la agenda, los nombres de servicio salen cortados con «…»: «· Masaje descontracturante» ×25 y «· Limpieza facial profunda» ×21.");
out.push("- En el 03 (390), el bloque de las 13:00 de Laura queda tapado por un link de hueco.");
out.push("- En el 10, el contraste de los huecos de foto de la vidriera es de 4,32:1 (blanco sobre #4a8…), en 8 nodos.");
out.push("- En el 12b, la fila de la crema del mostrador queda debajo del header fijo.", "");
out.push("## Capturas ★ (para el dueño)", "");
for (const c of capturas.filter((c) => ESTRELLA.has(c.id))) out.push(`- \`${c.archivo}\`: ${QUE[c.id] ?? c.nota}`);
out.push("", `Otras capturas: ${capturas.filter((c) => !ESTRELLA.has(c.id)).map((c) => path.basename(c.archivo)).join(", ")}.`, "");
out.push("## Archivos", "");
out.push(`Todos en \`${A}\`:`);
for (const f of ["semilla-sabado-ch.mts", "recorrido-sabado.mjs", "entorno-dev.mjs", "reloj.mjs", "comun.mjs", "chequeos-visuales.mjs", "visual.json", "pasos.json", "verificacion-base.json"]) out.push(`- \`${f}\``);
out.push("- `arbol-run/`: árboles accesibles", "");
out.push(`Para volver a correrlo, desde /home/user/ERP: \`node --import tsx ${A}/recorrido-sabado.mjs\`, y después \`node ${A}/escribir-resultado.mjs\`.`);
writeFileSync(path.join(A, "resultado.md"), out.join("\n") + "\n");
console.log("ok", n("OK"), n("FALLA"), n("CALLEJÓN"));
