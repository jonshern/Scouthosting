// Root navigator: 5 bottom tabs (Home / Calendar / Chat / Photos /
// Profile). Each tab hosts its own native stack so deep links to event
// detail, threads, etc. preserve the tab context.

import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Icon, IconName } from '../theme/atoms';
import { palette, fontFamilies } from '../theme/tokens';

import HomeScreen from '../screens/HomeScreen';
import ActivityScreen from '../screens/ActivityScreen';
import CalendarScreen from '../screens/CalendarScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import PhotosScreen from '../screens/PhotosScreen';
import PhotoPermissionsScreen from '../screens/PhotoPermissionsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SupportScreen from '../screens/SupportScreen';

import ChannelsListScreen from '../screens/chat/ChannelsListScreen';
import ThreadScreen from '../screens/chat/ThreadScreen';
import EventChannelScreen from '../screens/chat/EventChannelScreen';
import PollScreen from '../screens/chat/PollScreen';
import LeaderOversightScreen from '../screens/chat/LeaderOversightScreen';

import type {
  RootTabParamList,
  HomeStackParamList,
  CalendarStackParamList,
  ChatStackParamList,
  PhotosStackParamList,
  ProfileStackParamList,
} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CalStack = createNativeStackNavigator<CalendarStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const PhotosStack = createNativeStackNavigator<PhotosStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeRoot" component={HomeScreen} />
      <HomeStack.Screen name="EventDetail" component={EventDetailScreen} />
      <HomeStack.Screen name="Activity" component={ActivityScreen} />
    </HomeStack.Navigator>
  );
}

function CalendarStackNav() {
  return (
    <CalStack.Navigator screenOptions={{ headerShown: false }}>
      <CalStack.Screen name="CalendarRoot" component={CalendarScreen} />
      <CalStack.Screen name="EventDetail" component={EventDetailScreen} />
    </CalStack.Navigator>
  );
}

function ChatStackNav() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="ChannelsList" component={ChannelsListScreen} />
      <ChatStack.Screen name="Thread" component={ThreadScreen} />
      <ChatStack.Screen name="EventChannel" component={EventChannelScreen} />
      <ChatStack.Screen name="Poll" component={PollScreen} />
      <ChatStack.Screen name="LeaderOversight" component={LeaderOversightScreen} />
      <ChatStack.Screen name="MessagesLegacy" component={MessagesScreen} />
    </ChatStack.Navigator>
  );
}

function PhotosStackNav() {
  return (
    <PhotosStack.Navigator screenOptions={{ headerShown: false }}>
      <PhotosStack.Screen name="PhotosRoot" component={PhotosScreen} />
      <PhotosStack.Screen name="PhotoPermissions" component={PhotoPermissionsScreen} />
    </PhotosStack.Navigator>
  );
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileRoot" component={ProfileScreen} />
      <ProfileStack.Screen name="Support" component={SupportScreen} />
    </ProfileStack.Navigator>
  );
}

const tabIconForRoute: Record<keyof RootTabParamList, IconName> = {
  Home: 'home',
  Calendar: 'calendar',
  Chat: 'chat',
  Photos: 'image',
  Profile: 'profile',
};

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.inkMuted,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderTopColor: palette.line,
          borderTopWidth: 0.5,
          height: 84,
          paddingTop: 8,
          paddingBottom: 24,
        },
        tabBarLabelStyle: {
          fontFamily: fontFamilies.ui,
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.4,
        },
        tabBarIcon: ({ color, focused }) => (
          <View>
            <Icon
              name={tabIconForRoute[route.name as keyof RootTabParamList]}
              size={22}
              color={color}
              strokeWidth={focused ? 2.4 : 1.6}
            />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeStackNav} />
      <Tab.Screen name="Calendar" component={CalendarStackNav} />
      <Tab.Screen name="Chat" component={ChatStackNav} />
      <Tab.Screen name="Photos" component={PhotosStackNav} />
      <Tab.Screen name="Profile" component={ProfileStackNav} />
    </Tab.Navigator>
  );
}

// Tiny helper if a screen wants to render a tab-bar-like header
export function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
      <Text
        style={{
          fontFamily: fontFamilies.display,
          fontSize: 32,
          color: palette.ink,
          letterSpacing: -0.6,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

export default RootNavigator;
