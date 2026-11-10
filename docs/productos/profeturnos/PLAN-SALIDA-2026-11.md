# ProfeTurnos · Plan de salida para cobrar (noviembre 2026)

- **Fecha:** 10/11/2026 · **Autora:** GSG-PROFE-003 (constructora de ProfeTurnos), coordinada por GSG-ORQ-006.
- **Pedido del dueño (10/11):** «hacé lo mismo que con Factoque, pero con la app para profe de pádel. Necesito que la dejes lista para ya monetizarla».
- **Regla de este documento:** 🔒 decide el dueño · 🖥 lo hace una sesión · 👤 lo hace el profe (cliente). Todo precio dice **provisional a confirmar**.

## 0. Veredicto (3 líneas)

1. El producto **ya funciona para el profe y para el alumno**: turnero público, link del alumno, agenda, plata, deuda, saldo a favor y bienvenida guiada (en producción con el tenant de referencia).
2. **No se puede cobrar todavía** porque faltan cuatro piezas comerciales: alta sola desde una página pública, prueba gratis + abono mensual por Mercado Pago, legales (términos, arrepentimiento, baja) y una vidriera de ProfeTurnos.
3. Las cuatro se arman **reusando lo de Factoque** (fábrica de tenants, Checkout Pro, vigencia del plan en auditoría, trámites legales), **sin migración** salvo paquetes de clases: 5 tandas, la de plata con certificación adversarial.

## 1. Recorrido punta a punta

### Profe

| # | Paso | Estado | Qué hay / qué falta | Dónde |
|---|------|--------|---------------------|-------|
| 1 | Conoce ProfeTurnos (vidriera) | ❌ | No hay landing de producto ni host propio; sólo el turnero de cada profe | `src/lib/producto-host.ts:17` (falta entrada) |
| 2 | Se da de alta solo | ❌ | Hoy el alta es manual desde la consola GSG (rubro `profe-padel`). Falta formulario público que cree negocio + usuario + turnero | `scripts/provision-tenant.ts:163`, `src/blueprints/presets-meta.ts:116` |
| 3 | Entra al panel | ✅ | Login normal; módulos `padel-clases` + `clients` | `src/modules/descriptors/padel-clases.ts` |
| 4 | Bienvenida guiada | 🟡 | 3 pasos (datos, horarios, precio) + link para la bio de Instagram. Falta el paso **club** | `src/app/admin/(dashboard)/clases/bienvenida/Asistente.tsx:23` |
| 5 | Comparte el link del turnero | ✅ | `linkDelTurnero` y botón copiar | `src/app/admin/(dashboard)/clases/config/_link.server.ts` |
| 6 | Confirma clases / cobra / ve deuda | ✅ | Pendientes, semana, plata, deuda y saldo a favor; dinero `numeric(14,2)`, reservas serializables | `src/lib/padel/core.ts:195` |
| 7 | Prueba gratis | ❌ | No hay plan ni vigencia para ProfeTurnos | patrón: `src/lib/facturacion/plan-factoque.server.ts:43` |
| 8 | Paga el abono mensual | ❌ | No hay suscripción. Checkout Pro existe pero no se usa para cobrar a GSG | `src/plugins/mercadopago/cobros/port.ts`, `http.ts` |
| 9 | Vence / renueva | ❌ | Falta qué pasa al vencer (modo lectura, turnero sigue mostrando, no toma reservas nuevas) | a definir en T2 |
| 10 | Se arrepiente o se da de baja | ❌ | Factoque tiene los trámites, atados a su nombre | `src/lib/factoque-tramites.ts:17` |
| 11 | Soporte | 🟡 | WhatsApp de soporte GSG con fallback a mail | `src/app/admin/(dashboard)/clases/config/contacto-gsg.ts` |

### Alumno

| # | Paso | Estado | Qué hay / qué falta | Dónde |
|---|------|--------|---------------------|-------|
| 1 | Entra al turnero desde Instagram | ✅ | `/clases` del subdominio del profe | `src/app/clases/page.tsx` |
| 2 | Pide clase individual o grupal | ✅ | Precio según tipo y personas | `src/lib/padel/core.ts` (`precioDe`) |
| 3 | Paga por transferencia / MP / efectivo | ✅ | Alias/CBU del profe; comprobante | `src/app/alumno/[token]` |
| 4 | Ve su deuda y su saldo | ✅ | Link personal del alumno | `src/app/alumno/[token]` |
| 5 | Compra un paquete de clases | ❌ | No existe modelo de paquete | `prisma/schema.prisma:3164-3360` (falta) |
| 6 | Recibe recordatorio de deuda | 🟡 | Plantilla `recordatorioDeuda` existe; envío por WhatsApp Cloud detrás de `PADEL_WHATSAPP=cloud` | `src/lib/padel/acciones.ts` |

## 2. Planes y precio sugerido (provisional a confirmar 🔒)

Referencia interna: Factoque Emprendedor a $9.000 y Pro a $15.000/mes (`src/lib/facturita-planes.ts:76,87`). Un profe con 20 alumnos cobra ~$25.000 por clase individual (demo de referencia): el abono tiene que equivaler a **menos de una clase por mes**.

