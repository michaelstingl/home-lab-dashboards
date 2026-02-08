/**
 * FENECON FEMS Energiemonitor - Dashboard
 *
 * WHS-11 Erlangen - FEMS fems81655, GoodWe Hybrid, KEBA P40
 * Datenquelle: Home Assistant → VictoriaMetrics (InfluxDB-Protokoll)
 *
 * Generate: bun src/fems-energy.ts > dist/fems-energy.json
 * Deploy:   see README.md
 */

import {
  DashboardBuilder,
  RowBuilder,
  ThresholdsConfigBuilder,
  ThresholdsMode,
} from '@grafana/grafana-foundation-sdk/dashboard';
import * as common from '@grafana/grafana-foundation-sdk/common';
import { PanelBuilder as GaugeBuilder } from '@grafana/grafana-foundation-sdk/gauge';
import { PanelBuilder as StatBuilder } from '@grafana/grafana-foundation-sdk/stat';
import { PanelBuilder as TimeseriesBuilder } from '@grafana/grafana-foundation-sdk/timeseries';
import { PanelBuilder as BarGaugeBuilder } from '@grafana/grafana-foundation-sdk/bargauge';
import { PanelBuilder as StateTimelineBuilder } from '@grafana/grafana-foundation-sdk/statetimeline';

import { DATASOURCE, datasourceVariable, haQuery, detailLink, detailExprLink } from './shared';

// ============================================================================
// Color Palette (inspired by FEMS UI but darker/modern)
// ============================================================================
const COLORS = {
  pv: '#3498db',           // Hellblau - Erzeugung
  pvLight: '#5dade2',      // Hellblau light
  battery: '#2ecc71',      // Grün - Batterie laden
  batteryDark: '#27ae60',  // Dunkelgrün
  discharge: '#e74c3c',    // Rot - Batterie entladen
  gridBuy: '#7f8c8d',      // Grau - Netzbezug
  gridSell: '#9b59b6',     // Violett - Einspeisung
  consumption: '#f39c12',  // Orange/Gelb - Verbrauch
  evcs: '#1abc9c',         // Türkis - Wallbox
  soc: '#3498db',          // Blau - SoC Line
};

// ============================================================================
// Thresholds
// ============================================================================
const SOC_THRESHOLDS = [
  { value: null as unknown as number, color: '#e74c3c' },  // 0-19%: Red
  { value: 20, color: '#f39c12' },                         // 20-39%: Orange
  { value: 40, color: '#f1c40f' },                         // 40-59%: Yellow
  { value: 60, color: '#2ecc71' },                         // 60-100%: Green
];

const AUTARKIE_THRESHOLDS = [
  { value: null as unknown as number, color: '#e74c3c' },  // 0-29%: Red
  { value: 30, color: '#f39c12' },                         // 30-49%: Orange
  { value: 50, color: '#f1c40f' },                         // 50-69%: Yellow
  { value: 70, color: '#2ecc71' },                         // 70-100%: Green
];

const POWER_NEUTRAL = [
  { value: null as unknown as number, color: '#3498db' },
];

// ============================================================================
// Row 1: Live Status Gauges (y=0, h=6)
// ============================================================================

function batterieSocGauge(): GaugeBuilder {
  return new GaugeBuilder()
    .title('Batterie')
    .description('Aktueller Ladestand des Speichers')
    .datasource(DATASOURCE)
    .height(6).span(4)
    .min(0).max(100)
    .unit('percent')
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(SOC_THRESHOLDS)
    )
    .withTarget(
      haQuery('last_over_time({__name__="%_value", entity_id="fems81655_sum_esssoc"}[5m])')
    )
    .dataLinks([detailLink('Batterie (SoC)', '%_value', 'fems81655_sum_esssoc')]);
}

