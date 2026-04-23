import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.thecoded.adhanhome",
  appName: "AdhanCast",
  webDir: "build",
  server: {
    androidScheme: "https"
  }
};

export default config;