# Runbook: de Factoque a peluquería (paquete Peluquerías, T6)

Checklist del operador para pasar a una peluquería o barbería que ya factura con Factoque al
paquete completo (agenda, sillones, comisiones, caja, recordatorios por WhatsApp).
Estado: **borrador; el camino «mismo negocio» está bloqueado por código** (ver §1).

— Elaborado por GSG

## 1. Bloqueo: hoy no se puede pasar en el mismo negocio

Factoque se reconoce por `Tenant.blueprintId === "facturita"`, no por un módulo:

- `src/lib/producto-identidad.ts:124`: el producto es «facturita» sólo con ese blueprint.
- `src/app/admin/(dashboard)/layout.tsx:149`: quien tiene `billing:manage` va derecho a `/facturita/app`, así que la dueña no vería la agenda.
- `src/lib/facturita-sesion.server.ts:19` y `src/lib/facturita-actions.ts`: las pantallas y acciones de Factoque exigen ese blueprint.
- `src/lib/facturacion/plan-factoque.server.ts:45`: el tope mensual sólo rige con ese blueprint.

Si el operador cambia el blueprint a `peluqueria`, el negocio:
1. pierde las pantallas de Factoque y la conexión con Mercado Pago de `/facturita/app`;
2. **queda sin tope de comprobantes**, porque `planFactoqueEnTx` devuelve `null`;
3. sigue sin catálogo de ejemplo si el cambio se hace a mano: el seeder sólo corre en el alta
   (`scripts/provision-tenant.ts`) o en `scripts/convert-tenant-blueprint.ts`.

En total son unas 40 comprobaciones de `"facturita"` en 19 archivos.
`scripts/convert-tenant-blueprint.ts --to peluqueria` existe: hace dry-run por defecto, escribe con
`--apply`, corre con el rol owner y está acotado a un tenant. Hace el cambio y siembra el
catálogo, pero **no resuelve 1 ni 2**, y correrlo contra Neon es una operación de datos que se eleva
al dueño. **No cambiar el blueprint a mano en la base.**

## 2. Opciones (decide el dueño)

| | Opción | Costo | Riesgo |
|---|---|---|---|
| A | **Negocio nuevo de peluquería**, con Factoque como está. La facturación electrónica del ERP completo usa el mismo CUIT y punto de venta (cargar el certificado ARCA en el negocio nuevo). | Bajo; sin código | Dos accesos y dos historiales de comprobantes; hay que avisarle a la clienta |
| B | **Factoque como módulo** (capability o `TenantModule`) en vez de blueprint, y el upgrade cambia el blueprint conservando el módulo y el tope. | Una tanda con certificación (plata y multi-tenant) | Toca facturación viva |
| C | Upgrade **sólo cuando la clienta deja Factoque**: alta nueva de peluquería, y Factoque queda sólo lectura. | Bajo | Igual que A |

Recomendación provisional, a confirmar: **A ahora** para vender ya, y **B** como tanda propia
cuando haya el primer caso real.

## 3. Checklist de la opción A (sin código)

1. Autorización registrada de la clienta para usar su marca (preset de cliente); si no hay, sin preset.
2. Alta del negocio desde la consola del operador, rubro «peluquería» o «barbería». Queda con el catálogo de ejemplo, los sillones y las comisiones (T1).
3. Datos fiscales: el mismo CUIT y un punto de venta. Ojo: si usa **el mismo** punto de venta que en Factoque, la numeración la lleva ARCA, pero no emitir desde los dos a la vez. Recomendado: un punto de venta nuevo.
4. Certificado ARCA: lo carga la dueña o el operador por la pantalla de trámites; nunca por chat ni mail.
5. Usuarios: la dueña con contraseña provisoria por mail aparte y `mustChangePassword` verificado; los profesionales con su comisión.
6. Mercado Pago: conectar de nuevo en el negocio nuevo (la conexión es por negocio).
7. Recordatorios: «Mañana: confirmar» ya pide la confirmación en este rubro (T5). Revisar la plantilla en Recordatorios si quiere otro texto.
8. Factoque: decidir con la clienta si sigue (sin cambio de plan) o pasa a Gratis al fin de la vigencia. **Nunca** bajar el plan a mitad de un período pago.
9. QA clic por clic con la dueña: dar un turno, confirmarlo por WhatsApp, cobrarlo, facturarlo y ver la comisión.

## 4. Precio

Paquete y competencia en `PAQUETE-PELUQUERIAS.md` (valores **[A VALIDAR]**).
