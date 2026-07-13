# 🧭 Log de veredictos — Challenger (contrarian / red-team, ADR-045)

> Validador: **`challenger`**. Append-only. La entrada más nueva va **arriba**.
> Formato por corrida (con la **rúbrica de scoring fija** — ver `.claude/agents/challenger.md`):

```
### [FECHA] · <propuesta/fundamento desafiado>
- **Score 0–10 por dimensión:** Demanda/mercado [·/10] · Moat/diferencial [·/10] · Plata/unit-economics [·/10] · Ejecución/riesgo [·/10] · Evidencia real (no humo) [·/10]
- **Score global:** [·/10]  (umbral de adopción: ≥ 7)
- **Veredicto:** ✅ sobrevive / ⚠️ sobrevive con cambios / ❌ no se adopta como fundamento
- **Supuestos débiles / riesgos / alternativa más fuerte:** …
- **Qué subió el score (si iteró):** ej. "Shine 4.5 → 8.5 tras atar la demanda a evidencia real"
```

---

<!-- Nuevas entradas acá arriba. Ejemplo de arranque (borrar cuando entre la primera real): -->

### [2026-07-12] · Bootstrap del log
- **Nota:** log vacío y listo. La rúbrica fija vive en el agente `challenger`; la primera corrida real
  escribe arriba. Caso de referencia histórico: **Shine 4.5 → 8.5** (la iteración que este log ahora
  preserva en vez de dejarla en la cabeza de una sesión).
