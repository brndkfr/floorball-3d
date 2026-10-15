# 001 - Web Awesome for UI components, own CSS for tokens and layout

Date: 2026-09-24. Status: accepted, not yet built (S-BACK-021 step 0).

## Context

The earlier redesign plan used Shoelace + Open Props + Radix Colors.
Shoelace is end-of-life (last release 2.20.1, 2025-03-11; repo archived
2026-05-14). The vendored Shoelace copy also tripped CodeQL
`js/bad-tag-filter` and was deleted (S-BACK-013).

## Decision

- Interactive components: Web Awesome free core (MIT,
  `@awesome.me/webawesome`, Shoelace's successor, same zero-build custom
  element model). The paid Pro tier is not needed.
- Tokens, theme and layout: our own CSS (`tokens.css`,
  `theme-broadcast.css`, `app.css`). The theme file maps `--wa-*` onto
  `--fb-*` and never holds a colour literal.
- Radix Colors and Open Props are dropped: the Broadcast canvas pins every
  colour and the few spacing / radius / type values it needs.

## Consequences

- Vendor only the used components into `web/lib/webawesome/`, with a size
  budget entry. No CDN.
- No `wa-icon` Font Awesome kit (it loads from `ka-f.fontawesome.com` at
  runtime); use a local icon library or inline SVG.
- `web/lib/webawesome/` is excluded from CodeQL via the advanced setup.
- Existing DOM ids stay on the replacing elements so `getElementById`
  guards and Playwright specs keep working.