function autarkieGauge(): GaugeBuilder {
  // Autarkie = 1 - (Netzbezug / Verbrauch)
  // Wenn kein Verbrauch, dann 100%
  return new GaugeBuilder()
    .title('Autarkie')
    .description('Anteil des Verbrauchs aus eigener Erzeugung im gewählten Zeitraum')
    .datasource(DATASOURCE)
    .height(6).span(4)
    .min(0).max(100)
    .unit('percent')
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(AUTARKIE_THRESHOLDS)
    )
    .withTarget(
      // scalar() nötig: unterschiedliche entity_id Labels verhindern PromQL-Arithmetik
      haQuery(`
        (1 - (
          scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridbuyactiveenergy"}[$__range]))
          /
          clamp_min(scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridbuyactiveenergy"}[$__range])) + scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_productionactiveenergy"}[$__range])) - scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridsellactiveenergy"}[$__range])), 1)
        )) * 100
      `, 'Autarkie %')
    )
    .dataLinks([detailExprLink('Autarkie',
      '(1 - (scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridbuyactiveenergy"}[$__interval])) / clamp_min(scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridbuyactiveenergy"}[$__interval])) + scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_productionactiveenergy"}[$__interval])) - scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridsellactiveenergy"}[$__interval])), 1))) * 100',
      'percent',
    )]);
}

function eigenverbrauchGauge(): GaugeBuilder {
  // Eigenverbrauch = 1 - (Einspeisung / Erzeugung)
  return new GaugeBuilder()
    .title('Eigenverbrauch')
    .description('Anteil der Erzeugung, die selbst verbraucht wird, im gewählten Zeitraum')
    .datasource(DATASOURCE)
    .height(6).span(4)
    .min(0).max(100)
    .unit('percent')
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(AUTARKIE_THRESHOLDS)
    )
    .withTarget(
      // scalar() nötig: unterschiedliche entity_id Labels verhindern PromQL-Arithmetik
      haQuery(`
        (1 - (
          scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridsellactiveenergy"}[$__range]))
          /
          clamp_min(scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_productionactiveenergy"}[$__range])), 1)
        )) * 100
      `, 'Eigenverbrauch %')
    )
    .dataLinks([detailExprLink('Eigenverbrauch',
      '(1 - (scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridsellactiveenergy"}[$__interval])) / clamp_min(scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_productionactiveenergy"}[$__interval])), 1))) * 100',
      'percent',
    )]);
}

// ============================================================================
// Row 2: Live Power Stats (y=6, h=4)
// ============================================================================

function pvPowerStat(): StatBuilder {
  return new StatBuilder()
    .title('Erzeugung')
    .description('Aktuelle PV-Leistung beider MPPT-Strings (GoodWe Hybrid-Wechselrichter)')
    .datasource(DATASOURCE)
    .height(4).span(6)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: '#7f8c8d' },
          { value: 100, color: COLORS.pv },
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_sum_productionactivepower"}', 'PV')
    )
    .dataLinks([detailLink('Erzeugung (PV)', 'W_value', 'fems81655_sum_productionactivepower')]);
}

function consumptionPowerStat(): StatBuilder {
  return new StatBuilder()
    .title('Verbrauch')
    .description('Aktueller Gesamtverbrauch des Haushalts (inkl. Wallbox)')
    .datasource(DATASOURCE)
    .height(4).span(6)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.consumption },
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_sum_consumptionactivepower"}', 'Verbrauch')
    )
    .dataLinks([detailLink('Verbrauch', 'W_value', 'fems81655_sum_consumptionactivepower')]);
}

function gridPowerStat(): StatBuilder {
  // Positive = Bezug, Negative = Einspeisung
  return new StatBuilder()
    .title('Netz')
    .description('Positiv = Bezug, Negativ = Einspeisung')
    .datasource(DATASOURCE)
    .height(4).span(6)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.gridSell },  // Negative = Einspeisung
          { value: 0, color: COLORS.gridBuy },                           // Positive = Bezug
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_sum_gridactivepower"}', 'Netz')
    )
    .dataLinks([detailLink('Netz', 'W_value', 'fems81655_sum_gridactivepower')]);
}

