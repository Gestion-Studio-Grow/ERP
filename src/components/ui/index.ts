// Punto de entrada del design system. Importar desde "@/components/ui".
export { cn } from "./cn";
export { Button, ButtonLink, buttonClasses } from "./Button";
export type { ButtonProps, ButtonLinkProps } from "./Button";
export { Card, CardHeader, CardTitle, CardDescription } from "./Card";
export type { CardProps } from "./Card";
export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";
export { Input, Select, Textarea, Field } from "./Field";
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
export type { KpiTileProps } from "./KpiTile";
export { EmptyState } from "./EmptyState";
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
