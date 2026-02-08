/**
 * FENECON Detail - Drilldown Dashboard
 *
 * Zeigt eine gewählte Metrik als einzelne Kurve mit Statistiken.
 * Klick auf Stat/Gauge im Energiemonitor → öffnet Detailansicht.
 *
 * URL-Parameter (als Grafana TextBox Variables):
 *   var-entity  = Entity ID (z.B. fems81655_sum_productionactivepower)
 *   var-metric  = Metrik-Name (z.B. W_value, Wh_value, %_value)
 *   var-title   = Anzeige-Titel (z.B. Erzeugung (PV))
 *   var-expr    = (optional) PromQL-Ausdruck statt entity/metric (z.B. Autarkie-Berechnung)
 *   var-unit    = (optional) Einheit (z.B. percent, watt, kwatth)
 *   var-ymin    = (optional) Y-Achse Minimum (z.B. 0)
 *   var-ymax    = (optional) Y-Achse Maximum (z.B. 100)
 *
 * Generate: bun src/fems-detail.ts > dist/fems-detail.json
 * Deploy:   see README.md
 */

import {
  DashboardBuilder,
  DashboardLinkBuilder,
  DashboardLinkType,
  TextBoxVariableBuilder,
  VariableHide,
} from '@grafana/grafana-foundation-sdk/dashboard';
import * as common from '@grafana/grafana-foundation-sdk/common';
import * as prometheus from '@grafana/grafana-foundation-sdk/prometheus';
import { PanelBuilder as TimeseriesBuilder } from '@grafana/grafana-foundation-sdk/timeseries';
import { ThresholdsConfigBuilder, ThresholdsMode } from '@grafana/grafana-foundation-sdk/dashboard';

import { DATASOURCE, datasourceVariable, haQuery, DETAIL_DASHBOARD_UID } from './shared';

function buildDetailPanel(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('$title')
    .datasource(DATASOURCE)
    .height(20).span(24)
    .lineWidth(2)
    .fillOpacity(25)
    .drawStyle(common.GraphDrawStyle.Line)
    .lineInterpolation(common.LineInterpolation.StepAfter)
    .spanNulls(true)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'min', 'max', 'mean'])
    )
    .tooltip(
      new common.VizTooltipOptionsBuilder()
        .mode(common.TooltipDisplayMode.Multi)
        .sort(common.SortOrder.Descending)
    )
    // Target A: standard entity/metric query (for normal drilldowns)
    .withTarget(haQuery('{__name__="$metric", entity_id="$entity"}', '$title'))
    // Target B: arbitrary PromQL expression (for computed metrics like Autarkie)
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr('$expr')
        .legendFormat('$title')
        .refId('B')
    )
    // Override: expression target (B) uses percent with 0-100 axis
    .withOverride({
      matcher: { id: 'byFrameRefID', options: 'B' },
      properties: [
        { id: 'unit', value: 'percent' },
        { id: 'custom.axisSoftMin', value: 0 },
        { id: 'custom.axisSoftMax', value: 100 },
      ],
    });
}

const dashboard = new DashboardBuilder('FENECON Detail')
  .uid(DETAIL_DASHBOARD_UID)
  .tags(['fenecon', 'energy', 'detail', 'whs-11'])
  .description('Detailansicht einer gewählten Metrik')
  .editable()
  .timezone('browser')
  .refresh('30s')
  .time({ from: 'now/d', to: 'now/d' })

  // Variables
  .withVariable(datasourceVariable())
  .withVariable(
    new TextBoxVariableBuilder('entity')
      .label('Entity')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('metric')
      .label('Metric')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('title')
      .label('Title')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('expr')
      .label('Expression')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('unit')
      .label('Unit')
      .hide(VariableHide.HideVariable)
  )

  // Back link to main dashboard
  .link(
    new DashboardLinkBuilder('← Energiemonitor')
      .type(DashboardLinkType.Link)
      .url('/d/fems-energy-whs11')
      .keepTime(true)
      .includeVars(false)
      .icon('arrow-left')
  )

  // Single metric detail panel
  .withPanel(buildDetailPanel());

console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
