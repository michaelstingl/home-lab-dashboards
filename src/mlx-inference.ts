/**
 * MLX Inference — Dashboard
 *
 * AKS-95 Nürnberg — mlx-vlm server on the MacBook Air M5 (192.168.95.121:8080).
 * Metrics emitted by mlx/observability MetricsMiddleware, scraped by vmagent on
 * 95-pve, stored in VictoriaMetrics (CT 9530).
 *
 * Metric reference: home-lab/mlx/observability/README.md
 *
 * Generate: bun src/mlx-inference.ts > dist/mlx-inference.json
 * Deploy:   see README.md
 */

import {
  DashboardBuilder,
  RowBuilder,
  ThresholdsConfigBuilder,
  ThresholdsMode,
} from '@grafana/grafana-foundation-sdk/dashboard';
import * as common from '@grafana/grafana-foundation-sdk/common';
import { PanelBuilder as StatBuilder } from '@grafana/grafana-foundation-sdk/stat';
import { PanelBuilder as TimeseriesBuilder } from '@grafana/grafana-foundation-sdk/timeseries';

import { DATASOURCE, datasourceVariable, haQuery } from './shared';

// ============================================================================
// Colours — MLX / Apple Silicon vibe, muted
// ============================================================================
const COLORS = {
  req: '#3498db',
  ok: '#2ecc71',
  err: '#e74c3c',
  warn: '#f39c12',
  latency: '#9b59b6',
  body: '#7f8c8d',
  tool: '#1abc9c',
};

const JOB = '{job="mlx"}';

// ============================================================================
// Row 1: Overview
// ============================================================================

function activeModelStat(): StatBuilder {
  return new StatBuilder()
    .title('Aktives Modell')
    .description('Modell mit der jüngsten Request-Aktivität (letzter Zeitstempel aus mlx_last_request_timestamp_seconds).')
    .datasource(DATASOURCE)
    .height(5).span(8)
    .unit('dateTimeFromNow')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .textMode(common.BigValueTextMode.ValueAndName)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([{ value: null as unknown as number, color: COLORS.req }])
    )
    .withTarget(
      haQuery(`topk(1, mlx_last_request_timestamp_seconds${JOB} * 1000)`, '{{model}}')
    );
}

function requestsLastHourStat(): StatBuilder {
  return new StatBuilder()
    .title('Requests (1h)')
    .description('Summe aller Requests in der letzten Stunde, über alle Modelle.')
    .datasource(DATASOURCE)
    .height(5).span(4)
    .unit('short')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: '#7f8c8d' },
          { value: 1, color: COLORS.req },
        ])
    )
    .withTarget(
      haQuery(`sum(increase(mlx_requests_total${JOB}[1h]))`, 'requests')
    );
}

function errorsLastHourStat(): StatBuilder {
  return new StatBuilder()
    .title('Errors (1h)')
    .description('Summe aller mlx_errors_total in der letzten Stunde. Errors entstehen nur wenn die Downstream-App crasht bevor eine Response gesendet wurde.')
    .datasource(DATASOURCE)
    .height(5).span(4)
    .unit('short')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.ok },
          { value: 1, color: COLORS.err },
        ])
    )
    .withTarget(
      haQuery(`sum(increase(mlx_errors_total${JOB}[1h])) or vector(0)`, 'errors')
    );
}

function p95LatencyStat(): StatBuilder {
  return new StatBuilder()
    .title('p95 Latency (5m)')
    .description('95. Perzentil der End-to-End Request-Duration über alle Pfade/Modelle (5-Minuten-Fenster).')
    .datasource(DATASOURCE)
    .height(5).span(4)
    .unit('s')
    .decimals(2)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.ok },
          { value: 10, color: COLORS.warn },
          { value: 60, color: COLORS.err },
        ])
    )
    .withTarget(
      haQuery(
        `histogram_quantile(0.95, sum(rate(mlx_request_duration_seconds_bucket${JOB}[5m])) by (le))`,
        'p95'
      )
    );
}

// ============================================================================
// Row 2: Throughput
// ============================================================================

function requestRateByModel(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Requests/sec by model')
    .description('Request-Rate pro Modell, 5-Minuten-Rate.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('reqps')
    .decimals(2)
    .fillOpacity(20)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'mean', 'max'])
    )
    .withTarget(
      haQuery(`sum by (model) (rate(mlx_requests_total${JOB}[5m]))`, '{{model}}')
    );
}

function requestRateByStatus(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Requests/sec by status class')
    .description('Request-Rate aufgeschlüsselt nach status_class (2xx/4xx/5xx). 5xx sollte 0 sein.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('reqps')
    .decimals(2)
    .fillOpacity(20)
    .lineWidth(2)
    .stacking(new common.StackingConfigBuilder().mode(common.StackingMode.Normal))
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'mean', 'max'])
    )
    .withTarget(
      haQuery(`sum by (status_class) (rate(mlx_requests_total${JOB}[5m]))`, '{{status_class}}')
    );
}

// ============================================================================
// Row 3: Latency
// ============================================================================

