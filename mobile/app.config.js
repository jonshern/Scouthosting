// app.json holds the app's settings. This file only lets a build on Jon's Mac change a few of them
// without editing app.json (see ../docs/ios.md):
//   APPLE_TEAM_ID          the team that signs the iPhone build (scripts/ios.sh finds it)
//   COMPASS_IOS_BUNDLE_ID  a different bundle id, if com.jonshern.compass is ever refused
//   COMPASS_IOS_NO_PUSH=1  leave out push notifications. A free Apple ID can't sign an app that asks
//                          for them, so scripts/ios.sh sets this unless COMPASS_IOS_PUSH=1 (paid team).
//                          Everything else works; the app just never gets a push token.
const { withEntitlementsPlist } = require('expo/config-plugins');

function withoutPush(plugins) {
  return (plugins || []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'expo-notifications');
}

/** Expo adds expo-notifications' plugin on its own as well, so also take its entitlement back out. */
function dropPushEntitlement(entitlements) {
  delete entitlements['aps-environment'];
  return entitlements;
}

module.exports = ({ config }) => {
  const team = process.env.APPLE_TEAM_ID;
  const bundle = process.env.COMPASS_IOS_BUNDLE_ID;
  const noPush = process.env.COMPASS_IOS_NO_PUSH === '1';
  const out = {
    ...config,
    ...(noPush ? { plugins: withoutPush(config.plugins) } : {}),
    ios: {
      ...config.ios,
      ...(team ? { appleTeamId: team } : {}),
      ...(bundle ? { bundleIdentifier: bundle } : {}),
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
