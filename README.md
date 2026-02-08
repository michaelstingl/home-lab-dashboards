# Home Lab Dashboards

Grafana dashboards as TypeScript code using the [Grafana Foundation SDK](https://github.com/grafana/grafana-foundation-sdk).

## Dashboards

| Dashboard | File | Description |
|-----------|------|-------------|
| **VW ID.7 Tourer Pro** | `src/vw-id7.ts` | EV dashboard: Gauge, Stats, Timeseries, Geomap (13 panels) |

## Requirements

- **Grafana** with a Prometheus-compatible datasource (Prometheus, VictoriaMetrics, etc.)
- [**Bun**](https://bun.sh) (recommended) or **Node.js** 18+

## Setup

```bash
bun install
```

## Usage

```bash
# Type-check
bun run typecheck

# Generate dashboard JSON
bun run build                # all dashboards
bun run build:vw             # VW ID.7 only

# Deploy to Grafana
curl -s -u "admin:$GRAFANA_PW" \
  -X POST -H "Content-Type: application/json" \
  -d @dist/vw-id7.json \
  https://your-grafana-instance/api/dashboards/db
```

## Datasource

Dashboards use a **template variable** (`$datasource`) instead of a hardcoded datasource UID. On first load, Grafana automatically selects the first available Prometheus-compatible datasource. If you have multiple, pick the right one from the dropdown at the top of the dashboard.

## Project structure

```
home-lab-dashboards/
├── src/
│   ├── shared.ts              # Datasource variable, query helpers, common thresholds
│   └── vw-id7.ts              # 13 panels: Gauge, Stat, Timeseries, Geomap
├── dist/                      # Generated JSON (gitignored)
├── tsconfig.json
└── package.json
```

## Grafana Foundation SDK notes

### tsconfig.json

`moduleResolution` must be `"nodenext"` — the SDK uses package.json `exports` which don't resolve with `"node"`.

### Import pattern

Each panel plugin has its own subpath import. The panel builder is always named `PanelBuilder`, so you need aliases:

```typescript
import { DashboardBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { PanelBuilder as StatBuilder } from '@grafana/grafana-foundation-sdk/stat';
import { PanelBuilder as TimeseriesBuilder } from '@grafana/grafana-foundation-sdk/timeseries';
import { PanelBuilder as GaugeBuilder } from '@grafana/grafana-foundation-sdk/gauge';
import { PanelBuilder as GeomapBuilder } from '@grafana/grafana-foundation-sdk/geomap';
```

### Datasource variable

Use a `DatasourceVariableBuilder` instead of hardcoding UIDs — keeps dashboards portable:

```typescript
import { DatasourceVariableBuilder } from '@grafana/grafana-foundation-sdk/dashboard';

const DATASOURCE_VAR = 'datasource';
const DATASOURCE = { type: 'prometheus' as const, uid: `$${DATASOURCE_VAR}` };

// Register on dashboard
new DashboardBuilder('My Dashboard')
  .withVariable(
    new DatasourceVariableBuilder(DATASOURCE_VAR)
      .label('Data source')
      .type('prometheus')
  )
```

Grafana auto-selects the first matching datasource. No manual selection needed when only one exists.

### Panel layout

`height()` and `span()` control the grid. `span` ranges from 1–24 (full width = 24). Panels flow automatically into rows — no manual `gridPos` needed.

### Geomap panels

The `GeomapBuilder` has typed APIs for `basemap()`, `layers()` and `view()`, but the layer `config` (style, color, etc.) is typed as `any`:

```typescript
new common.MapLayerOptionsBuilder()
  .type('markers')
  .location(
    new common.FrameGeometrySourceBuilder()
      .mode(common.FrameGeometrySourceMode.Coords)
      .latitude('latitude')
      .longitude('longitude')
  )
  .config({
    showLegend: false,
    style: { color: { fixed: 'blue' }, opacity: 0.6, size: { fixed: 5 } },
  })
```

### SDK defaults vs. Grafana UI

The SDK sets many fields explicitly that the Grafana UI omits (implicit defaults). These are functionally identical — Grafana fills missing fields with the same defaults. Expect a diff when comparing SDK-generated JSON against UI-exported JSON.

### Output format

`dashboard.build()` returns the dashboard object. Wrap it for the Grafana API:

```typescript
console.log(JSON.stringify({
  dashboard: dashboard.build(),
  overwrite: true,
}, null, 2));
```
