---
tipo: mapa
generado: false
tags: [brain/entrada]
---

# 🧠 El segundo cerebro de GSG — entrada del vault

**Qué es:** el **mapa** del conocimiento del proyecto. Notas chicas y atómicas que te (nos) dicen
**qué existe y dónde está**, para no tener que leer el corpus entero cada vez que arrancás.

**Qué NO es:** un reemplazo de `docs/`. `docs/` es el **territorio** — el razonamiento completo, los
ADRs, las lecciones narradas. Este vault **apunta**, nunca aplana (regla de ADR-008: *el "porqué" es
lo que evita rediscutir lo mismo en 6 meses*).

---

## Por qué existe (el número que lo justifica)

De `docs/metricas/costo-uso-factory.md`, medido sobre 89 sesiones reales:

| Componente del gasto | % |
|---|---:|
| Cache read (releer contexto) | 52,0% |
| Cache write | 34,5% |
| **Generar (output)** | **12,9%** |

**El 86% de lo que se paga es acarrear contexto, no producir.** Hoy, para saber *"¿en qué estamos?"*
una sesión lee `ESTADO-ACTUAL.md` (44 KB) y para calibrarse lee `registro.md` (38 KB) entero. El vault
convierte eso en: **una foto derivada de 3 KB + el índice de la lección que aplica**.

---

## Cómo se usa

### Vos, en Obsidian
Abrí **la raíz del repo** como vault (no solo `brain/`) — así navegás el mapa *y* saltás al documento
real de `docs/` con un click. Si abrís solo `brain/`, los enlaces a `docs/` quedan fuera del vault y
no resuelven. Graph view y backlinks funcionan sobre enlaces markdown de siempre; no hace falta
ningún plugin ni sintaxis rara, y todo sigue leyéndose bien en GitHub.

La config del vault está versionada en `.obsidian/app.json`: ignora `node_modules/` y `.next/` (si no,
el grafo es ilegible), y manda **toda nota nueva a `brain/90-notas/`** — así una captura rápida desde
el celular nunca cae en la zona generada, que se pisa en el próximo sync.

### Desde el celular
El repo pesa ~57 MB (34 de árbol + 23 de historia): entra sin drama en un teléfono.

- **Solo leer, cero setup:** abrí este archivo en la app de GitHub. Los enlaces son markdown estándar,
  así que navegás el mapa igual — sin grafo, pero sin instalar nada.
- **Android:** Obsidian (gratis) + plugin de comunidad **Obsidian Git** → clonás el repo y sincronizás
  con un botón. La config de arriba viaja en el clone: se abre ya configurado.
- **iOS:** **Working Copy** (cliente git) para clonar, y desde Obsidian abrís esa carpeta como vault.
  Es el camino estándar en iPhone porque iOS no deja que Obsidian hable git por sí solo.
- **Sin git:** Obsidian Sync (pago) o poner el vault en iCloud/Drive. Anda, pero perdés el historial y
  se desincroniza de lo que hacen las sesiones — no lo recomiendo para este vault.

**Regla en el celular:** capturá en `brain/90-notas/` y sincronizá. Lo que tenga que durar se muda
después a `docs/` desde una sesión, no a mano desde el teléfono.

### Los agentes, en cada sesión
Fase 0 de `CLAUDE.md` arranca acá:

1. **[Estado](10-estado/ESTADO.md)** — foto derivada de git + migraciones + corpus. Reemplaza la
   lectura completa de `ESTADO-ACTUAL.md` salvo que necesites el detalle narrativo.
2. **[Guardarraíles](20-lecciones/000-INDICE.md)** — una línea por lección. Abrís **solo la que
   aplica** al área que vas a tocar (ADR-052).
3. **[Decisiones](30-decisiones/000-INDICE.md)** — una línea por ADR, con link al ADR real.
4. Para una lista de lectura acotada por tema: `npm run adr:context -- <keywords>`.

---

## Las dos zonas (regla dura)

| Zona | Carpetas | Quién escribe | Qué pasa si escribís ahí |
|---|---|---|---|
| **Generada** | `10-estado/`, `20-lecciones/`, `30-decisiones/` | `npm run brain` | **Se pisa** en el próximo sync. Nunca escribas acá. |
| **Humana** | `90-notas/` | vos (o el agente, a pedido) | Se conserva. Captura rápida, ideas, pendientes. |

Conocimiento que tiene que durar **no vive en el vault**: va a `docs/` (ADR, lección, playbook) y el
vault lo indexa solo. Así hay una sola fuente de verdad y el mapa no puede contradecir al territorio.

## Cómo se mantiene

- `npm run brain` — regenera la zona generada (determinístico, **cero tokens**: lo corre Node).
- `npm run brain -- --check` — falla si el vault quedó viejo. Apto para el Gate o un hook.
- La retro de cada sprint (ADR-047) suma la lección a `docs/lecciones-aprendidas/registro.md`; el
  próximo `npm run brain` la convierte en nota atómica sola.

---

— Elaborado por GSG
