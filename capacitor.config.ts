import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aiagent.app",
  appName: "AI金融助手",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#4a90d9",
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
