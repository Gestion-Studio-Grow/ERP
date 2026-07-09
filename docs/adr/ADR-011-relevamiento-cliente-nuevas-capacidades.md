---
id: ADR-011
nivel: evolutiva
dominio: [Producto]
depends_on: [ADR-001, ADR-004, ADR-010]
---
# ADR-011: Relevamiento con el cliente — nuevas capacidades del piloto

**Estado:** Aceptado — pendiente de implementación (se agenda después de cerrar G1)
**Fecha:** 2026-07-02
**Depende de:** ADR-001 (tenant), ADR-004 (overbooking/`EXCLUDE`), ADR-010 (convergencia)
**Contexto:** Carolina relevó con su operación real cinco necesidades concretas. Se documentan acá como decisiones de arquitectura antes de implementarlas, para que cada una entre por su brecha en el roadmap de ADR-010 y no como parches sueltos. Ninguna se implementa en esta sesión: primero se cierra G1 (tenant_id), luego entran como Ola 2.

Todas las tablas nuevas nacen **con `tenant_id` desde la primera migración** (ADR-001, ya no se repite el error del piloto).

---

## 1. Categorías de servicios — `ServiceCategory` (nueva brecha **G16**)

**Necesidad:** agrupar los 79 servicios en categorías: **Faciales, Cejas y pestañas, Manos, Pies, Masajes, Corporales, Spa**. Hoy los servicios son una lista plana.

**Decisión:** modelo `ServiceCategory` (tenant-scoped, ordenable) y `Service.categoryId` opcional. La categoría ordena el catálogo público (acordeón por categoría) y el admin. Opcional en el `Service` para no romper los 79 existentes; se backfillean a su categoría en un paso posterior con Carolina (ella sabe qué servicio va en cada una — no adivinar, mismo criterio que el precio de "piernas").

```prisma
model ServiceCategory {
  id       String    @id @default(cuid())
  tenantId String
  name     String    // "Faciales", "Masajes", "Spa", ...
  order    Int       @default(0)
  services Service[]
  @@index([tenantId, order])
}
// Service gana: categoryId String?  + relación
```

**Nota — servicios de spa nuevos:** *Ducha escocesa* y *Pileta climatizada* son **carga de datos**, no una brecha. Van bajo la categoría **Spa**. Salvedad de diseño: son amenities de acceso, no necesariamente atados a un profesional o box como un tratamiento. Se cargan como `Service` normales por ahora; si necesitan lógica distinta (acceso por franja, sin profesional), se revisa. Se cargan cuando G16 esté hecho.

## 2. Novedades / disponibilidad por profesional (brecha existente **G9**, ampliada)

**Necesidad:** los profesionales no están siempre; hay que armar su cronograma con **novedades y fechas disponibles** para que se bloquee la agenda cuando no están.

**Decisión:** esto **es G9** (ADR-010), ampliado. Hoy el bloqueo es por box (`BoxBlock`). Se agrega el equivalente por profesional. Dos conceptos:
- **Bloqueo (`ProfessionalBlock`)**: rango en el que el profesional NO está (franco, vacaciones, novedad puntual). Misma estructura de rangos `TSTZRANGE` que `BoxBlock`.
- El **horario habitual** ya existe (`WorkingHours` por día). El bloqueo lo *recorta* para fechas concretas.

```prisma
model ProfessionalBlock {
  id             String   @id @default(cuid())
  tenantId       String
  professionalId String
  startsAt       DateTime // UTC (AMD-004)
  endsAt         DateTime
  reason         String   // "vacaciones", "franco", "curso"
  @@index([professionalId, startsAt, endsAt])
}
```
La disponibilidad de turnos ya consulta `WorkingHours` + `BoxBlock`; se le suma `ProfessionalBlock`. Mismo patrón zona-horaria de G6.

## 3. Recursos con capacidad — máquinas y gabinetes (nueva brecha **G17**)

**Necesidad:** un turno consume **recursos** limitados. Ej.: hay **2 radiofrecuencias**, asignadas a los servicios de radio → no se pueden dar 3 turnos de radio a la misma hora aunque haya profesional y box libres. Ídem **3 gabinetes** compartidos entre servicios. Evitar que se saque un turno cuando la máquina/gabinete ya está ocupado por otro servicio.

**Decisión (la más significativa del relevamiento):** modelar **pools de recursos con capacidad**. Un `Resource` tiene una cantidad (`quantity`). Un servicio declara qué recursos consume (`ServiceResource`, típicamente 1 unidad). Al reservar, además de profesional y box, se verifica que en el rango pedido no haya más de `quantity` turnos usando ese recurso.

