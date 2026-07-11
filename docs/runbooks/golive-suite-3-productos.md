# 🚀 Runbook — Go-live de los 3 productos (UAT con CUIT del dueño)

**Objetivo:** dejar los 3 productos de la suite de facturación publicados, cada uno en su URL, los tres
configurados con el CUIT del dueño y el certificado de **TEST (homologación)** de ARCA, listos para que
el dueño haga el UAT y salir a vender esta semana.

- **Autor:** PMO/Arquitecto · **Fecha:** 2026-07-11 · **Rama:** `frente/producto-contador`
- **Regla de secretos (ADR-041):** certificado y clave los pega SIEMPRE el dueño en Vercel; el agente
  nunca los ve ni los commitea.

---

## Los 3 productos y sus URLs

| Producto | URL | Ruta de entrada | Módulos activos del tenant |
|---|---|---|---|
| Comerciante | `comerciante-gsg.vercel.app` | `/admin` (facturación automática) | arca + bancos + mercadopago |
| Contador | `contador-gsg.vercel.app` | `/contador` (panel de cartera) | cartera + arca + bancos |
| Facturita | `facturita-gsg.vercel.app` | `/facturita` (signup) → emisor simple | arca + clients |

Los tres corren en el MISMO deploy (proyecto Vercel `erp-ch`); el ruteo host→tenant lo hace
`TENANT_HOST_MAP`. El aislamiento entre productos/clientes es por RLS.

---

## Secuencia (cada paso verificado antes del siguiente)

### 1. Verde en la rama (agente)
`prisma validate` + `tsc` + `npm test` (945+) + `next build` verdes, con los 3 productos + login + tema.

### 2. Gate de Excelencia (Opus)
Auditoría GSG completa sobre el paquete. Aprobado → continuar.

### 3. Commit + push (agente, por pathspec)
Rama `frente/producto-contador` → merge a `main` → push. GitHub es destino por defecto.

### 4. Migración a Neon (Gate 2 — LO EJECUTA EL DUEÑO con su OK)
La rama trae la tabla `CarteraCliente` (producto Contador) sin aplicar. Con backup previo de Neon:
```
npx prisma migrate deploy
```
+ re-ejecutar `prisma/rls/0001_enable_rls.sql` en el mismo deploy (la tabla nueva tiene `tenantId`,
la policy data-driven la cubre; `npm run gates` lo verifica). **Orden de oro: migración → deploy.**

### 5. Deploy (agente/dueño — Gate 1)
Deploy de producción del proyecto `erp-ch`.

### 6. Alta de los 3 tenants (agente) — TODOS con el CUIT del dueño
```
npm run provision -- --name "Comerciante GSG" --slug comerciante --owner-email gestionstudiogrow@gmail.com --blueprint generico
npm run provision -- --name "Contador GSG"   --slug contador   --owner-email gestionstudiogrow@gmail.com --blueprint generico
npm run provision -- --name "Facturita GSG"  --slug facturita  --owner-email gestionstudiogrow@gmail.com --blueprint facturita
```
Después, por cada tenant (SQL puntual con OK, o consola de operador):
- `subdomain` = comerciante / contador / facturita
- `modules` = el set de la tabla de arriba
- `arcaCuit` = 20376833098 · `arcaHomologacion` = true
- `bancosDomicilioEmisor` = domicilio del emisor (Comerciante)

### 7. Dominios + ruteo (agente por Chrome, o dueño)
- Vercel → `erp-ch` → Domains → agregar `comerciante-gsg.vercel.app`, `contador-gsg.vercel.app`,
  `facturita-gsg.vercel.app`.
- Extender `TENANT_HOST_MAP` con las 3 entradas nuevas (`host=subdomain;…`) — VERIFICAR que el valor
  quede completo con los tenants previos (chestetica/magra/etc) + los 3 nuevos.
- Redeploy para tomar el env nuevo.

### 8. Credenciales ARCA de TEST (LO PEGA EL DUEÑO en Vercel → Environment Variables)
```
ARCA_MODO=homologacion
ARCA_CERT_PEM=<certificado de PRUEBA del dueño, PEM>
ARCA_KEY_PEM=<clave privada de PRUEBA, PEM>
ARCA_INVOICING_ENABLED=true
```
Con esto los 3 productos emiten CAE de homologación (válido solo en test, sin efecto fiscal real).
El `MP_ACCESS_TOKEN` de test de Mercado Pago (para el Comerciante) igual, cuando se cablee OAuth.

### 9. UAT del dueño (los 3)
- **Comerciante:** login → subir extracto → mapeo → emitir → CAE de prueba.
- **Contador:** login → alta de un cliente en la cartera → emitir por ese cliente.
- **Facturita:** signup público → emitir una factura a mano → CAE de prueba.
Aceptación de cada uno = luz verde para vender ese producto.

### 10. Flip a real (POST-venta, por cliente)
Cuando una venta cierra: para ESE tenant, `ARCA_MODO=real` + certificado productivo del cliente
(delegación al CUIT de GSG donde aplique) + `arcaHomologacion=false`. Nunca antes de la venta.

---

— Elaborado por GSG (PMO/Arquitecto). Doc-only; los pasos de secretos/migración/deploy los corre el dueño.
