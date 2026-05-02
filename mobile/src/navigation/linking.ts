// Linking config for compass:// deep links + universal links.
//
// Supported URLs (work via deep link AND notification taps):
//   compass://event/<id>          → Calendar tab → EventDetail
//   compass://channel/<id>        → Chat tab → Thread
//   compass://channel/<id>/event  → Chat tab → EventChannel
//   compass://channel/<id>/poll/<pollId>   → Chat tab → Poll
//   compass://photos              → Photos tab
//   compass://profile             → Profile tab
//
// Universal links use the apex scheme so a Gmail / SMS click opens the
// app on a device with it installed and falls back to the web on
// devices without. The web side serves a small "open in app" page for
// these paths; on the apex domain we just deliver associated-domains
// (apple-app-site-association + .well-known/assetlinks.json).

import type { LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import type { RootTabParamList } from "./types";

const APEX = "compass.app";

export const linking: LinkingOptions<RootTabParamList> = {
  prefixes: [
    Linking.createURL("/"),         // compass://
    `https://${APEX}`,              // https://compass.app/...
    `https://*.${APEX}`,            // any subdomain
  ],
  config: {
    screens: {
      Home: {
        screens: {
          HomeRoot: "home",
          Activity: "activity",
        },
      },
      Calendar: {
        screens: {
          CalendarRoot: "calendar",
          EventDetail: "event/:eventId",
        },
      },
      Chat: {
        screens: {
          ChannelsList: "channels",
          Thread: "channel/:channelId",
          EventChannel: "channel/:channelId/event",
          Poll: "channel/:channelId/poll/:pollId",
          LeaderOversight: "channel/:channelId/oversight",
        },
      },
      Photos: {
        screens: {
          PhotosRoot: "photos",
          PhotoPermissions: "photos/permissions",
        },
      },
      Profile: {
        screens: {
          ProfileRoot: "profile",
          Support: "support",
        },
      },
    },
  },
};
