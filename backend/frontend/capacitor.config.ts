
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thecoded.adhanhome',
  appName: 'AdhanCast',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: [
      'nice-ground-009684610.1.azurestaticapps.net',
      'nice-ground-009684610-1.centralus.1.azurestaticapps.net',
      'app-adhanhome-api-prod-cdfdcsfeb5gtd7e9.centralus-01.azurewebsites.net',
      'www.amazon.com',
      'api.amazon.com',
      'na.account.amazon.com',
      'pitangui.amazon.com',
      'layla.amazon.com',
      'alexa.amazon.co.jp'
    ]
  },
};

export default config;
