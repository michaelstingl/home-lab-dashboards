/**
 * Esprimo Health — Dashboard
 *
 * Host-Gesundheit für den Fujitsu Esprimo Q958 (PVE).
 * Scope aktuell: AKS-95 (instance=pve auf 95-pve). Metriken:
 *  - node_exporter (Temperaturen, Load, Memory, Uptime)
 *  - smartmon.prom textfile collector (SMART-Attribute)
 *  - rasdaemon.prom textfile collector (MCE / Memory-Controller-Errors)
 *  - watchdog_present / systemd_runtime_watchdog_seconds (hw watchdog state)
 *
 * Motivation: mehrere silent freezes (Apr 9, Apr 17) ohne Log-Spur.
 * Dashboard soll Degradationstrends (Temp, SMART-Wearout, RAS-Events)
 * früh sichtbar machen.
 *
 * Generate: bun src/esprimo-health.ts > dist/esprimo-health.json
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

const COLORS = {
  ok: '#2ecc71',
  warn: '#f39c12',
  err: '#e74c3c',
  info: '#3498db',
  neutral: '#7f8c8d',
  temp: '#e67e22',
};

const HOST = '{instance="pve"}';

// ============================================================================
// Row 1: Overview stats
// ============================================================================

function uptimeStat(): StatBuilder {
  return new StatBuilder()
    .title('Uptime')
    .description('Sekunden seit letztem Boot (node_boot_time_seconds).')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('s')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.err },
          { value: 3600, color: COLORS.warn },
          { value: 86400, color: COLORS.ok },
        ])
    )
    .withTarget(haQuery(`time() - node_boot_time_seconds${HOST}`, 'uptime'));
}

function reboots30dStat(): StatBuilder {
  return new StatBuilder()
    .title('Reboots (30d)')
    .description('Anzahl Boot-Time-Wechsel in den letzten 30 Tagen. >2 deutet auf instabilen Host.')
    .datasource(DATASOURCE)
    .height(5).span(6)
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
          { value: 2, color: COLORS.warn },
          { value: 4, color: COLORS.err },
        ])
    )
    .withTarget(haQuery(`changes(node_boot_time_seconds${HOST}[30d])`, 'reboots'));
}

function watchdogStat(): StatBuilder {
  return new StatBuilder()
    .title('Hardware Watchdog')
    .description('watchdog_present * systemd RuntimeWatchdogSec. 0 = nicht armed. 60 = armed (60s timeout).')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('s')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.err },
          { value: 1, color: COLORS.ok },
        ])
    )
    .withTarget(
      haQuery(
        `watchdog_present${HOST} * systemd_runtime_watchdog_seconds${HOST}`,
        'armed seconds'
      )
    );
}

function rasEventsStat(): StatBuilder {
  return new StatBuilder()
    .title('RAS Events (total)')
    .description('Memory-Controller + MCE Events gesamt. Muss 0 bleiben — alles darüber = Hardware-Fehler.')
    .datasource(DATASOURCE)
    .height(5).span(6)
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
      haQuery(
        `rasdaemon_mc_events_total${HOST} + rasdaemon_mce_records_total${HOST}`,
        'events'
      )
    );
}

// ============================================================================
// Row 2: Temperatures
// ============================================================================

function cpuTemps(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('CPU Temperatures')
    .description('Coretemp-Sensoren (Package + 6 Cores). i5-8500T: high=94°C, crit=100°C.')
    .datasource(DATASOURCE)
    .height(9).span(16)
    .unit('celsius')
    .decimals(0)
    .min(30).max(100)
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
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.ok },
          { value: 75, color: COLORS.warn },
          { value: 90, color: COLORS.err },
        ])
    )
    .withTarget(
      haQuery(
        `node_hwmon_temp_celsius{instance="pve",chip=~"platform_coretemp.*"}`,
        '{{sensor}}'
      )
    );
}

function chipsetTemps(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Chipset / Thermal Zones')
    .description('PCH Cannon Lake (Chipset) und Kernel thermal zones.')
    .datasource(DATASOURCE)
    .height(9).span(8)
    .unit('celsius')
    .decimals(0)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .withTarget(
      haQuery(
        `node_thermal_zone_temp{instance="pve"}`,
        '{{type}}-zone{{zone}}'
      )
    );
}

// ============================================================================
// Row 3: Load & Memory
// ============================================================================

function loadAvg(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Load Average')
    .description('1m / 5m / 15m load. i5-8500T hat 6 Kerne — Dauer-Load >6 bedeutet Sättigung.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('short')
    .decimals(2)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.List)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'max'])
    )
    .withTarget(haQuery(`node_load1${HOST}`, 'load1'))
    .withTarget(haQuery(`node_load5${HOST}`, 'load5'))
    .withTarget(haQuery(`node_load15${HOST}`, 'load15'));
}

function memoryUsage(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Memory')
    .description('Used / Buffers+Cache / Free. Total: 16 GB (2×8 GB DDR4-2667, non-ECC).')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('bytes')
    .decimals(1)
    .fillOpacity(30)
    .lineWidth(1)
    .showPoints(common.VisibilityMode.Never)
    .stacking(new common.StackingConfigBuilder().mode(common.StackingMode.Normal))
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'mean'])
    )
    .withTarget(
      haQuery(
        `node_memory_MemTotal_bytes${HOST} - node_memory_MemAvailable_bytes${HOST}`,
        'used'
      )
    )
    .withTarget(
      haQuery(
        `node_memory_Buffers_bytes${HOST} + node_memory_Cached_bytes${HOST}`,
        'buffers+cache'
      )
    )
    .withTarget(haQuery(`node_memory_MemFree_bytes${HOST}`, 'free'));
}

// ============================================================================
// Row 4: SMART / Storage
// ============================================================================

function smartHealthStat(): StatBuilder {
  return new StatBuilder()
    .title('SMART Health')
    .description('smartmon_device_smart_healthy: 1 = PASSED, 0 = FAILED. Pro Disk ein Wert.')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('short')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .textMode(common.BigValueTextMode.ValueAndName)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.err },
          { value: 1, color: COLORS.ok },
        ])
    )
    .withTarget(haQuery(`smartmon_device_smart_healthy${HOST}`, '{{disk}}'));
}

function smartPowerOnHoursStat(): StatBuilder {
  return new StatBuilder()
    .title('Power-on Hours')
    .description('SMART Attribut 9 — Betriebsstunden der SSD.')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('h')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .textMode(common.BigValueTextMode.ValueAndName)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([{ value: null as unknown as number, color: COLORS.info }])
    )
    .withTarget(
      haQuery(
        `smartmon_power_on_hours_raw_value${HOST}`,
        '{{disk}}'
      )
    );
}

function smartWearoutStat(): StatBuilder {
  return new StatBuilder()
    .title('Wear Leveling (Samsung)')
    .description('smartmon_wear_leveling_count_value — Samsung SSD, startet bei 100 und zählt runter. <10 = am Ende.')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('percent')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Line)
    .textMode(common.BigValueTextMode.ValueAndName)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.err },
          { value: 20, color: COLORS.warn },
          { value: 50, color: COLORS.ok },
        ])
    )
    .withTarget(
      haQuery(`smartmon_wear_leveling_count_value${HOST}`, '{{disk}}')
    );
}

function smartReallocatedStat(): StatBuilder {
  return new StatBuilder()
    .title('Reallocated Sectors')
    .description('SMART Attribut 5 raw value. Jeder Wert >0 = SSD beginnt Sektoren umzumappen (Frühwarnung).')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('short')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .textMode(common.BigValueTextMode.ValueAndName)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.ok },
          { value: 1, color: COLORS.warn },
          { value: 10, color: COLORS.err },
        ])
    )
    .withTarget(
      haQuery(
        `smartmon_reallocated_sector_ct_raw_value${HOST}`,
        '{{disk}}'
      )
    );
}

function smartTemp(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('SSD Temperature')
    .description('SMART airflow/temp Attribut. Samsung-SSDs halten ~40–60°C im Normalbetrieb.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('celsius')
    .decimals(0)
    .min(20).max(80)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.ok },
          { value: 65, color: COLORS.warn },
          { value: 75, color: COLORS.err },
        ])
    )
    .withTarget(
      haQuery(
        `smartmon_airflow_temperature_cel_raw_value${HOST} or smartmon_temperature_celsius_raw_value${HOST}`,
        '{{disk}}'
      )
    );
}

function smartWriteGrowth(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Total LBAs Written (rate)')
    .description('Schreibrate aus SMART LBAs_written. Hoher Dauer-Write beschleunigt Wearout.')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .unit('wps')
    .decimals(0)
    .fillOpacity(10)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .withTarget(
      haQuery(
        `rate(smartmon_total_lbas_written_raw_value${HOST}[5m])`,
        '{{disk}}'
      )
    );
}

// ============================================================================
// Row 5: RAS Events
// ============================================================================

function rasEventsTimeseries(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('RAS Events over time')
    .description('rasdaemon Memory-Controller + MCE Counter. Muss flach 0 bleiben. Jeder Anstieg = Hardware-Event.')
    .datasource(DATASOURCE)
    .height(8).span(24)
    .unit('short')
    .decimals(0)
    .fillOpacity(20)
    .lineWidth(2)
    .showPoints(common.VisibilityMode.Never)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.List)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'max'])
    )
    .withTarget(haQuery(`rasdaemon_mc_events_total${HOST}`, 'memory controller'))
    .withTarget(haQuery(`rasdaemon_mce_records_total${HOST}`, 'mce records'));
}

// ============================================================================
// Dashboard Assembly
// ============================================================================

const dashboard = new DashboardBuilder('Esprimo Health — AKS-95')
  .uid('esprimo-health-aks95')
  .tags(['hardware', 'pve', 'aks-95', 'esprimo'])
  .description('Fujitsu Esprimo Q958 host health — temps, SMART, RAS events, watchdog. Instance label: pve.')
  .editable()
  .timezone('browser')
  .refresh('1m')
  .time({ from: 'now-24h', to: 'now' })
  .withVariable(datasourceVariable())

  .withRow(new RowBuilder('Overview'))
  .withPanel(uptimeStat())
  .withPanel(reboots30dStat())
  .withPanel(watchdogStat())
  .withPanel(rasEventsStat())

  .withRow(new RowBuilder('Temperatures'))
  .withPanel(cpuTemps())
  .withPanel(chipsetTemps())

  .withRow(new RowBuilder('Load & Memory'))
  .withPanel(loadAvg())
  .withPanel(memoryUsage())

  .withRow(new RowBuilder('SMART / Storage'))
  .withPanel(smartHealthStat())
  .withPanel(smartPowerOnHoursStat())
  .withPanel(smartWearoutStat())
  .withPanel(smartReallocatedStat())
  .withPanel(smartTemp())
  .withPanel(smartWriteGrowth())

  .withRow(new RowBuilder('RAS Events'))
  .withPanel(rasEventsTimeseries());

console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
