/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AMAZON_CLIENT_ID?: string;
  readonly VITE_AMAZON_RETURN_URL?: string;
  readonly VITE_AMAZON_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
