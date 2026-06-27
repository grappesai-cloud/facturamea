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
    // Dark app background so the iOS safe-area (home-indicator) region doesn't
    // flash white below the content. Requires a native rebuild to take effect.
    backgroundColor: '#07090f',
  },
  android: {
    backgroundColor: '#07090f',
  },
  plugins: {
    SplashScreen: {
      // Auto-hide on a timer — reliable for the hosted model (a JS hide() call
      // from the remote page doesn't always marshal to the native plugin). ~2.5s
      // covers the network load of facturamea.com on a normal connection.
      launchShowDuration: 2500,
      launchFadeOutDuration: 350,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
  },
};

export default config;
