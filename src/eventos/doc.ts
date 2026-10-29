// Genera docs/integrations/eventos.md DESDE el catálogo (P2-C7). Puro: devuelve el texto.
// Lo escribe `npx tsx src/eventos/generar-doc.ts`; catalogo.test.ts falla si el archivo quedó viejo.

import { definiciones, type DefinicionEvento, type Familia } from "./catalogo";

const TITULO_FAMILIA: Record<Familia, string> = {
  retail: "Retail (comercio, carnicería, perfumería, pádel-tienda, supermercado)",
  compartido: "Compartidos (retail y club)",
  club: "Club (club social/deportivo, pádel-clases, buffet, cuotas)",
  n2: "Agregados por el plan del nivel 2 (§4.1.2)",
};

function sobreDeEjemplo(d: DefinicionEvento<unknown>): string {
  const sobre = {
    id: "evt_8f2c…",
    tipo: d.tipo,
    version: d.version,
    negocio: "<tenantId>",
    ocurridoEn: "2026-10-28T17:03:11.000Z",
    clave: d.clave.split(" ")[0],
    datos: d.ejemplo,
  };
  return JSON.stringify(sobre, null, 2);
}

export function generarDocEventos(): string {
  const defs = definiciones();
  const l: string[] = [];
  l.push("# Eventos de dominio · catálogo v1");
  l.push("");
  l.push("<!-- GENERADO desde src/eventos/catalogo.ts con `npx tsx src/eventos/generar-doc.ts`. No editar a mano: el test del catálogo falla si queda viejo. -->");
  l.push("");
  l.push("Convención `dominio.hecho@N`. Cada evento viaja en un sobre común y se guarda en el outbox (`OutboxEvent.type = \"tipo@N\"`).");
  l.push("");
  l.push("```json");
  l.push('{ "id": "evt_…", "tipo": "pedido.cobrado", "version": 1, "negocio": "<tenantId>", "ocurridoEn": "<ISO 8601>", "clave": "pedido:<id>:cobrado", "datos": { … }, "enlaces": { … } }');
  l.push("```");
  l.push("");
  l.push("Reglas:");
  l.push("");
  l.push("1. Agregar un campo opcional **no** sube la versión; sacar, renombrar o cambiar el tipo **sí** (`@2`), y durante una ventana se emiten las dos.");
  l.push("2. `clave` es única por hecho y por negocio: reemitir el mismo hecho no duplica (la de `@N≥2` se guarda con el sufijo `@N`).");
  l.push("3. Los eventos de plata se emiten **dentro de la transacción** que produce el hecho: si el hecho vuelve atrás, el evento también.");
  l.push("4. Datos personales: ids y montos. Nunca teléfono ni documento en claro; los campos `…Enmascarado` llevan `******1234` y los textos libres se redactan (emails y tiradas de 6+ dígitos enmascarados).");
  l.push("5. Hasta que se aplique `N2_hub.sql` (Gate 2) la clave viaja en `payload._clave`; con la migración, en la columna `OutboxEvent.clave` (única por negocio).");
  l.push("6. Hasta la tanda P3 (despachante y webhooks) nadie entrega estos eventos: quedan en el outbox con `processedAt` NULL. El despacho de ARCA toma sólo `InvoiceCreated`. P3 decide qué hace con lo acumulado (una suscripción nueva no recibe eventos de antes de existir).");
  l.push("7. `externalRef` es la referencia que manda el integrador por la API (`ext:<ref>`) y viaja tal cual, sin redactar: es para cruzar con su sistema. No lleva datos personales.");
  l.push("");
  const emitidos = defs.filter((d) => d.emision === "P2").length;
  l.push(`Total: **${defs.length} eventos** en el catálogo · **${emitidos} emitidos hoy** (P2) · el resto, pendiente de la tanda que se indica.`);
  l.push("");
  l.push("| Evento | Familia | Emisión | Plata |");
  l.push("|---|---|---|---|");
  for (const d of defs) l.push(`| \`${d.tipo}@${d.version}\` | ${d.familia} | ${d.emision} | ${d.plata ? "sí" : ""} |`);
  l.push("");

  for (const familia of Object.keys(TITULO_FAMILIA) as Familia[]) {
    const deLaFamilia = defs.filter((d) => d.familia === familia);
    if (!deLaFamilia.length) continue;
    l.push(`## ${TITULO_FAMILIA[familia]}`);
    l.push("");
    for (const d of deLaFamilia) {
      l.push(`### \`${d.tipo}@${d.version}\``);
      l.push("");
      l.push(`- **Cuándo:** ${d.cuando}`);
      l.push(`- **Emisión:** ${d.emision}${d.plata ? " · evento de plata (dentro de la transacción)" : ""}${d.soloApiLocal ? " · sólo API local, nunca por webhook" : ""}`);
      l.push(`- **Clave:** \`${d.clave}\``);
      l.push(`- **datos:** \`${d.esquema.describir()}\``);
      l.push("");
      l.push("```json");
      l.push(sobreDeEjemplo(d));
      l.push("```");
      l.push("");
    }
  }
  l.push("— Elaborado por GSG · Gestión Studio Grow");
  l.push("");
  return l.join("\n");
}
