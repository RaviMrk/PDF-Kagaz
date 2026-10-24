const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Java resources left out of the app. bcprov (pulled in by PdfBox-Android) ships about 4 MB of
 * post-quantum parameter tables (`pqc/crypto/picnic`, `sike`…) next to its classes; PdfBox only
 * uses the AES path, and R8 never strips resources, so they are excluded at packaging time.
 */
const EXCLUDES = ['org/bouncycastle/pqc/**'];

const MARKER = '// pdf-toolkit: packaging excludes (plugins/withPackagingExcludes.js)';

function addPackagingExcludes(buildGradle) {
  if (buildGradle.includes(MARKER)) return buildGradle;
  const list = EXCLUDES.map((e) => `'${e}'`).join(', ');
  return `${buildGradle}
${MARKER}
android {
  packaging {
    resources {
      excludes += [${list}]
    }
  }
}
`;
}

const withPackagingExcludes = (config) =>
  withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addPackagingExcludes(cfg.modResults.contents);
    return cfg;
  });

module.exports = withPackagingExcludes;
module.exports.default = withPackagingExcludes;
module.exports.addPackagingExcludes = addPackagingExcludes;
module.exports.EXCLUDES = EXCLUDES;