function batteryPowerStat(): StatBuilder {
  // Positive = Entladung, Negative = Beladung
  return new StatBuilder()
    .title('Speicher')
    .description('Positiv = Entladung, Negativ = Beladung')
    .datasource(DATASOURCE)
    .height(4).span(6)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.battery },     // Negative = Laden
          { value: 0, color: COLORS.discharge },                          // Positive = Entladen
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_sum_essactivepower"}', 'Speicher')
    )
    .dataLinks([detailLink('Speicher', 'W_value', 'fems81655_sum_essactivepower')]);
}

// ============================================================================
// Row 3: Main Energy Chart (y=10, h=12)
// ============================================================================

function energyMonitorChart(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Energiemonitor')
    .description('Leistungsflüsse im Zeitverlauf mit Batterie-Ladestand')
    .datasource(DATASOURCE)
    .height(12).span(24)
    .min(0)
    .lineWidth(2)
    .fillOpacity(30)
    .drawStyle(common.GraphDrawStyle.Line)
    .lineInterpolation(common.LineInterpolation.StepAfter)
    .spanNulls(true)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'max', 'mean'])
    )
    .tooltip(
      new common.VizTooltipOptionsBuilder()
        .mode(common.TooltipDisplayMode.Multi)
        .sort(common.SortOrder.Descending)
    )
    // PV Erzeugung
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_sum_productionactivepower"}', 'Erzeugung')
    )
    // Verbrauch
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_sum_consumptionactivepower"}', 'Verbrauch')
    )
    // Batterie (abs für positive Darstellung)
    .withTarget(
      haQuery('abs({__name__="W_value", entity_id="fems81655_sum_essactivepower"})', 'Speicher')
    )
    // Netzbezug (nur positive Werte)
    .withTarget(
      haQuery('clamp_min({__name__="W_value", entity_id="fems81655_sum_gridactivepower"}, 0)', 'Bezug')
    )
    // Einspeisung (negiert, nur wenn negativ)
    .withTarget(
      haQuery('-clamp_max({__name__="W_value", entity_id="fems81655_sum_gridactivepower"}, 0)', 'Einspeisung')
    )
    // KEBA Wallbox
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_evcs0_chargepower"}', 'Wallbox')
    )
    // Overrides für Farben
    .withOverride({
      matcher: { id: 'byName', options: 'Erzeugung' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.pv } },
      ],
    })
    .withOverride({
      matcher: { id: 'byName', options: 'Verbrauch' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.consumption } },
      ],
    })
    .withOverride({
      matcher: { id: 'byName', options: 'Speicher' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.battery } },
      ],
    })
    .withOverride({
      matcher: { id: 'byName', options: 'Bezug' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.gridBuy } },
      ],
    })
    .withOverride({
      matcher: { id: 'byName', options: 'Einspeisung' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.gridSell } },
      ],
    })
    .withOverride({
      matcher: { id: 'byName', options: 'Wallbox' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.evcs } },
      ],
    });
}

// ============================================================================
// Row 4: Battery SoC Timeline (y=22, h=6)
// ============================================================================

function socTimeline(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Batterie-Ladestand')
    .description('State of Charge (SoC) des Hausspeichers im Zeitverlauf, Farbe nach Ladestand')
    .datasource(DATASOURCE)
    .height(6).span(24)
    .min(0).max(100)
    .unit('percent')
    .lineWidth(3)
    .fillOpacity(20)
    .drawStyle(common.GraphDrawStyle.Line)
    .lineInterpolation(common.LineInterpolation.StepAfter)
    .gradientMode(common.GraphGradientMode.Scheme)
    .spanNulls(true)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(SOC_THRESHOLDS)
    )
    .legend(
      new common.VizLegendOptionsBuilder().showLegend(false)
    )
    .withTarget(
      haQuery('{__name__="%_value", entity_id="fems81655_sum_esssoc"}', 'SoC')
    )
    .withOverride({
      matcher: { id: 'byName', options: 'SoC' },
      properties: [
        { id: 'color', value: { mode: 'thresholds' } },
      ],
    });
}

