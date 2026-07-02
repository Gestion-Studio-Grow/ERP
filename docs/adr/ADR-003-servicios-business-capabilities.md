# ADR-003: Business Capabilities — MVP Blueprint "Servicios"

**Estado:** Propuesto
**Depende de:** ADR-001 (multi-tenant), ADR-002 (Core/Blueprint/Plugin)

---

## Capabilities requeridas y de dónde salen

| Capability | ¿Ya está en el Core genérico? | Motivo |
|---|---|---|
| **Party** | Sí | Cliente, Profesional y Proveedor son todos Party con distinto rol. No se crean tablas separadas por tipo. |
| **Producto** | Sí | Un "Servicio" (corte, sesión, clase) es un Producto con `tipo=servicio` + campos de extensión. |
| **Scheduling** | **No — se crea ahora** | Turnos/citas no existe en un ERP genérico. Nace como Capability del Core (no del Blueprint), para poder reusarla en futuros Blueprints (Consultorios, Gimnasios). |
| **Orden/Venta** | Sí | Universal a cualquier ERP. |
| **Pago** | Sí | Universal. En Fase 1 es registro manual; Mercado Pago llega como Plugin en Fase 2. |
| **Factura** | Sí | En Fase 1 es un documento interno simple. La CAE real de AFIP/ARCA llega como Plugin en Fase 2 (evento `InvoiceCreated` → Plugin ARCA → comando `RegisterFiscalDocument`, como definimos en ADR-002). |
| **Stock** | Sí, pero diferido | Solo si el negocio vende productos físicos (ej. shampoo). No es crítico para el piloto de turnos. |

**Ninguna de estas necesita vivir en el Blueprint.** El Blueprint "Servicios" solo las activa y las configura (ver más abajo).

## Decisión clave a fijar ahora: Profesional NO es un Usuario

Error común que conviene evitar desde el modelo de datos: **Profesional (Party con rol "recurso") y Usuario (identidad con login) son conceptos distintos.**

- Un Profesional puede no tener nunca acceso al sistema (lo carga la recepcionista) y aun así ser un recurso agendable en Scheduling.
- Un Usuario puede estar vinculado opcionalmente a un Party (para que el profesional vea su propia agenda), pero la relación es 0..1, no obligatoria.

Si mezclás ambos conceptos en una sola entidad, el día que quieras dar de alta un profesional sin cuenta de acceso (pasa todo el tiempo en la vida real) el modelo te obliga a inventar un usuario fantasma. Separalos desde el día 1.

## Relaciones entre entidades (Fase 1)

```
Party (rol: Cliente) ─┐
                       ├──> Turno (Scheduling) ──> Orden ──> Pago
Party (rol: Profesional)┘         │                  │
                                    │                  └──> Factura (evento → Plugin ARCA, Fase 2)
                            Producto (tipo: Servicio)
```

- Un **Turno** referencia: Party-cliente, Party-profesional, Producto-servicio, fecha/hora, estado (reservado/confirmado/completado/cancelado/no-show).
- Al completarse un Turno (o directo desde POS para venta de producto físico), se genera una **Orden** con sus líneas.
- La Orden dispara **Pago** (registro simple en Fase 1) y **Factura** (documento interno en Fase 1, real vía Plugin en Fase 2).

## Fasificación del MVP

| Fase | Alcance |
|---|---|
| **Fase 1 (piloto, lo que se demo-ea)** | Party, Producto-Servicio, Scheduling (agenda simple, un recurso por turno), Orden, Pago manual, Factura interna sin CAE. |
| **Fase 2** | Plugin ARCA (CAE real), Plugin Mercado Pago, Stock para productos físicos. |
| **Fase 3** | Plugin WhatsApp (recordatorios de turno), reportes/Power BI, reglas de superposición de agenda más avanzadas (múltiples recursos, salas). |

## Riesgo a marcar
Scheduling es la única Capability *nueva* de todo el MVP — todo lo demás es reutilización de Core. Es donde más atención de diseño hay que poner, porque es lo único que no tiene precedente en un ERP tradicional tipo SAP. Cuando lleguemos a diseñarla en detalle (estados del turno, reglas de superposición, recursos múltiples), le dedicamos un ADR aparte — no la mezclamos acá para no inflar este documento.
