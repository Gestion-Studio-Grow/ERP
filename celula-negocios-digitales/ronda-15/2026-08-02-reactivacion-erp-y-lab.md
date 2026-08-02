# Ronda 15 — Reactivación del ciclo: ERP + GSG Lab

> **Paso ③ del motor cíclico** (`MOTOR-SPRINT-CICLICO.md`): entrega al dueño. El paso ④ —la visión que
> prioriza y gatea— es suyo. **Nada de acá se ejecuta sin su OK.**
>
> **Fecha:** 2026-08-02 · **Equipo convocado:** PMO (relevamiento) · Advisory (tesis) · Challenger
> (antítesis) · síntesis del Gate en Opus. Los tres subagentes corrieron en **Sonnet declarado
> explícitamente** — sus charters no traen `model:`, así que sin declararlo habrían heredado Opus.

---

## 1. El hecho que ordena todo lo demás

**Hace 20 días que no se toca el producto.** El último commit sobre `src/` o `prisma/` es del **13 de
julio** (`ee25ed2`). Todo lo posterior fue herramienta, no producto — incluido el segundo cerebro que se
construyó hoy.

No es un reproche a la herramienta: el cerebro se pagó solo destapando drift que nadie veía. Es un dato
de dirección. **Si el próximo frente también es tooling, van a ser 25 días.**

## 2. Semáforo

| Frente | Estado | Por qué |
|---|---|---|
| **ERP** | 🟡 a medias | fundaciones construidas, 20 días sin commits de producto, docs de estado con 3 semanas de drift |
| **GSG Lab** | 🔴 parado | cero commits desde el 07-07; radar de desregulaciones con una sola lectura, del 06-07 |

## 3. Lo que existe de verdad vs. lo que está escrito

**GSG Lab — los 4 negocios "en desarrollo".** Hay **código real** (clasificador de reseñas, máquina de
estados de WhatsApp, pipeline foto→PDF). Pero **ninguno cumple el estándar del propio Lab**: `/lab/<producto>`
**no existe como ruta** (verificado: cero resultados en `src/app`), las dependencias están declaradas sin
instalar y el LLM está mockeado. Son prototipos de escritorio, no demos servidas.

**Colisión de migraciones `20260711140000`.** Revisado el SQL: tablas independientes y aditivas, sin
solapamiento. **No bloquea.** Es higiene, no un riesgo — se corrige el diagnóstico anterior.

## 4. El choque entre la tesis y el relevamiento (lo más valioso de esta vuelta)

**Tesis (Advisory):** el ERP come primero. Tres tenants provisionados esperando *solo* el Gate 1 de
deploy — "el fruto más bajo de cortar". El Lab baja a quincenal.

**Antítesis (Challenger), verificada:** ese "solo un clic" **no es cierto**, y el precedente está en el
propio registro de lecciones:

- **`main` sigue *schema-ahead* por 9 migraciones sin aplicar.** Es **el mismo patrón exacto que tumbó a
  CH el 9 de julio** (vidriera pública + `/admin/facturacion` caídas). Los dos hotfixes que salvaron a CH
  fueron parches puntuales, no una auditoría de que todo camino tolere columnas faltantes — y Magra es
  blueprint de carnicería, no el mismo camino que se parcheó.
- **RLS enforced en vivo sigue "A CONFIRMAR".** Nunca se corrió `check-rls-live.mjs`. Sumar 3 tenants
  antes de confirmarlo es el escenario de MT-1 y SEC-2.
- **Ninguno queda vendible con el deploy solo:** el copy de Shine y ADM está marcado **provisional**
  (DX-5 / I7: falta material real del dueño, las fuentes de Instagram están tras login).

**Y el golpe más fino del Challenger:** meter *todo* el Lab en P3 mezcla dos cosas de urgencia distinta.
Generar ideas nuevas es P3, sí. Pero **terminar de cablear y lanzar 4 productos ya construidos es
exactamente el mismo tipo de tarea que "publicar los tenants que faltan"** — que `CLAUDE.md` pone en P1.
El propio motor del Lab ya lo separaba: "④ desarrollar en paralelo" nunca dependió del ciclo de research.

## 5. Lo que el Lab ya se había diagnosticado, y nadie ejecutó

De `MOTOR-SPRINT-CICLICO.md`, escrito por la propia célula tras los ciclos 1-2:

> **"El costo real no es construir (barato con Claude Code), es DISTRIBUIR/vender."**

Y de su ADR: **"0 canales construidos — firmar 2 estudios contables y 1 federación antes que código
nuevo."** El Lab sabía que su cuello de botella era distribución **y siguió construyendo producto**.
Cuatro negocios, cero pesos, un mes. Bajar la cadencia de investigación no toca ese eje.

## 6. Síntesis — qué recomienda el Gate

Ni "ERP primero, Lab espera" (mata el Lab por inanición: la cola del ERP nunca se vacía), ni los dos
frentes al mismo nivel. El corte correcto **no es por sigla, es por naturaleza del trabajo**:

| Cola | Qué entra | Prioridad |
|---|---|---|
| **A — cerrar lo ya construido** | los 3 tenants (con los riesgos de §4 resueltos) · cablear y lanzar los 4 productos del Lab · canales de distribución | **P1** |
| **B — investigación nueva** | generar/rankear oportunidades, radar de desregulaciones | **P3**, quincenal + gatillo por evento |

**Antes de tocar deploy, tres verificaciones baratas** (ninguna toca prod):

1. Correr `check-rls-live.mjs` → cerrar el "A CONFIRMAR" que arrastra desde julio.
2. Auditar que las 9 migraciones pendientes no rompan los blueprints de Magra/Shine/ADM — **es el bug
   de CH esperando repetirse**.
3. Reconciliar `ESTADO-ACTUAL.md` contra el repo (3 semanas de drift; el banner contradice al cuerpo).

## 7. Lo que solo puede responder el dueño (paso ④)

Ningún agente puede sacar esto del repo. **De estas respuestas depende el próximo movimiento:**

1. **¿Qué tenants están publicados HOY de verdad?** El repo dice qué existe, no qué se publicó.
2. **¿Qué migraciones corrieron realmente en Neon?**
3. **¿Los 4 productos del Lab salen a vender, o quedan como prototipos?** Hoy están estructuralmente
   impedidos de facturar: la norma dice "todo local hasta el OK del dueño". La métrica "0 de 4 llegaron
   al primer peso" **no mide desempeño de la célula — mide un gate que es suyo.**
4. **¿Cuál es la condición de salida de "el ERP come primero"?** Sin una, el Lab muere de a poco.

---

— Elaborado por Gestión Studio Grow (GSG)
