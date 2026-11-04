// app.json holds the app's settings. This file only lets a build on Jon's Mac change a few of them
// without editing app.json (see ../docs/ios.md):
//   APPLE_TEAM_ID          the team that signs the iPhone build (scripts/ios.sh finds it)
//   COMPASS_IOS_BUNDLE_ID  a different bundle id, if com.jonshern.compass is ever refused
//   IOS_BUILD_NUMBER       the build number (CFBundleVersion); scripts/testflight.sh sets a new one per upload
//   COMPASS_IOS_NO_PUSH=1  leave out push notifications. A free Apple ID can't sign an app that asks
//                          for them, so scripts/ios.sh sets this unless COMPASS_IOS_PUSH=1 (paid team).
//                          Everything else works; the app just never gets a push token.
//   COMPASS_IOS_PUSH_MODE=production
//                          sign push for Apple's production servers, which TestFlight and App Store
//                          copies use (scripts/testflight.sh sets it). Development otherwise.
const { withEntitlementsPlist } = require('expo/config-plugins');

function withoutPush(plugins) {
  return (plugins || []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-notifications');
}

/** Expo adds expo-notifications' plugin on its own as well, so also take its entitlement back out. */
function dropPushEntitlement(entitlements) {
  delete entitlements['aps-environment'];
  return entitlements;
}

/** Set expo-notifications' `mode`, which picks the aps-environment entitlement. */
function withPushMode(plugins, mode) {
  return (plugins || []).map((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    if (name !== 'expo-notifications') return p;
    const options = Array.isArray(p) ? p[1] || {} : {};
    return [name, { ...options, mode }];
  });
}

module.exports = ({ config }) => {
  const team = process.env.APPLE_TEAM_ID;
  const bundle = process.env.COMPASS_IOS_BUNDLE_ID;
  const buildNumber = process.env.IOS_BUILD_NUMBER;
  const noPush = process.env.COMPASS_IOS_NO_PUSH === '1';
  const pushMode = process.env.COMPASS_IOS_PUSH_MODE;
  let plugins = config.plugins;
  if (noPush) plugins = withoutPush(plugins);
  else if (pushMode) plugins = withPushMode(plugins, pushMode);
  const out = {
    ...config,
    plugins,
    ios: {
      ...config.ios,
      ...(team ? { appleTeamId: team } : {}),
      ...(bundle ? { bundleIdentifier: bundle } : {}),
      ...(buildNumber ? { buildNumber } : {}),
    },
  };
  if (!noPush) return out;
  return withEntitlementsPlist(out, (c) => {
    c.modResults = dropPushEntitlement(c.modResults);
    return c;
  });
};

module.exports.withoutPush = withoutPush;
module.exports.dropPushEntitlement = dropPushEntitlement;
module.exports.withPushMode = withPushMode;
