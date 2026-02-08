/**
 * VW ID.7 Tourer Pro - Combined Dashboard
 *
 * Datenquelle: Home Assistant → VictoriaMetrics (InfluxDB-Protokoll)
 * Metriken: HA entity_id Sensoren via Volkswagen Connect Integration
 *
 * Generate: npx ts-node src/vw-id7.ts > dist/vw-id7.json
 * Deploy:   see README.md
 */

import {
  DashboardBuilder,
  ThresholdsConfigBuilder,
  ThresholdsMode,
} from '@grafana/grafana-foundation-sdk/dashboard';
import * as common from '@grafana/grafana-foundation-sdk/common';
import * as prometheus from '@grafana/grafana-foundation-sdk/prometheus';
import { PanelBuilder as GaugeBuilder } from '@grafana/grafana-foundation-sdk/gauge';
import { PanelBuilder as StatBuilder } from '@grafana/grafana-foundation-sdk/stat';
import { PanelBuilder as TimeseriesBuilder } from '@grafana/grafana-foundation-sdk/timeseries';
import { PanelBuilder as GeomapBuilder, MapViewConfigBuilder } from '@grafana/grafana-foundation-sdk/geomap';

import { DATASOURCE, datasourceVariable, haQuery, vwDetailLink, vwDetailLink2, BATTERY_THRESHOLDS, RANGE_THRESHOLDS } from './shared';

// --- Row 1: Status Overview (y=0, h=8) ---

function batteristandGauge(): GaugeBuilder {
  return new GaugeBuilder()
    .title('Batteriestand')
    .description('Aktueller Ladestand der HV-Batterie (77 kWh netto)')
    .datasource(DATASOURCE)
    .height(8).span(6)
    .min(0).max(100)
    .unit('percent')
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(BATTERY_THRESHOLDS)
    )
    .withTarget(
      haQuery('last_over_time({__name__="%_value", entity_id="vw_id_7_tourer_pro_battery_level"}[4h])')
    )
    .dataLinks([vwDetailLink('Batteriestand', '%_value', 'vw_id_7_tourer_pro_battery_level')]);
}

function reichweiteStat(): StatBuilder {
  return new StatBuilder()
    .title('Reichweite')
    .description('Geschätzte elektrische Restreichweite laut Fahrzeug')
    .datasource(DATASOURCE)
    .height(8).span(6)
    .unit('lengthkm')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(RANGE_THRESHOLDS)
    )
    .withTarget(
      haQuery('last_over_time({__name__="km_value", entity_id="vw_id_7_tourer_pro_electric_range"}[4h])')
    )
    .dataLinks([vwDetailLink('Reichweite', 'km_value', 'vw_id_7_tourer_pro_electric_range')]);
}

function kilometerstandStat(): StatBuilder {
  return new StatBuilder()
    .title('Kilometerstand')
    .description('Gesamtkilometer laut Tacho (Odometer)')
    .datasource(DATASOURCE)
    .height(8).span(6)
    .decimals(0)
    .unit('suffix: km')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .reduceOptions(
      new common.ReduceDataOptionsBuilder().calcs(['lastNotNull'])
    )
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([{ value: null as unknown as number, color: 'blue' }])
    )
    .withTarget(
      haQuery('last_over_time({__name__="km_value", entity_id="vw_id_7_tourer_pro_odometer"}[4h])')
    )
    .dataLinks([vwDetailLink('Kilometerstand', 'km_value', 'vw_id_7_tourer_pro_odometer')]);
}

function serviceInStat(): StatBuilder {
  return new StatBuilder()
    .title('Service in')
    .description('Tage bis zur nächsten Inspektion laut Serviceplan')
    .datasource(DATASOURCE)
    .height(8).span(6)
    .decimals(0)
    .unit('suffix: Tage')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: 'red' },
          { value: 30, color: 'orange' },
          { value: 60, color: 'yellow' },
          { value: 90, color: 'green' },
        ])
    )
    .withTarget(
      haQuery('last_over_time({__name__="d_value", entity_id="vw_id_7_tourer_pro_service_inspection_days"}[4h])')
    )
    .dataLinks([vwDetailLink('Service in', 'd_value', 'vw_id_7_tourer_pro_service_inspection_days')]);
}

// --- Row 2: History Charts (y=8, h=10) ---

function batteristandVerlauf(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Batteriestand (Verlauf)')
    .description('HV-Batterie Ladestand über Zeit. Datenlücken = Auto im Schlafmodus')
    .datasource(DATASOURCE)
    .height(10).span(12)
    .min(0).max(100)
    .unit('percent')
    .lineWidth(2)
    .fillOpacity(20)
    .spanNulls(true)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(BATTERY_THRESHOLDS)
    )
    .legend(
      new common.VizLegendOptionsBuilder().showLegend(false)
    )
    .withTarget(
      haQuery('{__name__="%_value", entity_id="vw_id_7_tourer_pro_battery_level"}', 'Batterie %')
    );
}

