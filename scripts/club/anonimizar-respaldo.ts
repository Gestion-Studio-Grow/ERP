// Anonimiza un respaldo del club (sobre v1, docs/tenants/breakpoint/FORMATO-RESPALDO.md) para usarlo como fixture.
// No toca ninguna base: lee un archivo y escribe otro. La lógica está en src/lib/club/anonimizar.ts.
//
//   npx tsx scripts/club/anonimizar-respaldo.ts <respaldo.json> [salida.json]
//        escribe <salida.json> (por defecto, <respaldo>.anonimo.json) e imprime el informe.
//   npx tsx scripts/club/anonimizar-respaldo.ts --ejemplo
//        rearma src/lib/club/fixtures/respaldo-ejemplo.json: el sábado de torneo armado con el motor
//        (src/lib/club/fixtures/armar-respaldo.ts) pasado por el anonimizador.
//
// Falla (código 1) si el respaldo no es válido o si en el resultado queda algún nombre, teléfono o usuario original.
// El respaldo REAL lleva PIN y datos de clientes: no se commitea; sólo su versión anonimizada.
//
// — Elaborado por GSG
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { anonimizarSobre } from "../../src/lib/club/anonimizar";
import { leerSobre, resumenDelRespaldo, type Sobre } from "../../src/lib/club/foto";
import { armarDiaDeTorneo } from "../../src/lib/club/fixtures/armar-respaldo";

export const RUTA_EJEMPLO = path.join(__dirname, "..", "..", "src", "lib", "club", "fixtures", "respaldo-ejemplo.json");

/** El texto del fixture de ejemplo (lo que se commitea y lo que compara el test). */
export function textoDelEjemplo(): string {
  const { sobre, informe } = anonimizarSobre(armarDiaDeTorneo() as Sobre);
  if (informe.residuos.length) throw new Error(`quedaron datos originales: ${informe.residuos.join(", ")}`);
  return `${JSON.stringify(sobre, null, 1)}\n`;
}

function main(argv: string[]) {
  if (argv[0] === "--ejemplo") {
    writeFileSync(RUTA_EJEMPLO, textoDelEjemplo());
    console.log(`Listo: ${path.relative(process.cwd(), RUTA_EJEMPLO)}`);
    return;
  }
  const [entrada, salidaPedida] = argv;
  if (!entrada) {
    console.error("uso: npx tsx scripts/club/anonimizar-respaldo.ts <respaldo.json> [salida.json] | --ejemplo");
    process.exit(2);
  }
  const l = leerSobre(readFileSync(entrada, "utf8"));
  if (!l.ok) {
    console.error(l.motivo);
    process.exit(1);
  }
  // El sobre crudo (no el hidratado) para no cambiar nada más que los datos personales.
  const crudo = JSON.parse(readFileSync(entrada, "utf8")) as Sobre;
  const { sobre, informe } = anonimizarSobre(crudo);
  const antes = resumenDelRespaldo(l.estado);
  const despues = leerSobre(sobre);
  if (!despues.ok) {
    console.error(`El resultado no es un respaldo válido: ${despues.motivo}`);
    process.exit(1);
  }
  const cuadra = JSON.stringify(resumenDelRespaldo(despues.estado).porDia) === JSON.stringify(antes.porDia);
  console.log(`Personas: ${informe.personas} · usuarios: ${informe.usuarios} · contactos: ${informe.contactos}`);
  console.log(`Caja por día igual al centavo: ${cuadra ? "sí" : "NO"}`);
  if (informe.residuos.length || !cuadra) {
    if (informe.residuos.length) console.error(`Quedaron datos originales: ${informe.residuos.join(", ")}`);
    process.exit(1);
  }
  const salida = salidaPedida ?? entrada.replace(/\.json$/i, "") + ".anonimo.json";
  writeFileSync(salida, `${JSON.stringify(sobre, null, 1)}\n`);
  console.log(`Listo: ${salida}`);
}

if (require.main === module) main(process.argv.slice(2));
