---
id: ADR-104
nivel: organizacion
dominio: [Herramientas, Economia-de-tokens, Gobierno]
depends_on: [ADR-048, ADR-052]
---

# ADR-104 — Herramientas de Claude que GSG adopta (y las que no)

**Estado:** Aceptado (2026-11-05) por el dueño, en una sesión en la nube. · **Relacionados:** ADR-048
(Arquitecto de Solución: lo reversible se ejecuta y lo irreversible se le eleva al dueño), ADR-052 (calibración),
`Factory-GSG/10-GOBIERNO/economia-de-tokens.md`, `Factory-GSG/10-GOBIERNO/gestion-de-modelos.md`.

## Contexto (medido en el repo)

- Ya en uso y se mantiene: agentes por rol (`.claude/agents/`), workflow `tanda-gsg` (`.claude/workflows/tanda-gsg.js`),
  hook `SessionStart` (`.claude/settings.json:59`), CI de gates en cada push y PR (`.github/workflows/gates.yml:31-33`:
  lint, tsc, tests, cobertura de RLS, build, gate visual), respaldo espejo cada 6 h (`mirror-backup.yml:17`).
- El CI **no** controla si los documentos siguen coincidiendo con el código (`brain:check`, `adr:linkcheck`) ni avisa
  de PRs `claude/*` trabados.
- `Factory-GSG` guarda estados y guías como PDF y HTML sueltos (`GSG_*.pdf`, `CONSOLA-GSG.html`, `_pdf_build.py`),
  en contra de la regla «nada binario en Git».
- El dueño trabaja **sin laptop**: con el celular y con sesiones en la nube.

## Decisión

| # | Herramienta | Uso en GSG | Límite |
|---|---|---|---|
| 1 | **Tarea programada «Parte diario GSG»** | Días hábiles a las 08:45 (hora de Argentina), en una sesión nueva: `brain:check` + `adr:linkcheck` sobre `main`, más los PRs abiertos y el CI de las ramas `claude/*`. Manda un resumen de ≤ 10 líneas al celular. | Sólo lee: no commitea, no pushea, no comenta y no toca Neon. Los gates no se repiten porque ya los corre el CI. |
| 2 | **Seguimiento de PRs** | Cada PR que abre una sesión queda vigilado por esa sesión: arregla un CI rojo y responde comentarios de revisión. | **Nunca** aprueba ni mergea. Push a `main` = deploy, sólo con orden del dueño. |
| 3 | **Artifacts privados** | Tableros de estado, consola y tablero de gates del dueño y decisiones abiertas, con base de datos compartida para el dueño y Facu. Reemplazan a los PDF y HTML sueltos. | Privados por defecto: se comparte el link sólo cuando lo decide el dueño. No llevan marca de cliente sin autorización registrada. |
| 4 | **Claude Docs** | Lo que se entrega y se sigue editando: minutas, propuestas, guías de prueba. Se exporta a PDF o Word. | Reemplaza a `_pdf_build.py` para documentos nuevos. |
| 5 | **`/code-review` y `/security-review`** | Primer filtro barato sobre el diff, antes de `gsg-certificador`. | No reemplaza la certificación adversarial en plata, seguridad, concurrencia y datos. |
| 6 | **Funciones de la API de Claude en los productos** (Kudos, Fantasma, Testigo) | Caché de prompts para el sistema y el catálogo, API por lotes para lo que no es en vivo y salidas estructuradas para extraer datos. | Los precios se verifican el día que se adopta, nunca de memoria. Cada modelo se elige con una evaluación de 20 a 50 casos. |
| 7 | **Workflows multiagente** | Se sigue con `tanda-gsg`. | Menos de 10 agentes y sólo con orden explícita. |

### No se adopta

- **Acceso de una sesión en la nube a una carpeta de una computadora (Remote Control):** el dueño no tiene laptop.
  Si un día hace falta, se arma una sesión en la nube con su propio clon.
- **Conectores prendidos por defecto:** cada uno agranda el contexto fijo de todas las sesiones.
- **Fable orquestando una construcción, y el pool de sesiones reutilizables** (ya OBSOLETO).
- **Dependencias nuevas «porque están disponibles»:** se pregunta antes.

### Permisos de `.claude/settings.json`

`.claude/settings.json:8-10` deja hacer `git push origin main` sin preguntar. **Es una autorización explícita del
dueño (2026-11-05) y queda como está.** La regla de conducta sigue igual: un agente no pushea a `main` sin una orden
del dueño en esa sesión.

## Limitación conocida

`medir-consumo.mjs` (`Factory-GSG/entorno/tokens/`) lee los transcripts locales de cada sesión. Una tarea programada
que arranca en un contenedor nuevo no los ve, así que **la medición sigue al cierre de cada frente**, dentro de la
sesión que lo cerró, y no como tarea programada.

## Reversibilidad

Todo es reversible: la tarea programada se pausa o se borra, y los seguimientos de PR se cortan. Nada toca Neon,
secretos, deploys ni marcas de cliente.
