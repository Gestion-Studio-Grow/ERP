# Fantasma Agenda · brief para la sesión de redes + carpeta en Drive (04/11/2026)

> Pedido del dueño: «construyamos primero y hagamos la red social, con su carpeta en Drive». Esta sesión no tiene
> conector de Drive: la estructura queda escrita acá para crearla a mano o desde una sesión con Drive.
> Gate: **nada se publica ni se muestra a un cliente** sin OK del dueño; sin marca de ningún negocio sin autorización
> registrada (`docs/metodologia/generador-preset-ia.md`). Cero gasto (sin pauta, sin dominio).

## 1. Brief para la sesión de redes (`/sesion-negocio`)
- **Producto:** Fantasma Agenda, el add-on del ERP que atiende el WhatsApp del negocio fuera de horario, contesta
  la lista de precios real, ofrece horarios reales y deja el turno pendiente de confirmar. Seña con Mercado Pago en
  la tanda 2: **no prometerla todavía**.
- **A quién:** dueñas y dueños de centros de estética, peluquerías, consultorios y clubes de la zona sur del GBA
  que ya pierden turnos de noche y fin de semana. Voz criolla clara, sin humo, sin «IA» como palabra mágica.
- **Promesa (una sola):** «Los turnos que te escriben a las 23 h quedan anotados en tu agenda, no en el aire».
- **Diferencia con lo gratis:** el agente de Meta contesta; Fantasma Agenda **escribe en tu agenda** con tus precios
  y tus horarios. Decirlo así, sin pegarle a Meta.
- **Qué NO decir:** precios cerrados (provisional: abono chico + por charla), «cobra la seña», nombres de clientes.
- **Formato por canal:** Instagram (carrusel de 5 placas: el problema a las 23 h → la charla → el turno en la agenda
  → qué cuesta por charla → cómo probarlo 14 días), Reels de 20 s con pantalla real del ERP en demo (tenant demo,
  nunca un cliente), WhatsApp Status para referidos, un post en LinkedIn del dueño.
- **Llamado a la acción:** «Contá 14 días cuántos mensajes te llegan fuera de horario» (Paso 0 del kit
  `../../preventa/fantasma-piloto-ch.md`). Es la prueba que confirma el SIGUE: medir antes de vender.
- **Entregables de la sesión:** calendario de 4 semanas (2 piezas por semana), textos finales, guion del reel,
  lista de 10 negocios referidos para el Status. Todo a la carpeta de Drive de abajo; nada binario al repo.

## 2. Estructura propuesta en Drive
```
GSG Lab/
└── Fantasma Agenda/
    ├── 00-LEEME (este brief + ADDON-ERP.md exportados)
    ├── 01-Marca/            logo, paleta y tipografía del add-on (sello GSG, sin marca de clientes)
    ├── 02-Redes/
    │   ├── Calendario-4-semanas (Sheet)
    │   ├── Instagram/       carruseles y textos por fecha (AAAA-MM-DD-tema)
    │   ├── Reels/           guiones y videos (mp4 acá, nunca en Git)
    │   ├── WhatsApp-Status/ placas verticales
    │   └── LinkedIn/        posts del dueño
    ├── 03-Demo/             capturas y video de la demo sobre el tenant demo
    ├── 04-Preventa/         kit CH (copia del repo), planilla del Paso 0, lista de referidos
    ├── 05-Clientes/         una subcarpeta por negocio SÓLO con su autorización registrada
    └── 06-Metricas/         charlas por mes por negocio (exportación de AuditLog), costos de Meta
```
Permisos: dueño editor; sesión de redes editor en `02-Redes` y `03-Demo`; `05-Clientes` sólo dueño.