function latencyPercentiles(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Latency p50 / p95 / p99')
    .description('Request-Duration Perzentile aus dem mlx_request_duration_seconds Histogram. Cold starts erscheinen als Spikes im p99.')
    .datasource(DATASOURCE)
    .height(8).span(24)
    .unit('s')
    .decimals(2)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'mean', 'max'])
    )
    .withTarget(
      haQuery(
        `histogram_quantile(0.50, sum by (le, model) (rate(mlx_request_duration_seconds_bucket${JOB}[5m])))`,
        'p50 {{model}}'
      )
    )
    .withTarget(
      haQuery(
        `histogram_quantile(0.95, sum by (le, model) (rate(mlx_request_duration_seconds_bucket${JOB}[5m])))`,
        'p95 {{model}}'
      )
    )
    .withTarget(
      haQuery(
        `histogram_quantile(0.99, sum by (le, model) (rate(mlx_request_duration_seconds_bucket${JOB}[5m])))`,
        'p99 {{model}}'
      )
    );
}

// ============================================================================
// Row 4: Tool Use
// ============================================================================

function toolUseShare(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Tool-Use Share')
    .description('Anteil der Requests mit tools[] im Body (has_tools="true") an allen Requests.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('percentunit')
    .decimals(1)
    .min(0).max(1)
    .fillOpacity(20)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .withTarget(
      haQuery(
        `sum(rate(mlx_requests_total{job="mlx",has_tools="true"}[5m])) / clamp_min(sum(rate(mlx_requests_total${JOB}[5m])), 0.001)`,
        'with tools'
      )
    );
}

function toolCountPercentiles(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Tools per request p50 / p95')
    .description('Anzahl angebotener Tools pro Request, Perzentile aus mlx_tools_per_request.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('short')
    .decimals(0)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'max'])
    )
    .withTarget(
      haQuery(
        `histogram_quantile(0.50, sum by (le, model) (rate(mlx_tools_per_request_bucket${JOB}[5m])))`,
        'p50 {{model}}'
      )
    )
    .withTarget(
      haQuery(
        `histogram_quantile(0.95, sum by (le, model) (rate(mlx_tools_per_request_bucket${JOB}[5m])))`,
        'p95 {{model}}'
      )
    );
}

// ============================================================================
// Row 5: Body Sizes
// ============================================================================

function requestBodyP95(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Request body p95')
    .description('95. Perzentil der eingehenden Request-Body-Größe. Spikes = große Tool-Schemata oder Bilder.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('bytes')
    .decimals(1)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .withTarget(
      haQuery(
        `histogram_quantile(0.95, sum by (le, model) (rate(mlx_request_body_bytes_bucket${JOB}[5m])))`,
        '{{model}}'
      )
    );
}

function responseBodyP95(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Response body p95')
    .description('95. Perzentil der ausgehenden Response-Body-Größe (Summe über Stream-Chunks).')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('bytes')
    .decimals(1)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .withTarget(
      haQuery(
        `histogram_quantile(0.95, sum by (le, model) (rate(mlx_response_body_bytes_bucket${JOB}[5m])))`,
        '{{model}}'
      )
    );
}

// ============================================================================
// Row 6: Errors
// ============================================================================

function errorRate(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Errors/sec by exception')
    .description('Fehlerrate aufgeschlüsselt nach Exception-Klasse. Nur ASGI-Level Crashes vor dem Senden einer Response.')
    .datasource(DATASOURCE)
    .height(8).span(24)
    .unit('ops')
    .decimals(2)
    .fillOpacity(20)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'max'])
    )
    .withTarget(
      haQuery(`sum by (exception, model) (rate(mlx_errors_total${JOB}[5m]))`, '{{exception}} / {{model}}')
    );
}

// ============================================================================
// Dashboard Assembly
// ============================================================================

const dashboard = new DashboardBuilder('MLX Inference')
  .uid('mlx-inference-aks95')
  .tags(['mlx', 'llm', 'inference', 'aks-95'])
  .description('mlx-vlm server metrics — AKS-95 (MacBook Air M5, 192.168.95.121)')
  .editable()
  .timezone('browser')
  .refresh('30s')
  .time({ from: 'now-6h', to: 'now' })
  .withVariable(datasourceVariable())

  .withRow(new RowBuilder('Overview'))
  .withPanel(activeModelStat())
  .withPanel(requestsLastHourStat())
  .withPanel(errorsLastHourStat())
  .withPanel(p95LatencyStat())

  .withRow(new RowBuilder('Throughput'))
  .withPanel(requestRateByModel())
  .withPanel(requestRateByStatus())

  .withRow(new RowBuilder('Latency'))
  .withPanel(latencyPercentiles())

  .withRow(new RowBuilder('Tool Use'))
  .withPanel(toolUseShare())
  .withPanel(toolCountPercentiles())

  .withRow(new RowBuilder('Body Sizes'))
  .withPanel(requestBodyP95())
  .withPanel(responseBodyP95())

  .withRow(new RowBuilder('Errors'))
  .withPanel(errorRate());

console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
