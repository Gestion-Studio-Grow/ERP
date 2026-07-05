// Contenido de la RÉPLICA FIEL de la web de MAGRA (magrameatmarket.com.ar), para el
// demo "no te tocamos tu vidriera, te vendemos el backoffice" (segmento con agencia).
//
// AUTORIZACIÓN: el cliente (magra) autorizó replicar su propio sitio y usar sus assets.
// Textos e imágenes son de SU web (transcripción literal + URLs reales). NO es nuestro
// copy de marketing — es el contenido de ellos as-is.
//
// IMÁGENES: por ahora se referencian por URL (hotlink) a su sitio — no se pudieron
// DESCARGAR al repo con las herramientas disponibles (la red saliente desde shell está
// bloqueada y el fetch web devuelve texto, no binarios). Para dejarlas locales hace falta
// habilitar la descarga o que el dueño pase los archivos. Ver ASSET_MANIFEST abajo.

const BASE = "https://magrameatmarket.com.ar/wp-content/uploads";

// Manifest de assets a bajar al repo (public/tenants/magra/…) cuando haya cómo.
export const ASSET_MANIFEST: { local: string; remote: string }[] = [
  { local: "logo.webp", remote: `${BASE}/2025/06/logoTransp-180x65.webp` },
  { local: "logo-footer.png", remote: `${BASE}/2025/06/logoRecurso-1-300x108.png` },
  { local: "hero-carnes.png", remote: `${BASE}/2025/06/carnes_optimized.png` },
  { local: "gourmet-ensaladas.jpeg", remote: `${BASE}/2025/06/20180703142812_024a8521_edited1-85050c65d61217bf7a16306846630975-1024-1024.jpeg` },
  { local: "gourmet-pescado.jpg", remote: `${BASE}/2025/06/56-8a9daeae1e1e99288e17156866532595-1024-1024.jpg` },
  { local: "gourmet-pasta.png", remote: `${BASE}/2025/06/semola-cina-e-korea2.png` },
  { local: "gourmet-conservas.webp", remote: `${BASE}/2025/06/1536968279755.webp` },
  { local: "prov-tinos.webp", remote: `${BASE}/elementor/thumbs/tinos-r7169tct7qe5eqkd3tzk23vn14iun02jrxe97lo8ta.webp` },
  { local: "prov-breaders.png", remote: `${BASE}/elementor/thumbs/breaders-r7122fgkib5njmgn3e8nhb52t2ooxx2uamx0pa4uxq.png` },
  { local: "prov-don-ramon.png", remote: `${BASE}/elementor/thumbs/estancia-don-ramon-r72dymqsxvgk9dymyow787o2lob8ee1jcn8zxln5b2.png` },
  { local: "prov-maderasa.png", remote: `${BASE}/elementor/thumbs/maderasa-1-r7124lh69k4gb9bbftyoq9gc4205osok9d2bj8x6la.png` },
  { local: "prov-paladini.png", remote: `${BASE}/elementor/thumbs/paladini-r7126j18baro6eia5o12urwg2khbiecp6xc91q21su.png` },
  { local: "prov-formagge.png", remote: `${BASE}/elementor/thumbs/formagge-reu6wnm9oh5e2dfgoaa2hardhwsmgj80stn9puf732.png` },
  { local: "prov-lamberti.png", remote: `${BASE}/elementor/thumbs/lamberti-reu74b0zaxmek4bf03br9v9fjt363uldiosjbx2ufy.png` },
  { local: "prov-pizzazen.png", remote: `${BASE}/elementor/thumbs/pizzazen-reu782dqn2rozyut1pu18x3t3ak0w9iq1aqgfri5jy.png` },
  { local: "review-matias.png", remote: `${BASE}/2025/06/mat.png` },
  { local: "review-jesica.png", remote: `${BASE}/2025/06/jes.png` },
  { local: "review-macarena.webp", remote: `${BASE}/2025/06/maca.webp` },
];

