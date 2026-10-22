/// <reference types="vite/client" />

// Validated and defined in vite.config.ts; the declaration only narrows Vite's open-ended env record.
interface ImportMetaEnv {
  readonly VITE_SITE_MODE: 'static' | 'local';
}
