import {
  DashboardLinkBuilder,
  DashboardLinkType,
  DatasourceVariableBuilder,
} from '@grafana/grafana-foundation-sdk/dashboard';
import * as prometheus from '@grafana/grafana-foundation-sdk/prometheus';

// Dashboard variable for Prometheus-compatible datasource (VictoriaMetrics, Prometheus, etc.)
export const DATASOURCE_VAR = 'datasource';
export const DATASOURCE = { type: 'prometheus' as const, uid: `\$${DATASOURCE_VAR}` };

export function datasourceVariable(): DatasourceVariableBuilder {
  return new DatasourceVariableBuilder(DATASOURCE_VAR)
    .label('Data source')
    .type('prometheus');
}

// Reusable query builder for HA metrics (VictoriaMetrics via InfluxDB → Prometheus)
export function haQuery(expr: string, legend?: string): prometheus.DataqueryBuilder {
  const q = new prometheus.DataqueryBuilder()
    .datasource(DATASOURCE)
    .expr(expr);
  if (legend) q.legendFormat(legend);
  return q;
}

// Detail dashboards for drilldown from stat panels
export const DETAIL_DASHBOARD_UID = 'fems-detail-whs11';
export const VW_DETAIL_DASHBOARD_UID = 'vw-id7-detail';

// Data link for stat/gauge panels → opens detail dashboard with time series curve
export function detailLink(title: string, metric: string, entityId: string): DashboardLinkBuilder {
  return new DashboardLinkBuilder('Detailansicht')
    .type(DashboardLinkType.Link)
    .url(`/d/${DETAIL_DASHBOARD_UID}?var-entity=${entityId}&var-metric=${metric}&var-title=${encodeURIComponent(title)}`)
    .keepTime(true)
    .includeVars(true);
}

// Data link for computed PromQL expressions → opens detail dashboard with expression query
export function detailExprLink(title: string, expr: string, unit?: string): DashboardLinkBuilder {
  let url = `/d/${DETAIL_DASHBOARD_UID}?var-expr=${encodeURIComponent(expr)}&var-title=${encodeURIComponent(title)}`;
  if (unit) {
    url += `&var-unit=${unit}`;
  }
  return new DashboardLinkBuilder('Detailansicht')
    .type(DashboardLinkType.Link)
    .url(url)
    .keepTime(true)
    .includeVars(true);
}

export function vwDetailLink(title: string, metric: string, entityId: string): DashboardLinkBuilder {
  return new DashboardLinkBuilder('Detailansicht')
    .type(DashboardLinkType.Link)
    .url(`/d/${VW_DETAIL_DASHBOARD_UID}?var-entity=${entityId}&var-metric=${metric}&var-title=${encodeURIComponent(title)}`)
    .keepTime(true)
    .includeVars(true);
}

// Multi-entity detail link (e.g. battery temp max + min + outdoor + power overlay)
export function vwDetailLink2(
  title: string, metric: string,
  entityId: string,
  entityId2: string, legend2: string,
  entity3?: { entityId: string; metric: string; legend: string },
  rightAxis?: { expr: string; legend: string },
  rightAxis2?: { expr: string; legend: string },
): DashboardLinkBuilder {
  let url = `/d/${VW_DETAIL_DASHBOARD_UID}?var-entity=${entityId}&var-entity2=${entityId2}&var-metric=${metric}&var-title=${encodeURIComponent(title)}&var-legend2=${encodeURIComponent(legend2)}`;
  if (entity3) {
    url += `&var-entity3=${entity3.entityId}&var-metric3=${entity3.metric}&var-legend3=${encodeURIComponent(entity3.legend)}`;
  }
  if (rightAxis) {
    url += `&var-expr4=${encodeURIComponent(rightAxis.expr)}&var-legend4=${encodeURIComponent(rightAxis.legend)}`;
  }
  if (rightAxis2) {
    url += `&var-expr5=${encodeURIComponent(rightAxis2.expr)}&var-legend5=${encodeURIComponent(rightAxis2.legend)}`;
  }
  return new DashboardLinkBuilder('Detailansicht')
    .type(DashboardLinkType.Link)
    .url(url)
    .keepTime(true)
    .includeVars(true);
}

// Common threshold color steps
export const BATTERY_THRESHOLDS = [
  { value: null as unknown as number, color: 'red' },
  { value: 20, color: 'orange' },
  { value: 40, color: 'yellow' },
  { value: 60, color: 'green' },
];

export const RANGE_THRESHOLDS = [
  { value: null as unknown as number, color: 'red' },
  { value: 50, color: 'orange' },
  { value: 100, color: 'yellow' },
  { value: 200, color: 'green' },
];