// Resuelve la URL de un asset: local si existe en /public, si no el remoto (hotlink).
// Para el demo actual devuelve el remoto (no se pudieron bajar los binarios).
export function asset(local: string): string {
  const m = ASSET_MANIFEST.find((a) => a.local === local);
  return m ? m.remote : local;
}

export interface Benefit { title: string; text: string }
export interface GourmetCat { name: string; img: string }
export interface VacioLine { name: string; text: string }
export interface Provider { name: string; logo: string }
export interface Review { name: string; rating: number; text: string; avatar: string }

export const MAGRA_REPLICA = {
  logo: asset("logo.webp"),
  logoFooter: asset("logo-footer.png"),
  heroImg: asset("hero-carnes.png"),
  heroKicker: "PRODUCTOS GOURMET PREMIUM",
  heroTitle: "Esto no es una carnicería!",
  heroText: "MAGRA no es solo carne: es estilo, practicidad y sabor premium en un solo pack.",
  ctaPrimary: "LISTA DE PRECIOS",
  ctaSecondary: "Hacer pedido",
  benefits: [
    { title: "Free Shipping", text: "¡Te lo llevamos a tu casa sin costo!" },
    { title: "Calidad premium", text: "100% Garantizada. Productos seleccionados envasados." },
    { title: "Todos los medios de pago", text: "Efectivo, crédito, débito, transferencia bancaria y Mercado Pago" },
    { title: "Atención personalizada", text: "Dudas, pedidos o antojos: ¡escribinos por WhatsApp!" },
  ] as Benefit[],
  gourmetTitle: "Productos gourmet",
  gourmet: [
    { name: "Ensaladas y vegetales envasados", img: asset("gourmet-ensaladas.jpeg") },
    { name: "Pescado congelado envasado", img: asset("gourmet-pescado.jpg") },
    { name: "Pasta italiana", img: asset("gourmet-pasta.png") },
    { name: "Conservas importadas", img: asset("gourmet-conservas.webp") },
  ] as GourmetCat[],
  vacioTitle: "Envasados al vacío",
  vacio: [
    { name: "Carne de vaca", text: "Somos distribuidores oficiales de Estancia Don Ramón." },
    { name: "Carne de cerdo", text: "Cortes magros, bajos en grasa, sanos y llenos de sabor." },
    { name: "Pollo orgánico", text: "El clásico que siempre queda bien, fresco y práctico." },
  ] as VacioLine[],
  providersTitle: "Nuestros proveedores",
  providers: [
    { name: "Estancia Don Ramón", logo: asset("prov-don-ramon.png") },
    { name: "Tinos", logo: asset("prov-tinos.webp") },
    { name: "Breaders", logo: asset("prov-breaders.png") },
    { name: "Paladini", logo: asset("prov-paladini.png") },
    { name: "Lamberti", logo: asset("prov-lamberti.png") },
    { name: "Formagge", logo: asset("prov-formagge.png") },
    { name: "PizzaZen", logo: asset("prov-pizzazen.png") },
    { name: "Maderasa", logo: asset("prov-maderasa.png") },
  ] as Provider[],
  reviewsTitle: "Reviews de nuestros clientes",
  reviews: [
    { name: "Matías R.", rating: 5, avatar: asset("review-matias.png"), text: "¡Altísima calidad! Pedí varios cortes y todos llegaron perfectos, bien envasados y con pinta gourmet. La atención también de primera, te responden rápido y re bien predispuestos." },
    { name: "Jesica F.", rating: 5, avatar: asset("review-jesica.png"), text: "Fui al local de casualidad y me llevé una sorpresa. Todo súper prolijo, los productos bien presentados y la atención de diez. Me explicaron cada corte con paciencia y buena onda. Volví y voy a seguir yendo." },
    { name: "Macarena A.", rating: 5, avatar: asset("review-macarena.webp"), text: "La carne es un 10. Súper tierna, sabrosa y viene al vacío impecable. Se nota que es buena de verdad. Además, me atendieron por WhatsApp con toda la onda, me ayudaron a elegir sin apurarme." },
  ] as Review[],
  hoursLabel: "Lunes a sábados de 10 a 20 h · Domingos de 9 a 13 h",
} as const;
