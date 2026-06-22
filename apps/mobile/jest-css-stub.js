// `app/_layout.tsx` imports `@/global.css` (Tailwind/NativeWind entry). Metro
// processes it at build time via `withNativeWind`; under Jest there is no CSS
// pipeline, so map `*.css` imports to this empty module.
module.exports = {};
