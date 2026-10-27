import type { NextConfig } from 'next';

const config: NextConfig = {
  // The MediaPipe wasm runtime is fetched at runtime from /mediapipe/wasm and
  // must be served with the right type; Next handles that for public/ already.
  // Cross-origin isolation isn't required for the single-threaded build we use.
  reactStrictMode: true,
};

export default config;
