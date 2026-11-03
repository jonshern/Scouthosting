// iOS 27 closes an app at launch unless it uses the scene life cycle
// (UIKit traps in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo SDK 57 ships the
// scene delegate (ExpoAppSceneDelegate, Objective-C name EXExpoAppSceneDelegate) but its prebuild
// template still makes an AppDelegate-only app. This plugin switches the generated app over:
//   - Info.plist gets a UIApplicationSceneManifest naming Expo's scene delegate;
//   - AppDelegate.swift hands its React Native factory to that delegate (ExpoReactNativeFactoryProvider)
//     and stops creating its own window, since the scene makes the window and starts React Native in it.
// Once Expo's template does this itself, the AppDelegate step finds nothing to change and skips.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

function addSceneManifest(plist) {
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_DELEGATE }],
    },
  };
  return plist;
}

/** Rewrites Expo's Swift AppDelegate for the scene life cycle. Exported for tests. */
function adoptScene(src) {
  if (src.includes('ExpoReactNativeFactoryProvider')) return src;
  const decl = /class AppDelegate: ExpoAppDelegate \{/;
  // The window + startReactNative block inside didFinishLaunching.
  const start = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
  if (!decl.test(src) || !start.test(src)) {
    throw new Error('with-ios-scene: AppDelegate.swift no longer looks like Expo SDK 57’s template; update mobile/plugins/with-ios-scene.js');
  }
  return src
    .replace(decl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(start, '\n    // The window and React Native start in the scene (ExpoAppSceneDelegate, plugins/with-ios-scene.js).\n');
}

const withIosScene = (config) => {
  config = withInfoPlist(config, (c) => {
    c.modResults = addSceneManifest(c.modResults);
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('with-ios-scene expects a Swift AppDelegate');
    c.modResults.contents = adoptScene(c.modResults.contents);
    return c;
  });
};

module.exports = withIosScene;
module.exports.adoptScene = adoptScene;
module.exports.addSceneManifest = addSceneManifest;