```prisma
model Resource {
  id       String            @id @default(cuid())
  tenantId String
  name     String            // "Radiofrecuencia", "Gabinete"
  quantity Int               @default(1) // 2 radiofrecuencias, 3 gabinetes
  services ServiceResource[]
  @@index([tenantId])
}
model ServiceResource {
  id         String   @id @default(cuid())
  tenantId   String
  serviceId  String
  resourceId String
  units      Int      @default(1) // cuántas unidades consume el servicio
  @@unique([serviceId, resourceId])
}
```

**Vínculo con ADR-004 / G2:** esto es una **segunda dimensión de overbooking**, además de profesional y box. Cuando G2 lleve la prevención al motor con `EXCLUDE USING GIST`, la capacidad de recurso entra como parte de esa verificación (un recurso con `quantity>1` es un pool: se cuentan solapamientos en el rango, no se excluye binariamente como el box). Por eso **G17 se implementa junto o después de G2**, no antes: comparten la lógica de solapamiento temporal. Mientras tanto, verificación a nivel de aplicación (misma Alternativa A que ya usamos, consciente) para no bloquear el valor.

## 4. Comisión por profesional **y** servicio (nueva brecha **G18**)

**Necesidad:** hoy la comisión es única por profesional (`Professional.commissionPercent`). Carolina necesita **comisión distinta por servicio**: ej. Romi cobra 60% en masajes y pies, pero 40% en depilación.

**Decisión:** hoy la relación profesional↔servicio es un M2M implícito (`"ProfessionalServices"`). Se convierte en **tabla de unión explícita** `ProfessionalService` con `commissionPercent` opcional. Regla de resolución: si hay comisión por (profesional, servicio) se usa esa; si no, cae al `Professional.commissionPercent` como default. Así los servicios ya asignados no se rompen y se puede afinar caso por caso.

```prisma
model ProfessionalService {
  id                String  @id @default(cuid())
  tenantId          String
  professionalId    String
  serviceId         String
  commissionPercent Float?  // override; si null usa Professional.commissionPercent
  @@unique([professionalId, serviceId])
}
```
Migración delicada (no de datos, sino de relación): pasar de M2M implícito a explícito exige mover las filas de la tabla `_ProfessionalServices` a la nueva. Aditiva y backfilleable. El cálculo de comisión en reportes usa la resolución override→default.

## 5. Impacto en el roadmap (ADR-010 §4)

Se agregan como **Ola 2 — Features del relevamiento** (después de cerrar Ola 1 / G1):

| # | Brecha | Prioridad relativa | Depende de |
|---|---|---|---|
| G16 | Categorías de servicios (+ carga Ducha escocesa/Pileta) | Alta (organiza el catálogo, alto valor visible) | — |
| G9 | Novedades/disponibilidad por profesional | Alta (impacta agenda a diario) | G6 (zona horaria) ✅ |
| G18 | Comisión por (profesional, servicio) | Media-alta (afecta liquidación) | — |
| G17 | Recursos con capacidad (máquinas/gabinetes) | Alta funcional, pero atada a G2 | G2 (overbooking al motor) |

**Orden sugerido:** G16 → G9 → G18 → (G2 + G17 juntos). G16/G9/G18 son aditivos y de bajo riesgo; G17 espera a G2 para no duplicar la lógica de solapamiento.

## 5.b Estado de implementación (2026-07-02)

**Ola 2 completa (código, local, sin deployar):**
- **G16 ✅** — `ServiceCategory` + `categoryId`, 7 categorías cargadas, selector en admin, agrupación en web pública. Servicios de spa: alta configurable por Carolina.
- **G9 ✅** — `ProfessionalBlock`; la disponibilidad (`getAvailableSlots`) y el guard transaccional de `bookAppointment` descuentan los bloqueos del profesional. UI "Novedades" por profesional.
- **G18 ✅** — Override de comisión por (profesional, servicio) en tabla separada `ProfessionalServiceCommission`; el cálculo de reportes resuelve override→default. UI "Comisiones" por profesional.
- **G17 ✅** — `Resource` (quantity) + `ServiceResource` (units); control de capacidad por solapamiento en disponibilidad y en el guard transaccional (a nivel app, la Alternativa A consciente). UI: sección "Recursos" + editor por servicio.

Nota: G17 se implementó a nivel de aplicación sin esperar a G2. Cuando G2 lleve la prevención de overbooking al motor (`EXCLUDE USING GIST`), la capacidad de recursos se integra a esa verificación (queda pendiente en el roadmap, no urgente).

## 6. Decisión

Se aceptan las cinco necesidades como brechas del roadmap (G16, G9 ampliada, G17, G18) con los modelos bosquejados. **Nada se implementa hasta cerrar G1.** Toda tabla nueva nace con `tenant_id`. Los datos que Carolina no puede que adivinemos (qué categoría lleva cada servicio, comisiones por servicio) se cargan **con ella**, no por inferencia.