// ============================================================================
// Row 5: Daily Energy Stats (y=28, h=5)
// ============================================================================

function todayProductionStat(): StatBuilder {
  return new StatBuilder()
    .title('Erzeugung Σ')
    .description('PV-Ertrag im gewählten Zeitraum. Sparkline zeigt Leistungsprofil (kWh pro Intervall)')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('kwatth')
    .decimals(1)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['sum']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: '#7f8c8d' },
          { value: 1, color: COLORS.pv },
        ])
    )
    .withTarget(
      haQuery('increase({__name__="Wh_value", entity_id="fems81655_sum_productionactiveenergy"}[$__interval]) / 1000', 'kWh')
    )
    .dataLinks([detailLink('Erzeugung (PV)', 'W_value', 'fems81655_sum_productionactivepower')]);
}

function todayConsumptionStat(): StatBuilder {
  return new StatBuilder()
    .title('Verbrauch Σ')
    .description('Gesamtverbrauch im gewählten Zeitraum (Erzeugung + Bezug − Einspeisung). Sparkline zeigt Verbrauchsprofil')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('kwatth')
    .decimals(1)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['sum']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.consumption },
        ])
    )
    .withTarget(
      // scalar() nötig: unterschiedliche entity_id Labels verhindern PromQL-Arithmetik
      haQuery(`
        (scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_productionactiveenergy"}[$__interval]))
         + scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridbuyactiveenergy"}[$__interval]))
         - scalar(increase({__name__="Wh_value", entity_id="fems81655_sum_gridsellactiveenergy"}[$__interval]))
        ) / 1000
      `, 'kWh')
    )
    .dataLinks([detailLink('Verbrauch', 'W_value', 'fems81655_sum_consumptionactivepower')]);
}

function todayGridBuyStat(): StatBuilder {
  return new StatBuilder()
    .title('Bezug Σ')
    .description('Netzbezug im gewählten Zeitraum. Sparkline zeigt Bezugsprofil')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('kwatth')
    .decimals(1)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['sum']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.gridBuy },
        ])
    )
    .withTarget(
      haQuery('increase({__name__="Wh_value", entity_id="fems81655_sum_gridbuyactiveenergy"}[$__interval]) / 1000', 'kWh')
    )
    .dataLinks([detailLink('Netz (Bezug)', 'W_value', 'fems81655_sum_gridactivepower')]);
}

function todayGridSellStat(): StatBuilder {
  return new StatBuilder()
    .title('Einspeisung Σ')
    .description('Netzeinspeisung im gewählten Zeitraum. Sparkline zeigt Einspeiseprofil')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('kwatth')
    .decimals(1)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['sum']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.gridSell },
        ])
    )
    .withTarget(
      haQuery('increase({__name__="Wh_value", entity_id="fems81655_sum_gridsellactiveenergy"}[$__interval]) / 1000', 'kWh')
    )
    .dataLinks([detailLink('Netz (Einspeisung)', 'W_value', 'fems81655_sum_gridactivepower')]);
}

// ============================================================================
// Row 6: Battery & MPPT Details (y=33, h=5)
// ============================================================================

function batteryChargeEnergyStat(): StatBuilder {
  return new StatBuilder()
    .title('Batterie geladen Σ')
    .description('Ladeenergie des Speichers im gewählten Zeitraum (DC-seitig). Sparkline zeigt Ladeprofil')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('kwatth')
    .decimals(1)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['sum']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.battery },
        ])
    )
    .withTarget(
      haQuery('increase({__name__="Wh_value", entity_id="fems81655_sum_essdcchargeenergy"}[$__interval]) / 1000', 'kWh')
    )
    .dataLinks([detailLink('Speicher', 'W_value', 'fems81655_sum_essactivepower')]);
}

