// Type-safe navigation parameter definitions for Compass mobile.

export type RootTabParamList = {
  Home: undefined;
  Calendar: undefined;
  Chat: undefined;
  Photos: undefined;
  Profile: undefined;
};

export type HomeStackParamList = {
  HomeRoot: undefined;
  EventDetail: { eventId: string };
  Activity: undefined;
};

export type CalendarStackParamList = {
  CalendarRoot: undefined;
  EventDetail: { eventId: string };
};

export type ChatStackParamList = {
  ChannelsList: undefined;
  Thread: { channelId: string; channelName: string };
  EventChannel: { channelId: string };
  Poll: { channelId: string; pollId: string };
  LeaderOversight: { channelId: string };
  // Legacy threads list — kept for migration path; ChannelsList is the
  // primary entry point.
  MessagesLegacy: undefined;
};

export type PhotosStackParamList = {
  PhotosRoot: undefined;
  PhotoPermissions: undefined;
};

export type ProfileStackParamList = {
  ProfileRoot: undefined;
  Support: undefined;
};
