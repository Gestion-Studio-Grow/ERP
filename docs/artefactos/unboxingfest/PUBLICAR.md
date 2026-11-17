# Unboxing Fest · cómo se publica

Publicados en `public/juegos/unboxingfest/` el 17/11/2026, con la autorización de `AUTORIZACION-MARCA.md`.
La raíz de `unboxingfest.gsgapp.com.ar` va a la portada (`src/lib/producto-host.ts`); el comodín `*.gsgapp.com.ar`
ya está en el proyecto `erp-ch` de Vercel, así que no hace falta agregar el dominio.

**Fase 1 (esta publicación):** el link muestra la cuenta regresiva y «Agendalo» hasta que abre la ventana
(hoy 5/12 14:00, provisional a confirmar: 2 h antes del evento). Con `?demo=1` se puede jugar para mostrarlo, pero el código sale `DEMO-…`, no tiene premio
y no se manda nada a la planilla.

**Fase 2 · llave en vivo (esta rama, 17/11):** el premio sólo se activa frente al stand.
- `pantalla.html`: el QR de la pantalla del stand, que cambia cada minuto. Se entra una vez con la clave del equipo.
- `activar.html`: la página que abre ese QR, o una tarjeta impresa `?c=SERIE-CLAVE`.
- La planilla rechaza el canje de un premio sin activar. Detalle: guía § «Activación».
- Hasta instalar la planilla (`endpoint` vacío), `activar.html` y `pantalla.html` muestran «Falta conectar la planilla» y los juegos siguen en fase 1.

**Para salir de verdad (antes del 5/12, una publicación más):**
1. Instalar la planilla (guía § 4) con las 3 propiedades: `TOKEN`, `STAFF_KEY` (12 caracteres o más, al azar) y `STAND_SECRET`.
2. Completar `endpoint` y `endpointToken` en `common-config.js`, cambiar `codeSalt` y cargar `waMarca`; reconstruir con `build.py`.
3. Volver a copiar a `public/juegos/unboxingfest/` los 3 juegos, `index.html`, `sw.js`, `activar.html` y `pantalla.html`, y publicar.
