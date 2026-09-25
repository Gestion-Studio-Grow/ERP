// Acceso común del LABORATORIO (pedido del dueño, 2026-09-25). Núcleo y reglas:
// src/lib/seed/acceso-comun-lab.ts. Sólo contra un Postgres de esta máquina, con el rol dueño.
//
// Restaurar (la clave NO va en la línea de comandos ni sale por pantalla):
//   LAB_CLAVE_COMUN='<clave>' DATABASE_URL='postgresql://postgres@localhost:5433/erp_lab?host=/tmp/pgrun' \
//     npx tsx scripts/lab-acceso-comun.mts --respaldo /ruta/fuera/del/repo/respaldo.json \
//       --credenciales /ruta/fuera/del/repo/credenciales.md
// Volver atrás, con ese mismo respaldo:
//   DATABASE_URL='…' npx tsx scripts/lab-acceso-comun.mts --revertir /ruta/respaldo.json
//
// El respaldo guarda cómo estaba cada usuario (hash de clave, rol, alta/baja). `--credenciales`
// (opcional) escribe el .md con el usuario común, la clave y cada negocio, para que el dueño lo
// guarde. Los dos se escriben con permisos 600, nunca pisan uno existente y se escriben ANTES de
// confirmar: si alguno no se puede escribir, o la confirmación falla, no cambia nada y se borra lo
// que esta corrida alcanzó a escribir. Fuera del repo: no se commitean.

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { baseLocalParaSeed } from "../src/lib/seed/guarda-base";
import { validatePasswordStrength } from "../src/lib/password-policy";
import { hashPassword } from "../src/lib/auth-password";
import {
  EMAIL_COMUN,
  NOMBRE_COMUN,
  restaurarAccesoComun,
  revertirAccesoComun,
  type AccesoDelNegocio,
  type RespaldoDeAcceso,
} from "../src/lib/seed/acceso-comun-lab";

function abortar(motivo: string): never {
  console.error(`acceso común: abortado. ${motivo}`);
  process.exit(1);
}

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function credencialesEnMarkdown(base: string, email: string, clave: string, negocios: AccesoDelNegocio[], respaldo: string): string {
  const filas = negocios.map(
    (n) => `| ${n.nombre} | ${n.slug} | ${n.subdominio ?? "-"} | ${n.usuarios.map((u) => `${u.email} (${u.rol})`).join(", ")} |`,
  );
  return [
    `# Acceso al laboratorio del ERP`,
    ``,
    `Generado: ${new Date().toISOString()} · Base: \`${base}\` (Postgres de esta máquina, no producción).`,
    ``,
    `- **Usuario común:** \`${email}\` (dueño en cada negocio)`,
    `- **Clave común:** \`${clave}\``,
    ``,
    `La misma clave entra también con cada usuario de la tabla. Se entra por \`/admin/login\` en la`,
    `dirección de cada negocio (en el servidor de pruebas: \`http://<subdominio>.localhost:3210\`, si el`,
    `negocio está en su TENANT_HOST_MAP).`,
    ``,
    `| Negocio | Slug | Subdominio | Usuarios |`,
    `|---|---|---|---|`,
    ...filas,
    ``,
    `Volver atrás (cada usuario como estaba): \`DATABASE_URL=… npx tsx scripts/lab-acceso-comun.mts --revertir ${respaldo}\``,
    ``,
    `Guardalo en tu gestor de contraseñas y borrá este archivo.`,
    ``,
  ].join("\n");
}

const url = process.env.DATABASE_URL;
if (!baseLocalParaSeed(url).ok) {
  abortar("Este paso cambia contraseñas: sólo corre contra un Postgres de esta máquina, nunca contra Neon.");
}

const rutaRevertir = argumento("--revertir");
const rutaRespaldo = argumento("--respaldo");
const rutaCredenciales = argumento("--credenciales");
if (!rutaRevertir && !rutaRespaldo) abortar("Falta --respaldo <archivo> (o --revertir <archivo>).");

// El .md lleva la clave en claro y el respaldo, los hashes: dentro del árbol del repo (compartido
// entre sesiones) cualquiera los puede commitear. Se exige una ruta afuera.
const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
for (const ruta of [rutaRespaldo, rutaCredenciales]) {
  if (ruta && (resolve(ruta) === REPO || resolve(ruta).startsWith(REPO + sep))) {
    abortar(`El respaldo y las credenciales se escriben fuera del repo (${REPO}).`);
  }
}

let clave = "";
let respaldoPrevio: RespaldoDeAcceso | null = null;
if (rutaRevertir) {
  try {
    respaldoPrevio = JSON.parse(readFileSync(rutaRevertir, "utf8")) as RespaldoDeAcceso;
  } catch {
    abortar("No se pudo leer el respaldo indicado en --revertir.");
  }
} else {
  clave = process.env.LAB_CLAVE_COMUN ?? "";
  const politica = validatePasswordStrength(clave);
  if (!politica.ok) abortar(`La clave común (LAB_CLAVE_COMUN) no sirve: ${politica.problems.join(" ")}`);
}

const escritos: string[] = [];
function escribirNuevo(ruta: string, contenido: string) {
  // "wx": si el archivo ya existe, falla y la transacción no se confirma.
  writeFileSync(ruta, contenido, { flag: "wx", mode: 0o600 });
  escritos.push(ruta);
}

const db = new pg.Client({ connectionString: url });
try {
  await db.connect();
  if (respaldoPrevio) {
    const n = await revertirAccesoComun(db, respaldoPrevio);
    console.log(`acceso común: revertido. ${n} usuarios quedaron como estaban; ${respaldoPrevio.creados.length} usuarios comunes borrados.`);
  } else {
    const email = EMAIL_COMUN;
    const negocios = await restaurarAccesoComun(db, {
      email,
      nombre: NOMBRE_COMUN,
      hashDeLaClave: await hashPassword(clave),
      guardarRespaldo: (r, acceso) => {
        escribirNuevo(rutaRespaldo!, JSON.stringify(r, null, 2));
        if (rutaCredenciales) {
          const base = decodeURIComponent(new URL(url!).pathname.replace(/^\//, ""));
          escribirNuevo(rutaCredenciales, credencialesEnMarkdown(base, email, clave, acceso, rutaRespaldo!));
        }
      },
    });
    console.log("acceso común: listo. Negocio | subdominio | usuarios (todos con la clave común)");
    for (const n of negocios) {
      console.log(`${n.slug} | ${n.subdominio ?? "-"} | ${n.usuarios.map((u) => `${u.email} (${u.rol})`).join(", ")}`);
    }
  }
} catch (e) {
  for (const ruta of escritos) {
    try {
      unlinkSync(ruta);
    } catch {
      console.error(`acceso común: no se pudo borrar ${ruta}; borralo a mano, el cambio no se aplicó.`);
    }
  }
  abortar(e instanceof Error ? e.message : "error inesperado.");
} finally {
  await db.end().catch(() => {});
}
