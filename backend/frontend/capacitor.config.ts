import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thecoded.adhanhome',
  appName: 'Adhan Home',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
};

export default config;