function reichweiteVerlauf(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Reichweite (Verlauf)')
    .description('Elektrische Restreichweite über Zeit. Abhängig von Fahrverhalten, Temperatur, Klima')
    .datasource(DATASOURCE)
    .height(10).span(12)
    .min(0)
    .unit('lengthkm')
    .lineWidth(2)
    .fillOpacity(20)
    .spanNulls(true)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps(RANGE_THRESHOLDS)
    )
    .legend(
      new common.VizLegendOptionsBuilder().showLegend(false)
    )
    .withTarget(
      haQuery('{__name__="km_value", entity_id="vw_id_7_tourer_pro_electric_range"}', 'Reichweite km')
    );
}

// --- Row 3: Kilometerstand + Ladeleistung (y=18, h=8) ---

function kilometerstandVerlauf(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Kilometerstand (Verlauf)')
    .description('Gesamtkilometer über Zeit. Steigende Flanken = Fahrten')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .decimals(0)
    .unit('suffix: km')
    .lineWidth(2)
    .fillOpacity(10)
    .spanNulls(true)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([{ value: null as unknown as number, color: 'blue' }])
    )
    .legend(
      new common.VizLegendOptionsBuilder().showLegend(false)
    )
    .withTarget(
      haQuery('{__name__="km_value", entity_id="vw_id_7_tourer_pro_odometer"}', 'km')
    );
}

function ladeleistungVerlauf(): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Ladeleistung (Verlauf)')
    .description('Ladeleistung über Zeit. AC ≈ 11 kW, DC bis 175 kW. Balken = Ladeevent')
    .datasource(DATASOURCE)
    .height(8).span(12)
    .min(0)
    .unit('kwatt')
    .lineWidth(2)
    .fillOpacity(30)
    .drawStyle(common.GraphDrawStyle.Bars)
    .spanNulls(false)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: 'text' },
          { value: 1, color: 'green' },
          { value: 50, color: 'yellow' },
          { value: 100, color: 'orange' },
        ])
    )
    .legend(
      new common.VizLegendOptionsBuilder().showLegend(false)
    )
    .withTarget(
      haQuery('{__name__="kW_value", entity_id="vw_id_7_tourer_pro_charging_power"}', 'kW')
    );
}

// --- Row 4: Charging & Battery Details (y=26, h=6) ---

function ladeleistungStat(): StatBuilder {
  return new StatBuilder()
    .title('Ladeleistung')
    .description('Aktuelle Ladeleistung laut VW API. 0 kW = nicht am Ladekabel')
    .datasource(DATASOURCE)
    .height(6).span(6)
    .unit('kwatt')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: 'text' },
          { value: 1, color: 'green' },
        ])
    )
    .withTarget(
      haQuery('last_over_time({__name__="kW_value", entity_id="vw_id_7_tourer_pro_charging_power"}[4h])')
    )
    .dataLinks([vwDetailLink('Ladeleistung', 'kW_value', 'vw_id_7_tourer_pro_charging_power')]);
}

function restladezeitStat(): StatBuilder {
  return new StatBuilder()
    .title('Restladezeit')
    .description('Geschätzte Restdauer bis zum Ziel-Ladestand')
    .datasource(DATASOURCE)
    .height(6).span(6)
    .unit('m')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([{ value: null as unknown as number, color: 'text' }])
    )
    .withTarget(
      haQuery('last_over_time({__name__="min_value", entity_id="vw_id_7_tourer_pro_charging_time_left"}[4h])')
    )
    .dataLinks([vwDetailLink('Restladezeit', 'min_value', 'vw_id_7_tourer_pro_charging_time_left')]);
}

function batterieTemperaturStat(): StatBuilder {
  return new StatBuilder()
    .title('Batterie-Temperatur')
    .description('Mittelwert aus Min/Max HV-Batterie-Temperatur. Detail: Min, Max, Außentemp, Lade-/Entladeleistung')
    .datasource(DATASOURCE)
    .height(6).span(6)
    .unit('celsius')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.Area)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([
          { value: null as unknown as number, color: 'blue' },
          { value: 15, color: 'green' },
          { value: 35, color: 'orange' },
          { value: 45, color: 'red' },
        ])
    )
    .withTarget(
      haQuery('(scalar(last_over_time({__name__="°C_value", entity_id="vw_id_7_tourer_pro_hv_battery_max_temperature"}[4h])) + scalar(last_over_time({__name__="°C_value", entity_id="vw_id_7_tourer_pro_hv_battery_min_temperature"}[4h]))) / 2', 'Ø')
    )
    .dataLinks([vwDetailLink2(
      'Max', '°C_value',
      'vw_id_7_tourer_pro_hv_battery_max_temperature',
      'vw_id_7_tourer_pro_hv_battery_min_temperature', 'Min',
      { entityId: 'vw_id_7_tourer_pro_outdoor_temperature', metric: '°C_value', legend: 'Außentemperatur' },
      { expr: 'deriv({__name__="%_value", entity_id="vw_id_7_tourer_pro_battery_level"}[15m]) * 2772', legend: 'Leistung abgeleitet (kW)' },
      { expr: '{__name__="kW_value", entity_id="vw_id_7_tourer_pro_charging_power"}', legend: 'Ladeleistung (kW)' },
    )]);
}

