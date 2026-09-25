// Punto de entrada del design system. Importar desde "@/components/ui".
export { cn } from "./cn";
export { Button, ButtonLink, buttonClasses, atributosBoton } from "./Button";
export type { ButtonProps, ButtonLinkProps, EstadoBoton } from "./Button";
export { Card, CardHeader, CardTitle, CardDescription } from "./Card";
export type { CardProps } from "./Card";
export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";
export { Input, Select, Textarea, Field } from "./Field";
export { BuscadorCombo } from "./BuscadorCombo";
export type { BuscadorComboProps, OpcionBuscador } from "./BuscadorCombo";
export { Eyebrow, SectionHeading } from "./Heading";
export type { SectionHeadingProps } from "./Heading";
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";
export { SectionGroup } from "./SectionGroup";
export type { SectionGroupProps } from "./SectionGroup";
export { ProfileBadge } from "./ProfileBadge";
export type { ProfileBadgeProps } from "./ProfileBadge";
export { profileEditionLabel, PROFILE_EDITION_LABEL } from "./profile-labels";
export { KpiTile } from "./KpiTile";
export { Esqueleto, KpiTileEsqueleto, NumeroEsqueleto } from "./Esqueleto";
export type { KpiTileProps } from "./KpiTile";
export { EmptyState } from "./EmptyState";
export { AvisoError } from "./AvisoError";
export type { AvisoErrorProps } from "./AvisoError";
export type { EmptyStateProps } from "./EmptyState";
export { DataTable } from "./DataTable";
export type { DataTableProps, DataTableColumn, DataTableSort, SortDirection } from "./DataTable";
export { nextSort, ariaSortFor } from "./data-table-sort";
export { fmtMoneyARS, fmtNumberAR, fmtCuit } from "./format";
export { PageContainer } from "./PageContainer";
export type { PageContainerProps } from "./PageContainer";
export {
  textColumn,
  moneyColumn,
  numberColumn,
  dateColumn,
  statusColumn,
} from "./data-table-columns";

// Piezas del diseño nuevo «Renglón» (ADR-099). Presentacionales (sin "use client") salvo Hoja,
// Aviso, DeslizarParaConfirmar, TecladoNumerico, Tabla, Cajon/Dialogo, MenuMas y PaletaDeComandos,
// que necesitan estado de verdad.
export { Icono } from "./Icono";
export type { NombreIconoPieza } from "./Icono";
export { Kbd } from "./Kbd";
export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";
export { Segmented } from "./Segmented";
export type { SegmentedProps, OpcionSegmentada } from "./Segmented";
export { Chip, ChipLink, chipLinkAtributos } from "./Chip";
export type { ChipProps, ChipLinkProps } from "./Chip";
export { Switch } from "./Switch";
export type { SwitchProps } from "./Switch";
export { Display } from "./Display";
export type { DisplayProps } from "./Display";
export { partirCifra, leerDelta, rutaMicroLinea } from "./display-core";
export { Pulso } from "./Pulso";
export type { EstadoPulso } from "./Pulso";
export { Ticket } from "./Ticket";
export type { LineaTicket } from "./Ticket";
export { Hoja } from "./Hoja";
export type { HojaProps } from "./Hoja";
export { Aviso } from "./Aviso";
export type { AvisoProps, TonoAviso } from "./Aviso";
export { DeslizarParaConfirmar } from "./Deslizar";
export type { DeslizarProps } from "./Deslizar";
export { TecladoNumerico } from "./Teclado";
export type { TecladoProps } from "./Teclado";
export { Plata } from "./Plata";
export type { PlataProps } from "./Plata";
export { Marca, RielDeEstados } from "./Marca";
export type { TipoMarca } from "./Marca";
export { Renglon, Rotulo, Bloque, Seccion, LineaDeEstado, Franja, DosColumnas, Atajos } from "./Renglon";
export type { RenglonProps, BloqueProps } from "./Renglon";
export { Pestanas } from "./Pestanas";
export type { Pestana } from "./Pestanas";
export { PasoDePeriodo } from "./PasoDePeriodo";
export type { PasoDelPeriodo } from "./PasoDePeriodo";
export { LineaDeCuenta } from "./LineaDeCuenta";
// La tabla densa y la paleta de comandos usan el router de Next (`next/navigation`): se importan
// de su archivo (`@/components/ui/Tabla`, `@/components/ui/PaletaDeComandos`), no del índice, para
// que ninguna pantalla que importa el índice arrastre el router (ni los arneses que lo reemplazan).
export type { ColumnaTabla, TeclaDeFila, TablaProps } from "./Tabla";
export {
  hrefConParametros,
  ordenDesdeUrl,
  ordenAUrl,
  paginaConCursor,
} from "./tabla-core";
export type { OrdenTabla } from "./tabla-core";
export { Cajon, Dialogo } from "./Cajon";
export { MenuMas } from "./MenuMas";
export type { Comando, GrupoComando } from "./comandos-core";
