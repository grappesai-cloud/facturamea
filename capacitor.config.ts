import type { CapacitorConfig } from '@capacitor/cli';

// facturamea — Capacitor (hosted model).
// The native iOS/Android shells load the live web app (same codebase, one
// deploy). To point at a local dev server during development, set
// CAP_SERVER_URL=http://192.168.x.x:4321 before `npx cap sync`.
const serverUrl = process.env.CAP_SERVER_URL || 'https://facturamea.com';

const config: CapacitorConfig = {
  appId: 'com.facturamea.app',
  appName: 'facturamea',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#FFFFFF',
  },
  android: {
    backgroundColor: '#FFFFFF',
  },
  plugins: {
    SplashScreen: {
      // Keep the splash up until the remote web app has loaded, then hide it from
      // JS (see the native script in BaseLayout) — avoids a white flash while
      // facturamea.com loads over the network.
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
  },
};

export default config;
