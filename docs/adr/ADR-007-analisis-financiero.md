# ADR-007: Análisis Financiero por Escenario de Crecimiento

**Nota de alcance:** son órdenes de magnitud para decidir arquitectura, no un presupuesto formal — para eso hace falta cotizar contra pricing vigente al momento de construir.

## Costos estimados de infraestructura (USD/mes), stack de ADR-005

| Ítem | 1 cliente | 10 clientes | 100 clientes | 1.000 clientes | 10.000 clientes |
|---|---|---|---|---|---|
| DB (Postgres gestionado) | $0 (free tier) | $0-25 | $50-150 | $400-800 (instancia grande + réplicas) | $2.000-4.000 (sharding/particionado) |
| Cache (Redis serverless) | $0 | $0-10 | $20-50 | $150-300 | $800-1.500 |
| Hosting backend/frontend | $0-5 | $10-20 | $50-150 | $500-1.000 (autoscaling) | $3.000-6.000 |
| Object Storage (R2) | ~$0 | ~$1 | $5-15 | $50-100 | $300-600 |
| Backups | incluido | incluido | $10-20 | $50-100 | $200-400 |
| Observabilidad (logs/errores) | $0 | $0 | $25-50 | $150-300 | $800-1.500 |
| CDN | $0 | $0 | $0 | $20-50 | $100-300 |
| **Subtotal infraestructura** | **~$5** | **~$40** | **~$300** | **~$1.500-2.700** | **~$7.000-14.000** |

## Costos variables por transacción/uso (no escalan linealmente con tenants sino con actividad)

- **Facturación electrónica (ARCA):** sin costo directo de AFIP, pero si usás un proveedor intermediario para el Plugin, calculá $0.01-0.05 por comprobante según proveedor.
- **Mercado Pago:** comisión estándar de la plataforma, no es costo tuyo — es del tenant. No lo sumes a tu propio costeo, sí documentalo para el pricing que le cobrás al cliente.
- **WhatsApp Business API:** por conversación, ronda $0.01-0.08 según tipo — relevante recién en Fase 3.
- **IA (API de Claude):** el ítem más variable. Con uso puntual (no como feature core del MVP), estimá $20-100/mes hasta 100 tenants. Ver ADR-008 para cómo controlar que esto no se dispare.

## Costos de soporte (no infraestructura, pero real)
- 1-10 clientes: absorbido por el equipo fundador, sin costo dedicado.
- 100 clientes: empieza a justificar 1 persona part-time de soporte/onboarding.
- 1.000+: equipo de Customer Success dedicado — costo de negocio, no de infraestructura, pero hay que planificarlo en el pricing.

## Costos ocultos a no subestimar
- **Migraciones de schema mal planificadas:** con shared-schema (ADR-001) esto es barato hasta que el volumen de datos por tabla crece — una migración que agrega una columna con default en una tabla de millones de filas puede lockear producción si no se usa la técnica correcta (agregar nullable, backfill async, luego NOT NULL). Es tiempo de ingeniería, no dólares directos, pero es el costo oculto más común en SaaS multi-tenant.
- **Egress de datos** si en algún punto se usa un proveedor que no sea R2/Cloudflare para storage — S3 clásico cobra por salida de datos y puede sorprender.
- **Soporte de facturación electrónica ante cambios normativos de ARCA/AFIP:** no es un costo de infraestructura, es horas de mantenimiento recurrentes del Plugin. Dado tu expertise en el tema fiscal argentino, esto probablemente lo internalices vos mismo en vez de tercerizarlo — impacta tiempo, no cash, pero hay que contarlo en el roadmap.

## Punto de decisión clave
El salto de costo más importante no es gradual — es el paso de "instancia única de Postgres" a "necesito réplicas de lectura o particionado", que típicamente ocurre en algún punto entre 500 y 2.000 tenants activos dependiendo del volumen de transacciones por tenant (un ERP transacciona mucho más por tenant que una app B2C típica). Ese es el momento de revisar este ADR, no antes.
