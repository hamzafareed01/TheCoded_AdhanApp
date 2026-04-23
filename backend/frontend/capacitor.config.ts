import type { CapacitorConfig } from "@capacitor/cli";

const PROD_WEB_URL = "https://nice-ground-009684610.1.azurestaticapps.net";

const config: CapacitorConfig = {
  appId: "com.thecoded.adhanhome",
  appName: "AdhanCast",
  webDir: "dist",
  server: {
    url: PROD_WEB_URL,
    cleartext: false,
    allowNavigation: [
      "nice-ground-009684610.1.azurestaticapps.net",
      "nice-ground-009684610-1.centralus.1.azurestaticapps.net",
      "app-adhanhome-api-prod-cdfdcsfeb5gtd7e9.centralus-01.azurewebsites.net",
      "*.amazon.com",
      "www.amazon.com",
      "na.account.amazon.com",
      "api.amazon.com",
      "assets.loginwithamazon.com",
      "pitangui.amazon.com",
      "layla.amazon.com",
      "alexa.amazon.co.jp"
    ]
  }
};

export default config;