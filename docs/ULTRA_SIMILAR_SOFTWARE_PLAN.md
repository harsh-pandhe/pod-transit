# Ultra-Style Simulator Plan (Mapped To This Repo)

This plan translates the tutorial behavior into a build sequence for this project.

## 1) Target Product Scope

The simulator should support:

- Network creation and editing (stations, depots, one-way guideway)
- Background map loading and scaling
- Station-demand sliders and optional OD matrix editing
- Real-time and fast-forward simulation
- Empty vehicle redistribution to waiting passengers
- Vehicle color/state view (green, blue, red, grey)
- Station queue counters and hover diagnostics
- End-of-run metrics (mean wait, under-60-second %, groups carried, fleet size)

## 2) Current Repo Status

Already present:

- React front-end and map-like simulator view in src/App.jsx
- Network abstractions in src/api/network-model.js
- Distributed-control modules (central-brain, pod-brain, orchestrator)
- KMZ/map assets and deployment docs

Missing for strict tutorial parity:

- Formal network edit mode (node/edge CRUD with one-way validation)
- Built-in OD matrix editor and gravity-model toggle
- Warmup period + exact 2-hour run framing
- Standardized tutorial KPI table and export flow

## 3) New Core Added

New module: src/api/ultra-sim-core.js

What it provides:

- Directed graph handling for one-way guideway links
- Network validity checks (stations, depots, station reachability)
- Gravity OD generation from station demand sliders
- Manual OD matrix support with per-station cap normalization
- Passenger-group generation and queuing
- Empty-vehicle dispatch to stations with waiting demand
- Vehicle lifecycle states aligned to tutorial colors
- Warmup/run execution and result summary methods

## 4) Integration Steps

1. Add a simulation adapter in App.jsx to instantiate UltraSimCore from the selected network.
2. Replace ad-hoc passenger generation with UltraSimCore snapshots.
3. Add side panel controls for:
   - Station demand sliders
   - Gravity vs manual OD mode
   - Real-time vs fast-forward
4. Add results modal/table using getResults().
5. Add network completeness badge tied to validateNetwork().

## 5) Suggested Milestones

- Milestone A: Hook UltraSimCore into current simulation tab, preserving current visuals.
- Milestone B: Build OD matrix editor and simulation controls.
- Milestone C: Add interactive network editor and map-scaling workflow.
- Milestone D: Add exportable results and scenario save/load.

## 6) Acceptance Criteria

- A user can build or load a network with at least 2 stations and 1 depot.
- The app blocks run when validation fails and shows why.
- Running simulation for 2 hours provides station and network KPIs.
- Changing demand/OD materially changes wait-time and queue outcomes.
- Fast-forward computes full run quickly while preserving final KPIs.
