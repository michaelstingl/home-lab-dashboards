/**
 * VW ID - Generic Dashboard Generator
 *
 * Parametrisiert per CarConfig. Generiert Dashboards fuer beliebige VW ID Modelle.
 * Datenquelle: Home Assistant -> VictoriaMetrics (InfluxDB-Protokoll)
 *
 * Usage: bun src/vw-id.ts <id7|id3>
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

// --- Car Configuration ---

export interface CarConfig {
  model: string;           // Dashboard title, e.g. "VW ID.7 Tourer Pro"
  entityPrefix: string;    // HA entity prefix, e.g. "vw_id_7_tourer_pro"
  batteryKwh: number;      // Net battery capacity in kWh
  maxDcKw: number;         // Max DC charging power in kW
  dashboardUid: string;    // Unique Grafana dashboard UID
  mapCenter: { lat: number; lon: number };
}

export const CARS: Record<string, CarConfig> = {
  id7: {
    model: 'VW ID.7 Tourer Pro',
    entityPrefix: 'vw_id_7_tourer_pro',
    batteryKwh: 77,
    maxDcKw: 175,
    dashboardUid: 'vw-id7',
    mapCenter: { lat: 49.45, lon: 11.08 },
  },
  id3: {
    model: 'VW ID.3 Pro',
    entityPrefix: 'vw_id_3_pro',
    batteryKwh: 58,
    maxDcKw: 120,
    dashboardUid: 'vw-id3',
    mapCenter: { lat: 49.60, lon: 11.00 },
  },
};

// --- Panel Builders ---

function batteristandGauge(c: CarConfig): GaugeBuilder {
  return new GaugeBuilder()
    .title('Batteriestand')
    .description(`Aktueller Ladestand der HV-Batterie (${c.batteryKwh} kWh netto)`)
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
      haQuery(`last_over_time({__name__="%_value", entity_id="${c.entityPrefix}_battery_level"}[4h])`)
    )
    .dataLinks([vwDetailLink('Batteriestand', '%_value', `${c.entityPrefix}_battery_level`)]);
}

function reichweiteStat(c: CarConfig): StatBuilder {
  return new StatBuilder()
    .title('Reichweite')
    .description('Geschaetzte elektrische Restreichweite laut Fahrzeug')
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
      haQuery(`last_over_time({__name__="km_value", entity_id="${c.entityPrefix}_electric_range"}[4h])`)
    )
    .dataLinks([vwDetailLink('Reichweite', 'km_value', `${c.entityPrefix}_electric_range`)]);
}

function kilometerstandStat(c: CarConfig): StatBuilder {
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
      haQuery(`last_over_time({__name__="km_value", entity_id="${c.entityPrefix}_odometer"}[4h])`)
    )
    .dataLinks([vwDetailLink('Kilometerstand', 'km_value', `${c.entityPrefix}_odometer`)]);
}

function serviceInStat(c: CarConfig): StatBuilder {
  return new StatBuilder()
    .title('Service in')
    .description('Tage bis zur naechsten Inspektion laut Serviceplan')
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
      haQuery(`last_over_time({__name__="d_value", entity_id="${c.entityPrefix}_service_inspection_days"}[4h])`)
    )
    .dataLinks([vwDetailLink('Service in', 'd_value', `${c.entityPrefix}_service_inspection_days`)]);
}

// --- Row 2: History Charts ---

function batteristandVerlauf(c: CarConfig): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Batteriestand (Verlauf)')
    .description('HV-Batterie Ladestand ueber Zeit. Datenluecken = Auto im Schlafmodus')
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
      haQuery(`{__name__="%_value", entity_id="${c.entityPrefix}_battery_level"}`, 'Batterie %')
    );
}

function reichweiteVerlauf(c: CarConfig): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Reichweite (Verlauf)')
    .description('Elektrische Restreichweite ueber Zeit. Abhaengig von Fahrverhalten, Temperatur, Klima')
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
      haQuery(`{__name__="km_value", entity_id="${c.entityPrefix}_electric_range"}`, 'Reichweite km')
    );
}

// --- Row 3: Kilometerstand + Ladeleistung ---

function kilometerstandVerlauf(c: CarConfig): TimeseriesBuilder {
  return new TimeseriesBuilder()
    .title('Kilometerstand (Verlauf)')
    .description('Gesamtkilometer ueber Zeit. Steigende Flanken = Fahrten')
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
      haQuery(`{__name__="km_value", entity_id="${c.entityPrefix}_odometer"}`, 'km')
    );
}

function ladeleistungVerlauf(c: CarConfig): TimeseriesBuilder {
  const dcThreshold = Math.round(c.maxDcKw * 0.6);
  return new TimeseriesBuilder()
    .title('Ladeleistung (Verlauf)')
    .description(`Ladeleistung ueber Zeit. AC ca. 11 kW, DC bis ${c.maxDcKw} kW. Balken = Ladeevent`)
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
          { value: dcThreshold, color: 'yellow' },
          { value: c.maxDcKw, color: 'orange' },
        ])
    )
    .legend(
      new common.VizLegendOptionsBuilder().showLegend(false)
    )
    .withTarget(
      haQuery(`{__name__="kW_value", entity_id="${c.entityPrefix}_charging_power"}`, 'kW')
    );
}

// --- Row 4: Charging & Battery Details ---

function ladeleistungStat(c: CarConfig): StatBuilder {
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
      haQuery(`last_over_time({__name__="kW_value", entity_id="${c.entityPrefix}_charging_power"}[4h])`)
    )
    .dataLinks([vwDetailLink('Ladeleistung', 'kW_value', `${c.entityPrefix}_charging_power`)]);
}

function restladezeitStat(c: CarConfig): StatBuilder {
  return new StatBuilder()
    .title('Restladezeit')
    .description('Geschaetzte Restdauer bis zum Ziel-Ladestand')
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
      haQuery(`last_over_time({__name__="min_value", entity_id="${c.entityPrefix}_charging_time_left"}[4h])`)
    )
    .dataLinks([vwDetailLink('Restladezeit', 'min_value', `${c.entityPrefix}_charging_time_left`)]);
}

function batterieTemperaturStat(c: CarConfig): StatBuilder {
  const derivFactor = c.batteryKwh * 36;
  return new StatBuilder()
    .title('Batterie-Temperatur')
    .description('Mittelwert aus Min/Max HV-Batterie-Temperatur. Detail: Min, Max, Aussentemp, Lade-/Entladeleistung')
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
      haQuery(`(scalar(last_over_time({__name__="°C_value", entity_id="${c.entityPrefix}_hv_battery_max_temperature"}[4h])) + scalar(last_over_time({__name__="°C_value", entity_id="${c.entityPrefix}_hv_battery_min_temperature"}[4h]))) / 2`, 'Ø')
    )
    .dataLinks([vwDetailLink2(
      'Max', '°C_value',
      `${c.entityPrefix}_hv_battery_max_temperature`,
      `${c.entityPrefix}_hv_battery_min_temperature`, 'Min',
      { entityId: `${c.entityPrefix}_outdoor_temperature`, metric: '°C_value', legend: 'Aussentemperatur' },
      { expr: `deriv({__name__="%_value", entity_id="${c.entityPrefix}_battery_level"}[15m]) * ${derivFactor}`, legend: 'Leistung abgeleitet (kW)' },
      { expr: `{__name__="kW_value", entity_id="${c.entityPrefix}_charging_power"}`, legend: 'Ladeleistung (kW)' },
    )]);
}

function zielLadestandStat(c: CarConfig): StatBuilder {
  return new StatBuilder()
    .title('Ziel-Ladestand')
    .description('Eingestellter Ziel-Ladestand (Target SoC) fuer AC-Laden')
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
      haQuery(`last_over_time({__name__="%_value", entity_id="${c.entityPrefix}_battery_target_charge_level"}[4h])`)
    )
    .dataLinks([vwDetailLink('Ziel-Ladestand', '%_value', `${c.entityPrefix}_battery_target_charge_level`)]);
}

// --- Row 5: Geomap ---

function fahrzeugPosition(c: CarConfig): GeomapBuilder {
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
        .lat(c.mapCenter.lat)
        .lon(c.mapCenter.lon)
        .zoom(10)
        .allLayers(true)
    )
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr(`{__name__="°_value", entity_id="${c.entityPrefix}_latitude"}`)
        .format(prometheus.PromQueryFormat.Table)
        .legendFormat('latitude')
        .refId('A')
    )
    .withTarget(
      new prometheus.DataqueryBuilder()
        .datasource(DATASOURCE)
        .expr(`{__name__="°_value", entity_id="${c.entityPrefix}_longitude"}`)
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

// --- Dashboard Builder ---

export function buildVwDashboard(c: CarConfig): object {
  const dashboard = new DashboardBuilder(c.model)
    .uid(c.dashboardUid)
    .tags(['vw', 'ev', 'car'])
    .editable()
    .timezone('browser')
    .refresh('5m')
    .time({ from: 'now-24h', to: 'now' })
    .withVariable(datasourceVariable())
    // Row 1: Status Overview
    .withPanel(batteristandGauge(c))
    .withPanel(reichweiteStat(c))
    .withPanel(kilometerstandStat(c))
    .withPanel(serviceInStat(c))
    // Row 2: History Charts
    .withPanel(batteristandVerlauf(c))
    .withPanel(reichweiteVerlauf(c))
    // Row 3: Kilometerstand + Ladeleistung
    .withPanel(kilometerstandVerlauf(c))
    .withPanel(ladeleistungVerlauf(c))
    // Row 4: Charging & Battery Details
    .withPanel(ladeleistungStat(c))
    .withPanel(restladezeitStat(c))
    .withPanel(batterieTemperaturStat(c))
    .withPanel(zielLadestandStat(c))
    // Row 5: Map
    .withPanel(fahrzeugPosition(c));

  return {
    dashboard: dashboard.build(),
    overwrite: true,
  };
}

// --- CLI ---

const carKey = process.argv[2];
if (!carKey || !CARS[carKey]) {
  console.error(`Usage: bun src/vw-id.ts <${Object.keys(CARS).join('|')}>`);
  process.exit(1);
}

console.log(JSON.stringify(buildVwDashboard(CARS[carKey]), null, 2));
