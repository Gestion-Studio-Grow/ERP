# 🏦 Runbook — Facturación Bancaria: pruebas reales y go-live

**Producto:** Facturación automática para el comerciante simple — subís el extracto del banco (Excel/CSV)
o conectás Mercado Pago, el sistema mapea las columnas solo, clasifica qué es venta y qué no, y emite las
facturas contra ARCA. Módulo `bancos` (plugin `src/plugins/bancos/` + glue `src/lib/bancos-*.ts` + pantalla
en el backoffice admin).

- **Autor:** PMO/Arquitecto · **Fecha:** 2026-07-11 · **Rama:** `frente/facturacion-bancaria`
- **Complementa** (no reemplaza): `docs/runbooks/encender-arca-real.md` — el encendido general de ARCA
  (migraciones Gate 2, env vars, worker) es EL MISMO; acá va solo lo específico de este producto y el paso
  a paso del certificado con el CUIT del dueño.
- **Regla de secretos (ADR-041):** certificado y clave privada los genera/pega **siempre el dueño**. El
  agente prepara comandos y deja todo listo, jamás ve ni commitea un secreto.

---

## 1. Certificado ARCA con tu CUIT — paso a paso (lo hacés vos, ~15 min)

> ARCA no usa "API key": usa **certificado digital X.509 + clave privada** (WSAA) para firmar cada pedido
> de acceso al web service de facturación (WSFEv1). Tu CUIT ya tiene el servicio habilitado — falta el
> certificado. Primero HOMOLOGACIÓN (entorno de prueba oficial, CAE sin validez fiscal), después REAL.

### 1.a Generar la clave privada y el pedido de certificado (CSR) — en TU máquina
```bash
# 1. Clave privada (NO la compartas ni la subas a ningún lado)
openssl genrsa -out arca-privada.key 2048

# 2. Pedido de certificado (CSR) — reemplazá CUIT por el tuyo, sin guiones
openssl req -new -key arca-privada.key -subj "/C=AR/O=Gestion Studio Grow/CN=facturacion-gsg/serialNumber=CUIT 20XXXXXXXXX" -out arca-pedido.csr
```

### 1.b HOMOLOGACIÓN (para las pruebas reales de hoy)
1. Entrá a ARCA con tu clave fiscal → buscá el servicio **"WSASS – Autogestión de certificados de homologación"**
   (si no aparece, agregalo desde "Administrador de Relaciones de Clave Fiscal").
2. **"Nuevo certificado"** → pegá el contenido de `arca-pedido.csr` → te devuelve el **certificado** (guardalo
   como `arca-homo.crt`).
3. En el mismo WSASS: **"Crear autorización a servicio"** → autorizá tu DN al servicio **`wsfe`** (facturación).

### 1.c PRODUCCIÓN (cuando homologación esté OK)
1. ARCA → **"Administración de Certificados Digitales"** → "Agregar alias" → pegá el mismo CSR (o uno nuevo) →
   descargá el certificado productivo.
2. **"Administrador de Relaciones de Clave Fiscal"** → "Nueva relación" → servicio **"Facturación Electrónica
   – Web Service (wsfe)"** → representante = el alias del certificado.

### 1.d Punto de venta Web Services (una sola vez)
ARCA → **"Administración de puntos de venta y domicilios"** → "A/B/M de puntos de venta" → dar de alta un
punto de venta con sistema **"Factura Electrónica – Web Service"** (RECE/WS). Anotá el número: va en
`Tenant.arcaPuntoVenta` y en la pantalla de configuración del módulo.

---

## 2. Dónde se pegan las credenciales

Igual que `encender-arca-real.md` §3 (Vercel → Environment Variables, o `.env` local para probar):
```
ARCA_MODO=homologacion          # primero; después "real"
ARCA_CERT_PEM=<contenido de arca-homo.crt>
ARCA_KEY_PEM=<contenido de arca-privada.key>
```
El certificado/clave **nunca** van a la DB ni al repo (ADR-022 opción B / ADR-066).

---

## 3. Configuración del tenant (pantalla del módulo o alta)

| Campo | Dónde | Valor |
|---|---|---|
| CUIT emisor | `Tenant.arcaCuit` | tu CUIT, 11 dígitos |
| Punto de venta | `Tenant.arcaPuntoVenta` | el del paso 1.d |
| Homologación | `Tenant.arcaHomologacion` | `true` hasta pasar a real |
| Umbral identificación | `Tenant.bancosUmbralIdentificacion` | default **$600.000** (regla comercial del dueño; el mínimo legal ARCA es $10.000.000 desde 05/2025 — RG; ser más estrictos es válido) |
| Cap facturas/mes | `Tenant.bancosCapFacturasMes` | default **159** |
| Domicilio del emisor | `Tenant.bancosDomicilioEmisor` | domicilio comercial (obligatorio para el comprobante impreso) |

---

## 4. Migraciones (Gate 2 — lo corre el dueño, igual que siempre)

La rama suma **una** migración aditiva: `20260711120000_add_bancos_importacion` (tablas
`ImportacionBancaria`, `MovimientoImportado`, `ReglaClasificacionBancoTenant` + 3 columnas `bancos*` en
`Tenant`). Se aplica junto con las fiscales pendientes según `encender-arca-real.md` §1
(`npx prisma migrate deploy` con backup previo de Neon) y **en el mismo deploy** re-ejecutar
`prisma/rls/0001_enable_rls.sql` para que la policy data-driven cubra las tablas nuevas (las 3 tienen
`tenantId`; el gate `npm run gates` lo verifica).

---

## 5. Prueba real end-to-end (homologación)

1. `ARCA_MODO=homologacion` + credenciales del paso 1.b + `ARCA_INVOICING_ENABLED=true`.
2. Backoffice → **Facturación automática** → *Importar extracto* → subí un extracto REAL de tu banco
   (Excel o CSV, tal cual lo baja el home banking).
3. Verificá el mapeo detectado (si la confianza es <80% te pide confirmar columnas — una vez).
4. Revisá el lote: ventas en AUTO, lo que supera $600.000 en REVISIÓN (pide CUIL + nombre + descripción),
   comisiones/SIRCREB/transferencias propias en NO FACTURABLE.
5. **Emitir facturas automáticas** → cada una debe pasar a **Autorizada con CAE** (CAE de homologación,
   sin validez fiscal). Si algo rebota, el motivo queda en la factura (`rechazoMotivo`).
6. Chequeá el contador del mes (X/159) y la alerta al 90%.

**Pasa todo → `ARCA_MODO=real`** con el certificado productivo (1.c) y repetir con UNA operación chica.

---

## 6. Qué queda del lado del agente/PMO (ya hecho en la rama)

- Plugin `bancos` completo (parser CSV/XLSX + mapeador automático con 7 templates de bancos AR +
  clasificador + reglas umbral/cap/dedup) — 78 tests propios.
- Glue + persistencia + 8 server actions + registro del módulo en el catálogo — suite completa verde.
- Pantallas backoffice (tema GSG Fable claro).
- Gate de Excelencia antes del push (bloques 1-4).

— Elaborado por GSG (PMO/Arquitecto). Doc-only; los pasos de secretos/migración/deploy los corre el dueño.
