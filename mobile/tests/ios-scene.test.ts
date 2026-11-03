import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// iOS 27 closes an app at launch unless it adopts the scene life cycle (crash on Jon's iPhone,
// 2026-11-03). plugins/with-ios-scene.js switches Expo's generated app over; these check it against
// the AppDelegate that Expo SDK 57's prebuild writes (tests/fixtures/AppDelegate.sdk57.swift).
const require = createRequire(import.meta.url);
const { adoptScene, addSceneManifest } = require('../plugins/with-ios-scene.js');
const template = fs.readFileSync(path.join(__dirname, 'fixtures', 'AppDelegate.sdk57.swift'), 'utf8');

describe('with-ios-scene', () => {
  it('hands the React Native factory to the scene and stops making its own window', () => {
    const out: string = adoptScene(template);
    expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    expect(out).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(out).not.toMatch(/factory\.startReactNative/);
    // Still creates and keeps the factory the scene delegate reads.
    expect(out).toContain('reactNativeFactory = factory');
    expect(out).toContain('return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
  });

  it('is safe to run twice', () => {
    const once: string = adoptScene(template);
    expect(adoptScene(once)).toBe(once);
  });

  it('fails loudly when Expo changes its template, instead of building an app that crashes', () => {
    expect(() => adoptScene('class AppDelegate: UIResponder {}')).toThrow(/with-ios-scene/);
  });

  it('names Expo’s scene delegate in Info.plist', () => {
    const plist = addSceneManifest({});
    expect(plist.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes).toBe(false);
    expect(plist.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName).toBe('EXExpoAppSceneDelegate');
  });
});
