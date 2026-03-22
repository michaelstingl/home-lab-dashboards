/**
 * VW ID Detail - Drilldown Dashboard
 *
 * Zeigt eine gewaehlte Metrik als einzelne Kurve mit Statistiken.
 * Klick auf Stat/Gauge im VW ID Dashboard -> oeffnet Detailansicht.
 *
 * URL-Parameter (als Grafana TextBox Variables):
 *   var-entity  = Entity ID (z.B. vw_id_7_tourer_pro_battery_level)
 *   var-metric  = Metrik-Name (z.B. %_value, km_value, kW_value)
 *   var-title   = Anzeige-Titel (z.B. Batteriestand)
 *   var-entity2 = (optional) Zweite Entity ID fuer Vergleichskurve
 *   var-legend2 = (optional) Legende fuer zweite Kurve
 *   var-entity3 = (optional) Dritte Entity ID (z.B. Aussentemperatur)
 *   var-metric3 = (optional) Metrik fuer dritte Entity (falls abweichend)
 *   var-legend3 = (optional) Legende fuer dritte Kurve
 *   var-expr4   = (optional) PromQL-Ausdruck fuer rechte Y-Achse (z.B. abgeleitete Leistung)
 *   var-legend4 = (optional) Legende fuer rechte Y-Achse
 *   var-expr5   = (optional) Zweiter PromQL-Ausdruck fuer rechte Y-Achse (z.B. echte Ladeleistung)
 *   var-legend5 = (optional) Legende fuer zweite rechte Y-Achse-Serie
 *
 * Generate: bun src/vw-id-detail.ts > dist/vw-id-detail.json
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

import { DATASOURCE, datasourceVariable, haQuery, VW_DETAIL_DASHBOARD_UID } from './shared';

function buildDetailPanel(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('$title')
    .datasource(DATASOURCE)
    .height(20).span(24)
    .lineWidth(2)
    .fillOpacity(0)
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
    // Left Y-axis: primary metric (targets A, B, C)
    .withTarget(haQuery('{__name__="$metric", entity_id="$entity"}', '$title'))
    .withTarget(haQuery('{__name__="$metric", entity_id="$entity2"}', '$legend2'))
    .withTarget(haQuery('{__name__="$metric3", entity_id="$entity3"}', '$legend3'))
    // Right Y-axis: optional derived metric (target D) - e.g. power from battery level
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr('$expr4')
        .legendFormat('$legend4')
        .refId('D')
    )
    // Right Y-axis: optional actual metric (target E) - e.g. real charging power
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr('$expr5')
        .legendFormat('$legend5')
        .refId('E')
    )
    // Override: put target D on right Y-axis as semi-transparent bars
    .withOverride({
      matcher: { id: 'byFrameRefID', options: 'D' },
      properties: [
        { id: 'custom.axisPlacement', value: 'right' },
        { id: 'unit', value: 'kwatt' },
        { id: 'custom.drawStyle', value: 'bars' },
        { id: 'custom.fillOpacity', value: 40 },
        { id: 'custom.lineWidth', value: 0 },
        { id: 'color', value: { mode: 'fixed', fixedColor: 'orange' } },
        { id: 'custom.axisSoftMin', value: -150 },
        { id: 'custom.axisSoftMax', value: 150 },
      ],
    })
    // Override: put target E on right Y-axis as green line
    .withOverride({
      matcher: { id: 'byFrameRefID', options: 'E' },
      properties: [
        { id: 'custom.axisPlacement', value: 'right' },
        { id: 'unit', value: 'kwatt' },
        { id: 'custom.drawStyle', value: 'line' },
        { id: 'custom.lineWidth', value: 2 },
        { id: 'custom.fillOpacity', value: 0 },
        { id: 'color', value: { mode: 'fixed', fixedColor: '#00e5ff' } },
        { id: 'custom.axisSoftMin', value: -150 },
        { id: 'custom.axisSoftMax', value: 150 },
      ],
    });
}

const dashboard = new DashboardBuilder('VW ID Detail')
  .uid(VW_DETAIL_DASHBOARD_UID)
  .tags(['vw', 'ev', 'car', 'detail'])
  .description('Detailansicht einer gewaehlten Metrik')
  .editable()
  .timezone('browser')
  .refresh('5m')
  .time({ from: 'now-24h', to: 'now' })

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
    new TextBoxVariableBuilder('entity2')
      .label('Entity 2')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('legend2')
      .label('Legend 2')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('entity3')
      .label('Entity 3')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('metric3')
      .label('Metric 3')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('legend3')
      .label('Legend 3')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('expr4')
      .label('Right Axis Expr')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('legend4')
      .label('Right Axis Legend')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('expr5')
      .label('Right Axis Expr 2')
      .hide(VariableHide.HideVariable)
  )
  .withVariable(
    new TextBoxVariableBuilder('legend5')
      .label('Right Axis Legend 2')
      .hide(VariableHide.HideVariable)
  )

  // Back link — no hardcoded UID, user navigates back via browser
  .link(
    new DashboardLinkBuilder('<- VW ID Dashboard')
      .type(DashboardLinkType.Link)
      .url('javascript:history.back()')
      .keepTime(false)
      .includeVars(false)
      .icon('arrow-left')
  )

  // Detail panel with optional dual Y-axis
  .withPanel(buildDetailPanel());

console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