function batteryDischargeEnergyStat(): StatBuilder {
  return new StatBuilder()
    .title('Batterie entladen Σ')
    .description('Entladeenergie des Speichers im gewählten Zeitraum (DC-seitig). Sparkline zeigt Entladeprofil')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('kwatth')
    .decimals(1)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['sum']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.discharge },
        ])
    )
    .withTarget(
      haQuery('increase({__name__="Wh_value", entity_id="fems81655_sum_essdcdischargeenergy"}[$__interval]) / 1000', 'kWh')
    )
    .dataLinks([detailLink('Speicher', 'W_value', 'fems81655_sum_essactivepower')]);
}

function mppt1Stat(): StatBuilder {
  return new StatBuilder()
    .title('MPPT 1')
    .description('String 1 aktuelle Leistung')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: '#7f8c8d' },
          { value: 50, color: COLORS.pv },
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_charger0_actualpower"}', 'MPPT 1')
    )
    .dataLinks([detailLink('MPPT 1', 'W_value', 'fems81655_charger0_actualpower')]);
}

function mppt2Stat(): StatBuilder {
  return new StatBuilder()
    .title('MPPT 2')
    .description('String 2 aktuelle Leistung')
    .datasource(DATASOURCE)
    .height(5).span(6)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: '#7f8c8d' },
          { value: 50, color: COLORS.pvLight },
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_charger1_actualpower"}', 'MPPT 2')
    )
    .dataLinks([detailLink('MPPT 2', 'W_value', 'fems81655_charger1_actualpower')]);
}

// ============================================================================
// Row 7: KEBA Wallbox (y=38, h=5)
// ============================================================================

function kebaChargepower(): StatBuilder {
  return new StatBuilder()
    .title('Wallbox Ladeleistung')
    .description('Aktuelle Ladeleistung der KEBA P40 Wallbox')
    .datasource(DATASOURCE)
    .height(5).span(12)
    .unit('watt')
    .decimals(0)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: '#7f8c8d' },
          { value: 100, color: COLORS.evcs },
        ])
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_evcs0_chargepower"}', 'KEBA')
    )
    .dataLinks([detailLink('Wallbox Ladeleistung', 'W_value', 'fems81655_evcs0_chargepower')]);
}

function kebaSessionEnergy(): StatBuilder {
  return new StatBuilder()
    .title('Session Energie')
    .description('Aktuelle Ladesession')
    .datasource(DATASOURCE)
    .height(5).span(12)
    .unit('kwatth')
    .decimals(2)
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(new common.ReduceDataOptionsBuilder().calcs(['lastNotNull']))
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: COLORS.evcs },
        ])
    )
    .withTarget(
      haQuery('{__name__="Wh_value", entity_id="fems81655_evcs0_energysession"} / 1000', 'kWh')
    )
    .dataLinks([detailLink('Wallbox Ladeleistung', 'W_value', 'fems81655_evcs0_chargepower')]);
}

function kebaChargingTimeline(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Ladeverlauf')
    .description('Ladeleistung der KEBA P40 im Zeitverlauf')
    .datasource(DATASOURCE)
    .height(6).span(24)
    .min(0)
    .unit('watt')
    .lineWidth(2)
    .fillOpacity(40)
    .drawStyle(common.GraphDrawStyle.Line)
    .lineInterpolation(common.LineInterpolation.StepAfter)
    .spanNulls(false)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.Table)
        .placement(common.LegendPlacement.Bottom)
        .calcs(['lastNotNull', 'max', 'mean'])
    )
    .tooltip(
      new common.VizTooltipOptionsBuilder()
        .mode(common.TooltipDisplayMode.Multi)
        .sort(common.SortOrder.Descending)
    )
    .withTarget(
      haQuery('{__name__="W_value", entity_id="fems81655_evcs0_chargepower"}', 'Ladeleistung')
    )
    .withOverride({
      matcher: { id: 'byName', options: 'Ladeleistung' },
      properties: [
        { id: 'color', value: { mode: 'fixed', fixedColor: COLORS.evcs } },
      ],
    });
}


// ============================================================================
// Row 8: Config Timeline (y=43, h=8)
// ============================================================================

