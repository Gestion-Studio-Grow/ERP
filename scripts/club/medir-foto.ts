// Cuánto pesa la foto del club (BP-3): el ejemplo del torneo, la demo del día y un club lleno 30 y 60 días.
// Mide el texto (lo que se manda y se guarda), su gzip (lo que viaja comprimido y, aprox., lo que ocupa en la base:
// Postgres comprime los `jsonb` grandes con TOAST) y cuánto tarda armar el texto.
//
//   npx tsx scripts/club/medir-foto.ts
//
// No toca ninguna base. — Elaborado por GSG
import { gzipSync } from "node:zlib";
import * as M from "../../src/lib/club/motor.mjs";
import { armarDiaDeTorneo, armarMesCargado, HOY_TORNEO } from "../../src/lib/club/fixtures/armar-respaldo";

function medir(nombre: string, armar: () => unknown) {
  const foto = armar();
  const t0 = performance.now();
  const texto = JSON.stringify(foto);
  const ms = performance.now() - t0;
  const gz = gzipSync(texto).length;
  const e = (foto as { estado: M.EstadoClub }).estado;
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `${nombre.padEnd(22)} texto ${kb(Buffer.byteLength(texto)).padStart(9)} · gzip ${kb(gz).padStart(7)} (×${(Buffer.byteLength(texto) / gz).toFixed(1)}) · ` +
      `stringify ${ms.toFixed(0)} ms · ${e.reservas.length} turnos, ${e.cuentas.length} cuentas, ${e.caja.movimientos.length} movimientos`,
  );
}

medir("día de torneo", armarDiaDeTorneo);
medir("demo del día", () => ({ v: 1, estado: M.generarDemo(HOY_TORNEO), secuencia: M.secuenciaIds() }));
medir("un mes cargado (30 d)", () => armarMesCargado(HOY_TORNEO, 30));
medir("dos meses (60 d)", () => armarMesCargado(HOY_TORNEO, 60));
