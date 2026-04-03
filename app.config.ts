import type { ExpoConfig, ConfigContext } from 'expo/config';

const GOOGLE_IOS_URL_SCHEME =
  process.env.GOOGLE_IOS_URL_SCHEME ??
  'com.googleusercontent.apps.510423566915-edi6sd1aqhcs4flbbcsdht22sfre9tsf';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'mail-app',
  slug: config.slug ?? 'mail-app',
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#000000',
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: GOOGLE_IOS_URL_SCHEME,
      },
    ],
    'expo-secure-store',
    'expo-sqlite',
    'expo-audio',
    'react-native-nitro-archive',
    ['./plugins/withMinDeploymentTarget', '16.0'],
    'llama.rn',
    [
      '@sentry/react-native/expo',
      {
        organization: 'raccoon-software',
        project: 'mail-app',
      },
    ],
  ],
});
