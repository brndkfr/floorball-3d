# 002 - Broadcast visual direction

Date: 2026-09. Status: accepted; tokens shipped (S-BACK-019), port open
(S-BACK-021).

## Context

The UI grew as a dev console (stacked HUD panels). Three directions were
mocked on a design canvas, 8 screens each, plus a 13-screen gap-fill page
(S-BACK-020):
<https://claude.ai/code/artifact/2272914e-271a-4f2b-a083-59dc8ce8e377>

## Decision

**Broadcast / matchday sport**: deep-ink stage, one electric-blue action
colour (`#2E6BFF`) that never doubles as a team colour, domain green / red
intact, Archivo display + IBM Plex Mono for every measurement, flat
surfaces with hairline borders, a single 3 px accent motif. No glow, blur
or angled corners.

Rejected, kept on the canvas for reference: **Instrument** (cold technical,
mint accent) and **Chalk & Court** (warm editorial, burnt orange).

Fixed in every direction: the rink is a blue surface with solid black
boards and white markings.

## Consequences

- Breakpoints: >= 1200 px both panels docked; 768-1199 right panel as a
  drawer; < 768 bottom tab bar and bottom sheet.
- Authoring is desktop-first; phone is for review, playback and quick
  nudges.
