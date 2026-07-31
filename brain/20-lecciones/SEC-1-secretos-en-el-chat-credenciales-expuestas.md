---
id: SEC-1
categoria: SEC
tipo: leccion
generado: true
tags: [brain/leccion, leccion/sec]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [SEC-1] Secretos en el chat / credenciales expuestas

**Categoría:** Seguridad

> 🛡️ **Guardarraíl (la regla verificable):**
> **el agente NUNCA toca secretos**; si un secreto se **expuso, se ROTA** de inmediato; el repo lleva solo la **plantilla** (`.env.vercel.template`).

**Lección:** menos manos sobre el secreto = menos superficie de fuga; el secreto no pasa por el chat ni por el repo.

## Detalle

- **Síntoma:** riesgo de pegar un secreto (connection string, password) en el chat o en un campo.
- **Causa raíz:** falta de una regla dura sobre quién y cuándo introduce secretos.
- **Fix:** **dos fases de credenciales** — demo sin secretos; datos reales con secretos que **pega el dueño**, nunca el agente.
- **Lección:** menos manos sobre el secreto = menos superficie de fuga; el secreto no pasa por el chat ni por el repo.
- **Guardarraíl:** **el agente NUNCA toca secretos**; si un secreto se **expuso, se ROTA** de inmediato; el repo lleva solo la **plantilla** (`.env.vercel.template`).
- **Refs:** ADR-041, ADR-031.

## Decisiones relacionadas

- [ADR-031](../30-decisiones/ADR-031.md)
- [ADR-041](../30-decisiones/ADR-041.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
