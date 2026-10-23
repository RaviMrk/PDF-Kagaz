// Without google-services.json the Firebase packages are not autolinked: no native code, no .so.
const { FIREBASE_PACKAGES, isFirebaseEnabled } = require('./firebaseConfig');

const unlinked = { platforms: { android: null, ios: null } };

module.exports = {
  dependencies: isFirebaseEnabled()
    ? {}
    : Object.fromEntries(FIREBASE_PACKAGES.map((p) => [p, unlinked])),
};
