// ============================================================================
// TORNEOS como MÓDULO del catálogo — el vertical WPE dentro de núcleo+plugins (ADR-097).
// ============================================================================
//
// El vertical de torneos (motor WPE + persistencia + —FASE 3— superficie web/consola)
// se define como un `ModuleDescriptor` (ADR-054/055), igual que ARCA o Mercado Pago, para
// que "encaje en el modelo, no sea un injerto". Diferencias con un plugin de integración:
//
//  - kind: "capability" — NO es una integración con un servicio externo (como ARCA). Es
//    un vertical de primera parte con su propio dominio (el motor) y su propio schema (la
//    tabla `Torneo`, Gate 2). No se comunica por eventos/comandos del Core: se consume
//    directo desde su superficie. Por eso "capability", no "plugin".
//  - rubros: ["torneos"] — compatible SOLO con el blueprint `torneos` (un tenant-torneo,
//    p.ej. WPE). NO "todos": un tenant de estética no activa torneos. La ASIGNACIÓN sigue
//    siendo por tenant (variante, ADR-055), nunca "todos con todo".
//
// ⚠️ DEFINIR ≠ INSTANCIAR (ADR-053): este descriptor DEFINE el módulo, pero NO se cablea
// todavía en `DESCRIPTORES_CATALOGO` (src/modules/catalog.ts) ni en la consola de operador
// — ese cableado (activación real + backoffice) es FASE 3, con su propio Gate. Acá queda
// listo y VALIDADO (module.test.ts corre `validarDescriptor` en verde), sin activar nada
// en el producto vivo. Es el molde, no la instancia.

import { type ModuleDescriptor } from "@/modules/contract";

/** Id del blueprint del vertical de torneos (el rubro que activa este módulo). */
export const BLUEPRINT_TORNEOS = "torneos";

export const torneosModule: ModuleDescriptor = {
  id: "torneos",
  version: "1.1.0", // hereda la VERSION del motor WPE (torneo-engine.js VERSION = '1.1.0').
  nombre: "Torneos — Circuito WPE",
  descripcion:
    "Gestión de torneos de pádel (zonas + llave): armado, siembra, programación de canchas y carga de resultados/W.O. en curso. Motor determinístico probado (76 tests).",
  kind: "capability",
  capability: "torneos:manage", // habilita el backoffice del torneo (RBAC) — se cablea en FASE 3.
  rubros: [BLUEPRINT_TORNEOS],
  // Sin eventos/comandos: el vertical se consume directo, no por outbox del Core.
  migraciones: [
    {
      carpeta: "prisma/pending-gate2/Torneo.sql",
      descripcion:
        "Tabla Torneo (snapshot JSONB por tenant) + su policy RLS. Preparada, SIN aplicar (Gate 2).",
      aditiva: true,
    },
  ],
  flag: "TORNEOS_ENABLED", // rollout reversible; default OFF (persistence/flag.ts).
};