| Plan | Qué incluye | Precio ARS (provisional a confirmar) | Para quién | Qué cambia en código |
|------|-------------|--------------------------------------|------------|----------------------|
| Prueba gratis | Todo, **14 días** desde el alta, sin tarjeta | $0 | Profe que recién conoce | `DIAS_PRUEBA` configurable (default 14) |
| Profe (mensual) | Turnero, alumnos ilimitados, agenda, plata, deuda, paquetes, recordatorios con link de WhatsApp | **$12.900/mes** | Profe independiente | `PLANES_PROFETURNOS` en un archivo único de precios |
| Profe anual (opcional) | Igual, 12 meses con 2 de regalo | $129.000/año | El que ya se convenció | misma tabla; se activa si el dueño lo aprueba |

Al vencer sin pagar: el panel queda **en modo lectura** (ve todo, no confirma clases nuevas) y el turnero muestra «el profe está renovando su cuenta». No se borra nada. Todos los números viven en una constante y la pantalla dice «precios provisionales».

## 3. Qué se reusa de Factoque

| Pieza | Origen | Uso en ProfeTurnos |
|-------|--------|--------------------|
| Fábrica de tenants | `provisionTenant` (ADR-019) + alta web de PR #45 (`alta-negocio.server.ts`) | Alta sola con blueprint `profe-padel`; **sin mail**: la clave se elige en el formulario |
| Límite anti-abuso | `alta-web.server.ts` (20 por IP/hora) + honeypot | Igual |
| Vigencia del plan sin migración | `plan-factoque.server.ts` (`vigenciaDeLaFila`, fila de auditoría, la última manda) | `profeturnos.plan` con `vigenciaHasta` |
| Cobro | Checkout Pro `src/plugins/mercadopago/cobros/` + firma `signature.ts` | Preferencia a la cuenta GSG con `external_reference = pt:<tenant>:<plan>:<período>`; webhook propio, verifica firma, re-consulta el pago, monto y moneda, idempotente por `paymentId` |
| Trámites legales | `factoque-tramites.ts`, `PaginaTramite`, `FormularioTramite`, `DocumentoLegal` | Se parametriza por producto (nombre, plan gratis, mail de aviso) |
| Tarjeta del operador | `PlanFactoqueCard` | Tarjeta «Plan ProfeTurnos» en la consola GSG para extender o regalar meses |

## 4. Prueba real con un profe

1. 🖥 Se publica en una rama de previsualización con MP en modo sandbox.
2. 👤 El profe de referencia (tenant actual) **no se toca**; se usa un profe nuevo de confianza (a elegir 🔒) que se da de alta solo desde la vidriera, desde su celular, sin ayuda.
3. 👤 Hace la bienvenida (club, horarios, precio) y pega el link en la bio de Instagram. Se mide el tiempo (meta < 10 min).
4. 👤 Dos alumnos reales piden clase; el profe confirma y marca pagos.
5. 🖥 Se fuerza el vencimiento de la prueba (tarjeta del operador) y el profe paga con MP sandbox; se verifica que vuelva a «activo» sin intervención.
6. 👤 Prueba el botón de arrepentimiento en una cuenta descartable.
7. 🖥 Se limpian los datos de prueba y se escribe el acta con lo que trabó.

## 5. Tandas para dejarlo vendible (en orden)

| Tanda | Qué entrega | Riesgo / certificación | Tamaño |
|-------|-------------|------------------------|--------|
| T1 · Alta sola + vidriera | Landing de ProfeTurnos (`/profeturnos`) + formulario de alta → negocio, usuario dueño, turnero; límite por IP + honeypot | Datos y seguridad → **certificación adversarial** | M |
| T2 · Prueba gratis + abono MP | Plan y vigencia en auditoría, pantalla «Mi plan», Checkout Pro, webhook idempotente, modo lectura al vencer, tarjeta del operador | Plata → **certificación adversarial obligatoria** | L |
| T3 · Legales | Términos, privacidad, arrepentimiento y baja parametrizados por producto | Datos → certificación liviana | S |
| T4 · Bienvenida con club | Paso «Tu club» en el asistente + link de bio | Visual → revisión liviana + QA clic por clic | S |
| T5 · Backlog comercial | Paquetes de clases (tabla nueva aditiva, sin aplicar), recordatorio de deuda en un toque, precio por club | Plata → certificación sobre el diff | M |

Cada tanda: una rama `claude/profeturnos-*`, un PR, tests + `tsc`, CI sin rojos nuevos contra main, Gate de Excelencia validado con `scripts/release/pr-checklist.mjs`.

## 6. Decisiones del dueño 🔒

1. **Precio** del plan mensual (propuesta $12.900) y si hay anual.
2. **Días de prueba** (propuesta 14).
3. **Nombre** comercial definitivo («ProfeTurnos») y **host** (propuesta `profeturnos.gsgapp.com.ar`, sin gasto de dominio).
4. **Mercado Pago:** cobrar con la cuenta GSG actual (`MP_ACCES_TOKEN`, `MP_WEBHOOK_SECRET` ya están en Vercel) o con una cuenta aparte.
5. **Mail en producción** (claves de Resend): el alta no lo necesita, pero sí la constancia del arrepentimiento.
6. **Profe de la prueba real** (punto 4).
7. Qué pasa con el tenant de referencia actual: ¿plan regalado o pasa a pagar?

— Elaborado por GSG · metadata.generator = "Gestión Studio Grow"
