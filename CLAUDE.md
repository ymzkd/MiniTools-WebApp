# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **MiniTools**, an integrated web application bundling several math / structural-engineering tools
under a single tab-based interface. Each tool lives in its own directory under `src/components/` and is
mounted simultaneously (visibility toggled by CSS) so per-tab state is preserved across tab switches.

Tools (tab id → path → directory):

1. **Matrix Editor** (`matrix` → `/matrix` → `matrix/`) — visual LaTeX matrix editing with real-time KaTeX preview
2. **Figure Layout** (`figure` → `/figure` → `figure/`) — academic figure arrangement with drag-and-drop + KaTeX captions
3. **PDF Converter** (`pdf` → `/pdf` → `pdf/`) — PDF conversion utilities
4. **Markdown Editor** (`markdown` → `/markdown` → `markdown/`) — markdown editing/preview
5. **Hazard Map** (`hazard` → `/hazard` → `hazard/`) — point lookup of 海率/標高 and design zones (基準風速/積雪/地震/積雪深) on a map (jiban-api `/api/design` backed). The 地表面粗度区分 (平12建告1454号) of the point is derived client-side in `hazard/roughness.ts` from `urban.inside` (都市計画区域の内外, from the API) and the shore distance: only Ⅱ vs Ⅲ is decidable (Ⅰ/Ⅳ are set by the 特定行政庁), and since Ⅱ depends on the building height the panel lists the categories per height band (13m/31m thresholds) rather than a single answer. Legacy `/searatio` and `/boring` paths still resolve here (the standalone Boring Data tab was removed after its functionality was fully merged in; its reusable pieces — `BoringLogViewer`, `ResultsList`, `api.ts`+`parsers/`, `pointsTiles.ts` — remain in `src/components/boring/`). It also shows the **J-SHIS seismic hazard** of the point (`/api/jshis/*` → jiban-api `/jshis/*`): `SeismicHazardPanel.tsx` renders the acceleration response spectrum (local data, instant) and the per-period source contribution (J-SHIS CGI, fetched as a background job — the client polls while the server returns 202 pending; first evaluation of a mesh takes 1–2 min on J-SHIS's side) as inline-SVG charts (`SeismicCharts.tsx`; colors are CSS tokens `--viz-*` in `index.css`, categorical slots assigned by rank and reused as map highlight colors). `jshisApi.ts` holds the fetchers, the slot assignment and `isSeismicOverlay`. `HazardMap.tsx` draws the J-SHIS source faults (PMTiles layers `faults`/`traces`/`groups`): the **full** fault set only under the `faults` overlay, while the other seismic overlays (`seismic`/`amp`/`vs350`) show **only the highlighted top contributors** (all faults everywhere was too noisy). It highlights those top contributors by `fid` (layer-wide sources such as 南海トラフ are filled via the dissolved `groups` layer to avoid overlap saturation). The three **point annotations** — 海率円 (`circle-*`), 海岸線測線 (`shore-*`) and the 震源ハイライト (`faults-hl-*`) — are toggled individually by the second icon group (below the divider) in the map's top-left control column: `MapAnnotations` state lives in `HazardMapApp.tsx`, is persisted in `localStorage['hazard.annotations']` (default: 海率円 only) and is applied by `applyAnnotations()` in `HazardMap.tsx`. The toggles are independent of the exclusive overlay picker above them (the full fault set still follows the `faults` overlay); the search/初期表示 fit (`fitToPoint`) only fits what is visible, falling back to a fixed zoom, and clicking a legend row re-enables the 震源 toggle. **Boring integration**: the boring points tile (`boring/pointsTiles.ts`) is drawn as a heatmap layer plus a source-colored marker layer. The exclusive overlay `boring` shows density heatmap at low zoom (fading out z9-12) with markers at **all** zoom levels; the fourth point-annotation toggle `boringPts` shows the markers from z11 up regardless of the overlay. The marker layers are shared — `applyBoringPts()` (called from both `applyOverlay` and `applyAnnotations`) sets their visibility to (overlay==='boring' || boringPts) and widens their zoom range to 0 while the overlay is active. Markers draw one step smaller; a `boring-hover` layer (fault-hover-style filter swap) enlarges the point under the cursor, and the red picked-point `marker` is enlarged (r8) so it doesn't drown in the dots. Clicking a visible marker takes priority over the whole-map point pick and does NOT move the hazard point (users cycle through nearby surveys); it swaps the left panel to `BoringLogViewer` (+ a compact `ResultsList` of the points within 12px for overlapping markers, above it), and clicking anywhere else / searching clears the selection and restores the hazard panel. The viewer panel embeds a 地点の情報 section (its `siteInfo` prop, built in `HazardMapApp`, rendered under the panel header) fetched for the **boring point's** coordinates (lat/lng, Nominatim address, GSI elevation, J-SHIS amp & Vs400 depth from the value rasters) — explicitly labeled as location-derived, i.e. NOT values recorded in the survey XML (which has its own 孔口標高 etc. in the viewer). The selected boring point is highlighted by a blue `boring-selected` circle drawn from a GeoJSON source at the exact coordinates — NOT filtered from the vector tiles, because tippecanoe thins points at low zoom and a tile-filtered highlight would vanish when zoomed out; this way it stays visible at every zoom and overlay state while its log is open (clicking that marker is a no-op so it can't turn into a point pick). No marker legend is shown (the data source appears in the log viewer); boring is excluded from the PDF report. It also shows the **J-SHIS scenario earthquake** (想定地震・震源断層を特定した地震動予測地図) of a clicked fault: clicking a fault drawn under the `faults` overlay swaps the left panel to `FaultDetailPanel.tsx` (like the boring log does), showing a case picker plus the **unrolled fault-plane diagram** (`FaultPlaneView.tsx`, inline SVG) — element faults (2 km mesh) colored by asperity number, asperity outlines, and the rupture start point (★) — and a 断層情報 table (fault-model dimensions from the CSV geometry, plus 長期評価 probabilities / recurrence interval from `getLteInfo`). Data comes from `/api/jshis/scenario?src=<src>` (jiban-api serves a build-time bundle, `pipelines/jshis/build_scenario_faults.py`; no runtime J-SHIS access). `scenarioApi.ts` holds the fetchers, the asperity colors and the grid helpers. Only **158 of 370 sources** have a scenario (essentially 主要活断層帯 only — 海溝型 and 領域震源 have none), so the tiles carry a `has_scenario` attribute and `HazardMap.tsx` draws those faults with thicker/opaquer lines; clicking a fault **without** a scenario falls through to the normal point pick. The clicked fault is outlined in blue (`sources-sel-*` layers) while its panel is open, and clicking it does NOT move the hazard point (same rule as boring markers). Bent faults have multiple planes; the diagram stacks them vertically at one shared scale (the worst case is 中央構造線 with 11 segments / 456 km). PDF report export lives in `hazard/report/` (layout follows a provided design template — mincho headings, 3 accent-colored load cards, formula box, shoreline schematic). It uses the **browser print path** (no bundled fonts): `print.tsx` renders `HazardReportView` via `react-dom/server` into a hidden iframe and calls `print()`, so the user's local fonts (gothic body / mincho headings via CSS font stacks) are used and nothing is downloaded. Reached only via a dynamic `import()` from the export button (keeps `react-dom/server` out of the initial bundle); the map snapshot is grabbed via a `capturePng()` imperative handle on `HazardMap`.
6. **Section Calc** (`section` → `/section` → `section/`) — section property calculator
7. **Steel Stress** (`steel` → `/steel` → `steel/`) — steel stress calculator

Routing lives in `src/App.tsx`; the tab list / labels in `src/components/common/Navigation.tsx`; the `AppTab`
union in `src/types/index.ts`. Adding a tool means touching those three plus a new `src/components/<tool>/`.

## Architecture

### Core Components
- **Unified App Layout**: Tab-based navigation between tools (`src/components/common/AppLayout.tsx`, `Navigation.tsx`)
- **Map-based tool** (Hazard Map): maplibre-gl + pmtiles, served same-origin via an Express
  proxy to **jiban-api** (`/api/...`); take the full viewport height (see the `lg:-my-8 lg:h-[calc(100vh-4rem)]` wrappers in `App.tsx`)
- **KaTeX Integration**: Mathematical rendering using KaTeX v0.16.22 with MathML output
- **Shared Components**: Common UI elements, navigation, toast notifications, and theme management

### Key Features

#### Matrix Editor Features
- Visual matrix editing with cell-by-cell input and real-time KaTeX rendering
- Multiple matrix types (pmatrix, bmatrix, vmatrix, Vmatrix, smallmatrix)
- Advanced table UI with hover-based row/column insertion/deletion controls
- Multi-cell selection and copy/paste functionality (drag, Ctrl+click, Shift+click)
- Symmetric matrix mode with auto-synchronization
- LaTeX code import/export with parsing validation
- Comprehensive keyboard navigation (Tab, arrows, Ctrl+C/V/A)
- Context menus for row/column operations
- Real-time KaTeX preview with selected cell highlighting

#### Figure Layout Features
- Drag-and-drop image upload and arrangement
- Flexible grid system with automatic row organization
- Mathematical caption support with KaTeX rendering ($...$ and $$...$$ syntax)
- Multiple export formats (PNG, PDF) with resolution control
- Image reordering via drag-and-drop
- Clipboard copy functionality
- Customizable layout spacing and caption styling

#### Theme and UI Features
- **Dark/Light Mode Toggle**: System preference detection with manual override
- **Theme Persistence**: User preference saved in localStorage
- **Smooth Transitions**: Animated theme switching with consistent styling
- **Responsive Design**: Optimized for desktop and mobile devices

### Data Flow
1. User interacts with matrix cells through clicking, typing, or keyboard navigation
2. Cell selection state and content updates trigger real-time rendering
3. KaTeX renders individual cells (with auto-scaling) and full matrix preview
4. LaTeX code generation happens automatically with syntax validation
5. Multi-cell operations (copy/paste) update matrix dimensions as needed
6. Selected cells and ranges are highlighted in both table and preview

## Technical Stack

- **Frontend**: React 19 with Hooks and TypeScript
- **Build Tool**: Vite with hot reload and development server
- **Math Rendering**: KaTeX v0.16.22 (CDN + npm package) with MathML output
- **Icons**: Lucide React for consistent iconography
- **Image Processing**: html2canvas for image export, jsPDF for PDF generation
- **Styling**: Tailwind CSS with unified design system
- **State Management**: React hooks (useState, custom hooks)
- **Code Quality**: ESLint 9 with TypeScript support
- **Navigation**: Tab-based routing with shared layout components

## Development Commands

- **Start development server**: `npm run dev` (runs on http://localhost:3000)
- **Build for production**: `npm run build`
- **Lint code**: `npm run lint`
- **Preview production build**: `npm run preview`

## Development Context

The project is now set up as a modern Node.js application with Vite + React 19 + TypeScript. The application features a modular architecture with separate tool implementations:

```
src/
├── components/
│   ├── common/           # Shared components (Navigation, AppLayout, Toast)
│   ├── matrix/           # Matrix Editor
│   ├── figure/           # Figure Layout
│   ├── pdf/              # PDF Converter
│   ├── markdown/         # Markdown Editor
│   ├── boring/           # Boring-log components shared into Hazard Map (viewer, parsers, points tiles)
│   ├── hazard/           # Hazard Map (map + design zones, jiban-api)
│   ├── section/          # Section Calc
│   └── steel/            # Steel Stress
├── hooks/                # Custom React hooks
├── types/                # TypeScript type definitions (AppTab union)
└── App.tsx               # Main application with tab routing
```

### Advanced UI Features
- **Table Controls**: Hover-based insertion/deletion buttons positioned outside table boundaries
- **Smart Selection**: Single cell, range selection (drag/Shift+click), multi-selection (Ctrl+click)
- **Copy/Paste**: Internal clipboard with TSV compatibility, auto-expands matrix dimensions
- **Context Menus**: Right-click operations for row/column management
- **Keyboard Navigation**: Full Tab/arrow key support with Shift for range selection
- **Visual Feedback**: Color-coded selection states, symmetric cell indicators
- **Responsive Scaling**: Auto-scaling cell content to fit within cell boundaries

### Matrix Features
- **Symmetric Mode**: Auto-synchronizes opposite cells in square matrices
- **Presets**: Identity, zero, clear, and symmetric matrix templates
- **LaTeX Import**: Real-time parsing with error handling and validation
- **Multiple Types**: Support for all standard LaTeX matrix environments
- **Real-time Preview**: Live KaTeX rendering with selection highlighting

### Current Status
- ✅ **Fully Integrated Math Tools Suite** - Both Matrix Editor and Figure Layout Tool unified
- ✅ **Modern React 19 + TypeScript** implementation with strict type checking
- ✅ **Tab-based Navigation** - Seamless switching between tools
- ✅ **Unified Design System** - Consistent Tailwind CSS styling across all components
- ✅ **Advanced KaTeX Integration** - v0.16.22 with MathML output support
- ✅ **Complete Feature Set** - All original functionality preserved and enhanced
- ✅ **Production-ready Build** - ESLint 9, optimized bundling, comprehensive testing