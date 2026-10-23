// Shared by app.config.ts and react-native.config.js: Firebase is built in only when the user's
// google-services.json exists (git-ignored; EAS supplies it through GOOGLE_SERVICES_JSON).
const fs = require('fs');
const path = require('path');

const FIREBASE_PACKAGES = [
  '@react-native-firebase/app',
  '@react-native-firebase/crashlytics',
  '@react-native-firebase/analytics',
];

/** @param {Record<string, string | undefined>} env */
function googleServicesPath(env = process.env) {
  return env.GOOGLE_SERVICES_JSON ?? path.join(__dirname, 'google-services.json');
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {(p: string) => boolean} exists
 */
function isFirebaseEnabled(env = process.env, exists = (p) => fs.existsSync(p)) {
  return exists(googleServicesPath(env));
}

module.exports = { FIREBASE_PACKAGES, googleServicesPath, isFirebaseEnabled };
