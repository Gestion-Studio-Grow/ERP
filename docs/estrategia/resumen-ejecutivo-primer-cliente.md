# 🚀 Resumen Ejecutivo — Salir en vivo con el PRIMER cliente

> **Para quién:** para leer en 5 minutos, sin tecnicismos. Explica **los 7 pasos** para poner al primer cliente
> (un **Comercio Micro**) funcionando de verdad, **quién hace cada cosa** y **cuánto está avanzado**.
>
> **Fecha:** 2026-07-10 · **Autor:** GSG (PMO) · **Base honesta:** el estado real del repo (ver
> [`fundacional-DEFINITIVO-v2.md`](fundacional-DEFINITIVO-v2.md) y `docs/producto/spec-comercio-micro-mvp.md`).
>
> **Leyenda:** 🤖 = lo construye la IA · 🧑 = lo firma/decide una persona · % = cuánto está listo hoy.

---

## Los 7 pasos

### 1 · Elegir el cliente y su rubro — **90%** 🧑
Decidir con qué comercio salimos y de qué rubro es (carnicería, velas, pádel, almacén…). Ya tenemos 4 arquetipos
vivos (Magra, Shine, A Dos Manos, CH). **Falta:** que el dueño elija **el primero** que sale en vivo de verdad.

### 2 · Pedir permiso y relevar la marca — **80%** 🧑 pide OK · 🤖 releva
Antes de copiar nada, **el cliente autoriza** (ADR-042) que usemos su marca/contenido. Después la IA entra a su
Instagram/web y **saca todo**: logo, colores, catálogo, precios, historia. **Falta:** el OK firmado del cliente
elegido + material real donde el Instagram esté cerrado (login-walled).

### 3 · Crear su sistema (el "alta") — **70%** 🤖 construye · 🧑 aprueba
La **fábrica de tenants** crea el espacio del cliente: su tienda, su backoffice, sus datos de ejemplo. Hoy el alta
funciona con un script probado (idempotente, transaccional). **Falta:** la versión "de fábrica" completa (con
*simulación previa / dry-run* y *reintentos*), que está **decidida pero no construida** (ADR-065).

### 4 · Cargar sus datos reales — **50%** 🧑 aporta · 🤖 carga
Poner su catálogo, precios y fotos de verdad (no los de ejemplo). Esto **cambia la base de datos**, así que
requiere el **OK del dueño** (Gate 2). **Falta:** los datos reales del cliente + aplicar las migraciones pendientes.

### 5 · Dejar la base fiscal y segura firme — **60%** 🤖 construye · 🧑 aporta secretos
Que la facturación ARCA ande de verdad (hoy anda en modo prueba) y que el aislamiento entre clientes esté
**verificado en vivo** (no asumido). **Falta:** correr `check-rls-live.mjs` contra producción, cargar el
**certificado ARCA del cliente** (lo pega el dueño, ADR-041/066) y **rotar secretos + activar PITR** (respaldo).

### 6 · Publicar su sitio — **40%** 🧑 da el OK ("deployá")
Poner la tienda del cliente online en su URL. Es una acción del dueño (Gate 1); el push a GitHub **no publica**
solo. **Falta:** el OK explícito del dueño para publicar (CH ya está online; el nuevo cliente, no).

### 7 · Salir en vivo y acompañar — **20%** 🧑 acompaña · 🤖 asiste
Cliente operando de verdad: vende, cobra, factura. Los primeros días se acompaña de cerca (WhatsApp, ajustes).
**Falta:** todo lo anterior + un cierre de QA del recorrido completo (entrar → vender → cobrar → facturar).

---

## Foto en una línea

> **El motor del Comercio Micro ya existe y anda** (vender, cobrar, caja, catálogo, facturación en prueba). Lo que
> falta para el primer cliente en vivo es sobre todo **decisiones y datos del dueño/cliente** (elegir, autorizar,
> aportar datos, dar el OK de publicar y pegar los secretos), más **cerrar la fábrica de altas y verificar la
> seguridad en vivo**. No hay que "construir de cero" casi nada.

## ¿Quién hace qué? (resumen)

| Hace | La IA 🤖 | La persona 🧑 |
|---|---|---|
| **Construye** | tienda, backoffice, alta, facturación, reportes | — |
| **Decide/firma** | — | elegir cliente · autorizar marca · aprobar datos · dar OK de publicar |
| **Aporta** | — | material real (fotos/catálogo/precios) · certificado ARCA · secretos |
| **Verifica** | corre tests y QA | mira que sea fiel a su negocio |

---

## Glosario simple

- **Tenant:** el espacio propio de un cliente dentro del sistema (su tienda + su backoffice + sus datos), aislado
  de los demás.
- **Backoffice:** la pantalla de gestión donde el comercio trabaja (vende, cobra, ve stock y números). El nuestro
  se llama **"Fable"**.
- **Fábrica de tenants:** el proceso automático que da de alta un cliente nuevo sin hacerlo a mano.
- **Preset por IA:** cuando la IA mira la red/web del cliente y arma solo su tienda con su marca y catálogo.
- **Migración:** un cambio en la estructura de la base de datos. Es delicado → necesita OK del dueño (Gate 2).
- **Deploy / publicar:** poner el sitio online. Necesita OK del dueño (Gate 1).
- **RLS:** la reja de seguridad de la base que impide que un cliente vea datos de otro.
- **ARCA:** el organismo fiscal argentino (ex-AFIP); "facturación ARCA" = factura electrónica legal.
- **Gate 1 / Gate 2:** los dos permisos del dueño — publicar (1) y tocar la base de datos (2).
- **Dry-run:** una simulación previa ("qué pasaría si") antes de hacer el cambio de verdad.

— Elaborado por GSG (PMO)
