// React Native equivalents of the shared atoms in
// design/source/atoms.jsx. Includes the compass-rose mark, Avatar,
// Chip, Photo placeholder (linear-gradient via SVG), and a small icon
// set. Uses react-native-svg for vector primitives.

import React from 'react';
import { StyleSheet, Text, View, ViewStyle, StyleProp, TextStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { palette, radius, fontFamilies } from './tokens';

// ─── Compass mark (SVG rose) ──────────────────────────────────
export type CompassMarkProps = {
  size?: number;
  color?: string;
  accent?: string | null;
};

export function CompassMark({ size = 28, color = palette.ink, accent = palette.accent }: CompassMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r="18.5" fill="none" stroke={color} strokeWidth={1.25} />
      <Circle cx="20" cy="20" r="11" fill="none" stroke={color} strokeWidth={0.75} opacity={0.4} />
      {/* North arrow — accent-filled (the only chromatic element) */}
      <Path d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z" fill={accent ?? color} />
      <Path d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z" fill={color} opacity={0.85} />
      <Path d="M37 20 L20 22.4 L22.4 20 L20 17.6 Z" fill={color} opacity={0.5} />
      <Path d="M3 20 L20 17.6 L17.6 20 L20 22.4 Z" fill={color} opacity={0.5} />
      <Circle cx="20" cy="20" r="1.6" fill={color} />
    </Svg>
  );
}

// ─── Wordmark ─────────────────────────────────────────────────
export type WordmarkProps = {
  size?: number;
  light?: boolean;
};