function zielLadestandStat(): StatBuilder {
  return new StatBuilder()
    .title('Ziel-Ladestand')
    .description('Eingestellter Ziel-Ladestand (Target SoC) für AC-Laden')
    .datasource(DATASOURCE)
    .height(6).span(6)
    .unit('percent')
    .colorMode(common.BigValueColorMode.Value)
    .graphMode(common.BigValueGraphMode.None)
    .thresholds(
      new ThresholdsConfigBuilder()
        .mode(ThresholdsMode.Absolute)
        .steps([{ value: null as unknown as number, color: 'green' }])
    )
    .withTarget(
      haQuery('last_over_time({__name__="%_value", entity_id="vw_id_7_tourer_pro_battery_target_charge_level"}[4h])')
    )
    .dataLinks([vwDetailLink('Ziel-Ladestand', '%_value', 'vw_id_7_tourer_pro_battery_target_charge_level')]);
}

// --- Row 5: Geomap (y=32, h=12) ---

function fahrzeugPosition(): GeomapBuilder {
  return new GeomapBuilder()
    .title('Parkposition')
    .description('Letzte bekannte GPS-Position des Fahrzeugs (VW API)')
    .datasource(DATASOURCE)
    .height(12).span(24)
    .basemap(
      new common.MapLayerOptionsBuilder()
        .type('osm-standard')
        .name('OpenStreetMap')
    )
    .layers([
      new common.MapLayerOptionsBuilder()
        .type('markers')
        .name('Positionen')
        .location(
          new common.FrameGeometrySourceBuilder()
            .mode(common.FrameGeometrySourceMode.Coords)
            .latitude('latitude')
            .longitude('longitude')
        )
        .config({
          showLegend: false,
          style: {
            color: { fixed: 'blue' },
            opacity: 0.6,
            size: { fixed: 5 },
          },
        }),
    ])
    .view(
      new MapViewConfigBuilder()
        .id('fit')
        .lat(49.45)
        .lon(11.04)
        .zoom(10)
        .allLayers(true)
    )
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr('{__name__="°_value", entity_id="vw_id_7_tourer_pro_latitude"}')
        .format(prometheus.PromQueryFormat.Table)
        .legendFormat('latitude')
        .refId('A')
    )
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr('{__name__="°_value", entity_id="vw_id_7_tourer_pro_longitude"}')
        .format(prometheus.PromQueryFormat.Table)
        .legendFormat('longitude')
        .refId('B')
    )
    .withTransformation({
      id: 'joinByField',
      options: { byField: 'Time', mode: 'outer' },
    })
    .withTransformation({
      id: 'organize',
      options: {
        renameByName: {
          'Value #A': 'latitude',
          'Value #B': 'longitude',
        },
      },
    });
}

// --- Dashboard ---

const dashboard = new DashboardBuilder('VW ID.7 Tourer Pro')
  .uid('4f115fd3-1e1b-40b2-97d5-8ce33b9be093')
  .tags(['vw', 'ev', 'car'])
  .editable()
  .timezone('browser')
  .refresh('5m')
  .time({ from: 'now-24h', to: 'now' })
  .withVariable(datasourceVariable())
  // Row 1: Status Overview
  .withPanel(batteristandGauge())
  .withPanel(reichweiteStat())
  .withPanel(kilometerstandStat())
  .withPanel(serviceInStat())
  // Row 2: History Charts
  .withPanel(batteristandVerlauf())
  .withPanel(reichweiteVerlauf())
  // Row 3: Kilometerstand + Ladeleistung
  .withPanel(kilometerstandVerlauf())
  .withPanel(ladeleistungVerlauf())
  // Row 4: Charging & Battery Details
  .withPanel(ladeleistungStat())
  .withPanel(restladezeitStat())
  .withPanel(batterieTemperaturStat())
  .withPanel(zielLadestandStat())
  // Row 5: Map
  .withPanel(fahrzeugPosition());

console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
