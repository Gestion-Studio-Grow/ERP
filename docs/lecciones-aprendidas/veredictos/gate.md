# 🛡️ Log de veredictos — Auditoría GSG (el Gate de Excelencia)

> Validador: **`auditoria-gsg-gate`** (Opus siempre). Append-only. La entrada más nueva va **arriba**.
> Formato por corrida:

```
### [FECHA] · <rama/commit> · <frente>
- **Veredicto:** ✅ aprobado / ⚠️ aprobado con condiciones / ❌ rechazado
- **Bloques:** 1 SAP+AR [✅/⚠️/❌] · 2 Sello [·] · 3 Arquitectura [·] · 4 Confiabilidad [·]
- **Guardarraíles chequeados:** render real (MP-16) [·] · migración-antes-de-merge (G-P2) [·] · RLS 43/43 (G-P3) [·] · secretos (G-D3) [·] · pathspec (G-M1) [·] · invariantes I1–I7 (G-D1) [·]
- **Hallazgos / condiciones:** …
- **Si se escapó algo (falso ✅):** qué era + qué chequeo lo hubiera cazado → ¿sube a registro.md?
```

---

<!-- Nuevas entradas acá arriba. Ejemplo de arranque (borrar cuando entre la primera real): -->

### [2026-07-12] · agentes/calibracion · Calibración de agentes
- **Veredicto:** N/A — corrida de bootstrap del log (sin merge auditado todavía).
- **Nota:** este log queda vacío y listo; la primera corrida real del Gate escribe la primera entrada arriba.