export function Wordmark({ size = 22, light = false }: WordmarkProps) {
  const ink = light ? '#ffffff' : palette.ink;
  return (
    <View style={atomStyles.wordmark}>
      <CompassMark size={size + 8} color={ink} accent={palette.accent} />
      <Text
        style={[
          atomStyles.wordmarkText,
          { color: ink, fontSize: size, lineHeight: size },
        ]}
      >
        Compass<Text style={{ color: palette.accent }}>.</Text>
      </Text>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────
export type AvatarProps = {
  initials: string;
  size?: number;
  bg?: string;
  fg?: string;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ initials, size = 36, bg = palette.primary, fg = '#ffffff', style }: AvatarProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text
        style={{
          color: fg,
          fontFamily: fontFamilies.ui,
          fontWeight: '600',
          fontSize: Math.round(size * 0.38),
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─── Chip ─────────────────────────────────────────────────────
export type ChipTone = 'default' | 'primary' | 'accent' | 'soft' | 'success' | 'danger';

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function Chip({ label, tone = 'default', style, textStyle }: ChipProps) {
  const tones: Record<ChipTone, { bg: string; fg: string; border?: string }> = {
    default: { bg: palette.lineSoft, fg: palette.ink },
    primary: { bg: palette.primary, fg: '#ffffff' },
    accent: { bg: palette.accent, fg: palette.ink },
    soft: { bg: 'transparent', fg: palette.inkSoft, border: palette.line },
    success: { bg: palette.success, fg: '#ffffff' },
    danger: { bg: palette.danger, fg: '#ffffff' },
  };
  const t = tones[tone];
  return (
    <View
      style={[
        atomStyles.chip,
        { backgroundColor: t.bg, borderColor: t.border ?? 'transparent', borderWidth: t.border ? 1 : 0 },
        style,
      ]}
    >
      <Text style={[atomStyles.chipText, { color: t.fg }, textStyle]}>{label}</Text>
    </View>
  );
}

// ─── Photo placeholder ────────────────────────────────────────
export type PhotoSubject =
  | 'forest'
  | 'campfire'
  | 'canoe'
  | 'troop'
  | 'summit'
  | 'eagle'
  | 'derby'
  | 'service'
  | 'climbing';

const photoSubjects: Record<PhotoSubject, { bg: string; tint: string; label: string; path: string }> = {
  forest: { bg: '#3d5a3d', tint: '#7a9a5c', label: 'Pine ridge', path: 'M0 75 L15 45 L25 60 L40 30 L55 55 L70 35 L85 50 L100 40 L100 100 L0 100 Z' },
  campfire: { bg: '#3a2418', tint: '#d97a3a', label: 'Campfire', path: 'M40 70 L50 35 L60 70 Z M30 75 L70 75 L65 85 L35 85 Z' },
  canoe: { bg: '#2c4a5a', tint: '#7ab0c4', label: 'Canoe trip', path: 'M0 60 L100 60 L100 100 L0 100 Z' },
  troop: { bg: '#4a3a28', tint: '#c4a374', label: 'Troop photo', path: 'M0 70 Q50 55 100 70 L100 100 L0 100 Z' },
  summit: { bg: '#2a3a4a', tint: '#a4c4d4', label: 'Summit day', path: 'M0 80 L20 40 L35 60 L50 25 L70 55 L100 35 L100 100 L0 100 Z' },
  eagle: { bg: '#3a2a1a', tint: '#d4a868', label: 'Eagle CoH', path: 'M0 70 Q50 55 100 70 L100 100 L0 100 Z' },
  derby: { bg: '#4a2a3a', tint: '#d47a94', label: 'Pinewood derby', path: 'M0 70 Q50 55 100 70 L100 100 L0 100 Z' },
  service: { bg: '#2a3a2a', tint: '#94b478', label: 'Service day', path: 'M0 70 Q50 55 100 70 L100 100 L0 100 Z' },
  climbing: { bg: '#3a2a2a', tint: '#d49474', label: 'Rock climbing', path: 'M0 70 Q50 55 100 70 L100 100 L0 100 Z' },
};

export type PhotoProps = {
  subject?: PhotoSubject;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  rounded?: number;
  showCaption?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Photo({ subject = 'forest', width = '100%', height = 180, rounded = radius.cardLg, showCaption = true, style }: PhotoProps) {
  const s = photoSubjects[subject];
  return (
    <View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius: rounded,
          overflow: 'hidden',
          backgroundColor: s.bg,
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`g-${subject}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={s.bg} stopOpacity="1" />
            <Stop offset="1" stopColor={s.tint} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#g-${subject})`} />
        <Path d={s.path} fill="#ffffff" opacity={0.6} />
      </Svg>
      {showCaption && (
        <Text
          style={{
            position: 'absolute',
            left: 10,
            bottom: 8,
            color: 'rgba(255,255,255,0.85)',
            fontFamily: fontFamilies.ui,
            fontSize: 9,
            fontWeight: '600',
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {s.label}
        </Text>
      )}
    </View>
  );
}

// ─── Icon ─────────────────────────────────────────────────────
// Subset of the line-icon set in atoms.jsx — only the ones the mobile
// surfaces actually use. Add more as needed.
export type IconName =
  | 'home'
  | 'calendar'
  | 'chat'
  | 'image'
  | 'profile'
  | 'plus'
  | 'search'
  | 'chevron'
  | 'chevronLeft'
  | 'check'
  | 'bell'
  | 'shield'
  | 'pin'
  | 'send'
  | 'sparkles'
  | 'lock'
  | 'flag'
  | 'tent'
  | 'dot';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.8 }: IconProps) {
  const stroke = color === 'currentColor' ? palette.ink : color;
  const common = {
    fill: 'none' as const,
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G {...common}>
        {iconPath(name)}
      </G>
    </Svg>
  );
}

function iconPath(name: IconName) {
  switch (name) {
    case 'home':
      return <Path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />;
    case 'calendar':
      return (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="2" />
          <Path d="M3 9h18M8 3v4M16 3v4" />
        </>
      );
    case 'chat':
      return <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />;
    case 'image':
      return (
        <>
          <Rect x="3" y="4" width="18" height="16" rx="2" />
          <Circle cx="9" cy="10" r="2" />
          <Path d="m3 18 6-5 5 4 3-2 4 3" />
        </>
      );
    case 'profile':
      return <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" />
          <Path d="m20 20-3.5-3.5" />
        </>
      );
    case 'chevron':
      return <Path d="m9 6 6 6-6 6" />;
    case 'chevronLeft':
      return <Path d="m15 6-6 6 6 6" />;
    case 'check':
      return <Path d="m5 12 5 5L20 7" />;
    case 'bell':
      return (
        <>
          <Path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
          <Path d="M10 19a2 2 0 0 0 4 0" />
        </>
      );
    case 'shield':
      return <Path d="M12 2 L4 6 v6 c0 5 3.5 9 8 10 4.5-1 8-5 8-10 V6 z M9 12 l2 2 4-4" />;
    case 'pin':
      return <Path d="M12 2l2 7h7l-5.5 4 2 7-5.5-4-5.5 4 2-7L3 9h7z" />;
    case 'send':
      return <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />;
    case 'sparkles':
      return <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />;
    case 'lock':
      return (
        <>
          <Rect x="4" y="11" width="16" height="10" rx="2" />
          <Path d="M8 11V7a4 4 0 1 1 8 0v4" />
        </>
      );
    case 'flag':
      return <Path d="M4 21V4M4 15h12l-2-3 2-3H4" />;
    case 'tent':
      return <Path d="M3 20 L12 4 L21 20 Z M12 4 v16 M9 20 l3-5 3 5" />;
    case 'dot':
    default:
      return <Circle cx="12" cy="12" r="3" />;
  }
}

const atomStyles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmarkText: {
    fontFamily: fontFamilies.display,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: {
    fontFamily: fontFamilies.ui,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
