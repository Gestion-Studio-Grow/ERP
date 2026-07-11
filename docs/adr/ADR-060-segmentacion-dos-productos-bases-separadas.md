---
id: ADR-060
nivel: fundacional
dominio: [Producto, Arquitectura, Negocio]
depends_on: [ADR-001, ADR-007, ADR-030, ADR-058]
---
# ADR-060: Segmentación en DOS productos — "Comercio Micro" y "PyME/Empresa" — con bases de datos separadas

**Estado:** Aceptado — **fundamento de producto y de infraestructura**. Baja a go-to-market e infra la
filosofía GROW-AR (ADR-058): la misma familia de producto se comercializa como **dos productos** con
**dos bases de datos** distintas, una por línea.
**Fecha:** 2026-07-10
**Depende de:** ADR-001 (multi-tenant pool + RLS), ADR-007 (economía por escala), ADR-030 (DEMO→VENTA→
INVERSIÓN), ADR-058 (filosofía GROW-AR: un Core, dos motores)
**Relacionado:** ADR-061 (motor invisible compartido), ADR-062 (RLS línea base), ADR-067 (Neon/DR/Ley 25.326),
ADR-059 (naming Comercio/Empresa, D7) · `docs/estrategia/costos-por-segmento.md` · `docs/estrategia/roadmap-dos-modelos.md`

---

## Contexto

ADR-058 fijó la **filosofía** (un Core, dos motores `lite`/`enterprise`, "crecé sin migrar"). Faltaba la
decisión **comercial + de infraestructura**: ¿cómo se empaqueta y se **aísla en datos** cada segmento?

Dos segmentos con perfiles de riesgo, cumplimiento y escala **muy distintos** conviven hoy sobre una sola
base Neon:

- **Comercio Micro** — el comerciante/monotributista: **alto volumen de tenants**, ticket bajo, alta rotación,
  self-serve, dato poco sensible, tolerante a mantenimiento. La economía cierra **solo si el alta es
  auto-servible** (ADR-058 P5) y el costo por tenant es mínimo (`costos-por-segmento.md`).
- **PyME/Empresa** — la empresa mediana: **pocos tenants**, ticket alto, dato sensible (fiscal, nómina, más
  superficie), exige **aislamiento, DR y cumplimiento** más fuertes (ADR-067), y ventanas de mantenimiento
  acotadas.

Mezclar ambos en **una sola base** acopla sus destinos: un incidente, una migración pesada o un pico de un
segmento golpea al otro (blast radius común), y fuerza el mismo perfil de costo/DR/cumplimiento para los dos
—caro de más para el micro, corto de más para la empresa.

## Decisión

Se adopta la **segmentación en DOS productos comerciales sobre la MISMA plataforma/motor** (ADR-061), con
**bases de datos SEPARADAS, una por línea**:

1. **Dos productos con identidad propia** — "Comercio Micro" y "PyME/Empresa" (naming al cliente
   **Comercio/Empresa**, ADR-059 D7). Marca, módulos, flujos, precio y onboarding se **diferencian 100%**
   (ADR-061); el motor por debajo es **el mismo** (config-sobre-código).
2. **Una base de datos por producto** — cada línea corre en **su propia base** (su propio proyecto/plan Neon):
   `db-comercio` (muchos tenants, pool shared-schema + RLS) y `db-empresa` (pocos tenants, mismo pool
   shared-schema + RLS, plan/DR más exigente por ADR-067). **Dentro de cada base**, el modelo multi-tenant
   sigue siendo **pool shared-schema + RLS** (ADR-001/ADR-062) — la separación es **entre productos**, no
   por-tenant.
3. **"Crecé sin migrar" es intra-producto** — el invariante `enterprise ⊇ lite` (ADR-058 P3) opera **dentro
   de una misma base**: encender más profundo el motor **no** mueve de base. El salto **Comercio Micro →
   PyME/Empresa** (cambiar de producto y de base) es un camino **distinto y menos frecuente** —una migración
   asistida explícita, no el flujo cotidiano— y se trata como tal (ver Consecuencias).
4. **Blast radius e independencia** — incidentes, migraciones, ventanas de mantenimiento, backups/PITR y perfil
   de costo/cumplimiento se **deciden por producto**, sin arrastrar al otro.

> **En una línea:** *dos productos, dos bases, un solo motor invisible por debajo — cada segmento con su
> perfil de costo, aislamiento y DR, sin que uno cargue el peso del otro.*

## Consecuencias

- **(+)** **Aislamiento de destino:** un problema de datos/costo/DR de un segmento no contamina al otro; cada
  base escala y se protege según su realidad (micro barato y self-serve; empresa robusto y con DR duro, ADR-067).
- **(+)** **Cumplimiento a medida:** la base empresa puede exigir PITR/retención/DR (Ley 25.326, ADR-067) sin
  imponer ese costo a la base micro de alto volumen.
- **(+)** **Coherente con la economía** (`costos-por-segmento.md`, ADR-007): el cuello es la mano de obra; el
  micro se sostiene con alta densidad de tenants en una base barata, la empresa con pocos tenants en una base cara.
- **(−)** **El salto de producto es una migración:** mover un tenant de `db-comercio` a `db-empresa` **no** es
  "encender un flag" — es exportar/importar aislado por `tenantId`. Contradice en apariencia "crecé sin migrar";
  se resuelve acotando la promesa a **intra-producto** y diseñando un **runbook de promoción** asistida (raro,
  no cotidiano). Documentado, no construido.
- **(−)** **Duplica operación de plataforma:** dos bases = dos sets de migraciones/secretos/monitoreo/DR. Se
  mitiga con **un solo motor y un solo pipeline de release** (ADR-070) que despliega el mismo código a ambas.
- **(−)** **Cross-tenant analytics** (ADR-027) queda **por-base**; agregación entre productos, si alguna vez se
  necesita, es un pipeline de plataforma separado (nunca el plano del tenant).

## Alternativas descartadas

- **Una sola base para ambos segmentos (status quo).** Simple hoy, pero acopla blast radius, costo y
  cumplimiento; fuerza a la empresa al perfil del micro (o al micro al costo de la empresa). Rechazada: el
  riesgo/costo compartido es justo lo que la segmentación quiere cortar.
- **Base (o schema) dedicada POR TENANT desde el día uno.** Máximo aislamiento pero **rompe la economía del
  micro** (ADR-007/ADR-001): miles de bases = costo y operación inviables. ADR-001 ya reservó DB dedicada solo
  para *enterprise puntuales*; esto lo respeta.
- **Dos productos con dos motores/código separados (fork).** Diferenciar de verdad pero **duplicar el núcleo**
  → doble mantenimiento y drift. Rechazada: la diferenciación es de **config**, no de código (ADR-061).
- **Un solo producto "que hace todo".** Menos marketing, pero mezcla dos audiencias con expectativas opuestas
  (anti-rechazo enterprise vs. simple para el micro, ADR-059 D8). Rechazada por producto.

— Elaborado por GSG (PMO / Arquitecto de Solución — fundamento, reversible/doc-only; la separación física de bases es infra POST-venta, Gate del dueño)
