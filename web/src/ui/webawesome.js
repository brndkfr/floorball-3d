// Web Awesome setup (docs/plan.md section 2). The library is a vendored
// subset under web/lib/webawesome/ (scripts/vendor-webawesome.mjs). Each
// Broadcast surface imports the components it uses below, so nothing loads
// that no screen needs; test/vendored-assets.test.js checks every import
// here is in the vendored COMPONENTS list.
import { registerIconLibrary } from '../../lib/webawesome/webawesome.js';

// wa-icon's stock "default" library loads SVGs from Font Awesome's CDN. Point it
// at our own folder so no icon request ever leaves the origin (components'
// built-in icons use the inline "system" library and are unaffected).
registerIconLibrary('default', {
  resolver: (name) => new URL(`../../lib/icons/${name}.svg`, import.meta.url).href,
});