function configTimeline(): StateTimelineBuilder {
  return new StateTimelineBuilder()
    .title('Konfigurationsänderungen')
    .description('Zeitliche Darstellung von Steuerungswert-Änderungen')
    .datasource(DATASOURCE)
    .height(8).span(24)
    .mergeValues(true)
    .rowHeight(0.8)
    .showValue(common.VisibilityMode.Auto)
    .legend(
      new common.VizLegendOptionsBuilder()
        .showLegend(true)
        .displayMode(common.LegendDisplayMode.List)
        .placement(common.LegendPlacement.Bottom)
    )
    .tooltip(
      new common.VizTooltipOptionsBuilder()
        .mode(common.TooltipDisplayMode.Single)
    )
    // Wallbox
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlevcs0_chargemode"}', 'Lademodus'))
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlevcs0_priority"}', 'Priorität'))
    .withTarget(haQuery('{__name__="state_state", entity_id="fems81655_ctrlevcs0_enabledcharging"}', 'Laden aktiv'))
    // Batterie
    .withTarget(haQuery('{__name__="state_state", entity_id="fems81655_ctrlemergencycapacityreserve0_isreservesocenabled"}', 'Notreserve aktiv'))
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlemergencycapacityreserve0_reservesoc"}', 'Notreserve SoC'))
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlgridoptimizedcharge0_mode"}', 'Netzopt. Laden'))
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlgridoptimizedcharge0_delaychargerisklevel"}', 'Risiko Verzög.'))
    // Heizstab
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlioheatingelement0_mode"}', 'Heizstab Modus'))
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlioheatingelement0_workmode"}', 'Heizstab Betrieb'))
    .withTarget(haQuery('{__name__="state_value", entity_id="fems81655_ctrlioheatingelement0_defaultlevel"}', 'Heizstab Stufe'))
    // Allgemein
    .withTarget(haQuery('{__name__="state_state", entity_id="fems81655_meta_isesschargefromgridallowed"}', 'Netzladung erlaubt'));
}

// ============================================================================
// Dashboard Assembly
// ============================================================================

const dashboard = new DashboardBuilder('FENECON Energiemonitor')
  .uid('fems-energy-whs11')
  .tags(['fenecon', 'energy', 'solar', 'battery', 'whs-11'])
  .description('FENECON FEMS Energiemanagement - WHS-11 Erlangen')
  .editable()
  .timezone('browser')
  .refresh('30s')
  .time({ from: 'now/d', to: 'now/d' })
  .withVariable(datasourceVariable())

  // Row 1: Status Gauges
  .withRow(new RowBuilder('Status'))
  .withPanel(batterieSocGauge())
  .withPanel(autarkieGauge())
  .withPanel(eigenverbrauchGauge())

  // Row 2: Live Power
  .withRow(new RowBuilder('Aktuelle Leistung'))
  .withPanel(pvPowerStat())
  .withPanel(consumptionPowerStat())
  .withPanel(gridPowerStat())
  .withPanel(batteryPowerStat())

  // Row 3: Main Chart
  .withRow(new RowBuilder('Energiemonitor'))
  .withPanel(energyMonitorChart())

  // Row 4: SoC Timeline
  .withRow(new RowBuilder('Batterie'))
  .withPanel(socTimeline())

  // Row 5: Daily Energy
  .withRow(new RowBuilder('Energie Σ'))
  .withPanel(todayProductionStat())
  .withPanel(todayConsumptionStat())
  .withPanel(todayGridBuyStat())
  .withPanel(todayGridSellStat())

  // Row 6: Battery & MPPT
  .withRow(new RowBuilder('Speicher & PV-Strings'))
  .withPanel(batteryChargeEnergyStat())
  .withPanel(batteryDischargeEnergyStat())
  .withPanel(mppt1Stat())
  .withPanel(mppt2Stat())

  // Row 7: Wallbox
  .withRow(new RowBuilder('KEBA Wallbox'))
  .withPanel(kebaChargepower())
  .withPanel(kebaSessionEnergy())
  .withPanel(kebaChargingTimeline())

  // Row 8: Config Timeline
  .withRow(new RowBuilder('Konfiguration'))
  .withPanel(configTimeline());

console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
