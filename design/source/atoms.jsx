// Shared atoms used across Compass artboards.
// All take a palette object and a `dense` bool.

const Star = ({ size = 16, fill = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
    <path d="M12 2 L14.6 8.5 L21.5 9 L16.2 13.4 L17.9 20.2 L12 16.4 L6.1 20.2 L7.8 13.4 L2.5 9 L9.4 8.5 Z" />
  </svg>
);

// Compass mark — proper compass rose. North arrow filled, others outlined.
// Uses two color levels (color + accent) for the bold-on-clean direction.
const SHMark = ({ size = 28, color = 'currentColor', accent = null }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    {/* Outer ring */}
    <circle cx="20" cy="20" r="18.5" fill="none" stroke={color} strokeWidth="1.25"/>
    {/* Inner ring */}
    <circle cx="20" cy="20" r="11" fill="none" stroke={color} strokeWidth="0.75" opacity="0.4"/>
    {/* North arrow — accent-filled, the only chromatic element */}
    <path d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z" fill={accent || color}/>
    {/* South arrow — outlined */}
    <path d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z" fill={color} opacity="0.85"/>
    {/* East / West — thinner secondary points */}
    <path d="M37 20 L20 22.4 L22.4 20 L20 17.6 Z" fill={color} opacity="0.5"/>
    <path d="M3 20 L20 17.6 L17.6 20 L20 22.4 Z" fill={color} opacity="0.5"/>
    {/* Center pivot */}
    <circle cx="20" cy="20" r="1.6" fill={color}/>
  </svg>
);

const SHWordmark = ({ p, size = 22, light = false }) => {
  const ink = light ? '#fff' : p.ink;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SHMark size={size + 8} color={ink} accent={p.accent}/>
      <div style={{
        fontFamily: window.SH_TYPE.display,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: '-0.015em',
        color: ink,
        lineHeight: 1,
      }}>
        Compass<span style={{ color: p.accent, fontWeight: 500 }}>.</span>
      </div>
    </div>
  );
};

// Subtle dot-grid backdrop, drawn as SVG. Replaces topographic lines —
// reads more digital/modern, less outdoorsy. Used as decorative bg.
const TopoBg = ({ color = '#000', opacity = 0.06 }) => {
  const id = `dotgrid-${color.replace('#','')}`;
  return (
    <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs>
        <pattern id={id} x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.2" fill={color} opacity={opacity * 2.2}/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
};

// Generic photo placeholder — colored gradient block with an "icon" (a simple
// SVG metaphor) and a caption. Looks intentional, not broken.
const Photo = ({ subject = 'forest', w = '100%', h = '100%', style = {}, p }) => {
  const subjects = {
    forest:   { bg: '#3d5a3d', tint: '#7a9a5c', label: 'Pine ridge' },
    campfire: { bg: '#3a2418', tint: '#d97a3a', label: 'Campfire' },
    canoe:    { bg: '#2c4a5a', tint: '#7ab0c4', label: 'Canoe trip' },
    troop:    { bg: '#4a3a28', tint: '#c4a374', label: 'Troop photo' },
    summit:   { bg: '#2a3a4a', tint: '#a4c4d4', label: 'Summit day' },
    eagle:    { bg: '#3a2a1a', tint: '#d4a868', label: 'Eagle CoH' },
    derby:    { bg: '#4a2a3a', tint: '#d47a94', label: 'Pinewood derby' },
    service:  { bg: '#2a3a2a', tint: '#94b478', label: 'Service day' },
    climbing: { bg: '#3a2a2a', tint: '#d49474', label: 'Rock climbing' },
    firstaid: { bg: '#2a3a3a', tint: '#94c4c4', label: 'First aid' },
    crossover:{ bg: '#3a2a4a', tint: '#a484c4', label: 'Crossover' },
    skiing:   { bg: '#3a4a5a', tint: '#c4d4e4', label: 'Winter trek' },
  };
  const s = subjects[subject] || subjects.forest;
  return (
    <div style={{
      width: w, height: h, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(135deg, ${s.bg} 0%, ${s.tint} 140%)`,
      ...style,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
        <path d={
          subject === 'forest' ? "M0 75 L15 45 L25 60 L40 30 L55 55 L70 35 L85 50 L100 40 L100 100 L0 100 Z"
          : subject === 'summit' ? "M0 80 L20 40 L35 60 L50 25 L70 55 L100 35 L100 100 L0 100 Z"
          : subject === 'canoe' ? "M0 60 L100 60 L100 100 L0 100 Z M20 55 Q50 40 80 55 L70 65 L30 65 Z"
          : subject === 'campfire' ? "M40 70 L50 35 L60 70 Z M30 75 L70 75 L65 85 L35 85 Z"
          : "M0 70 Q50 55 100 70 L100 100 L0 100 Z"
        } fill="#fff" opacity="0.6"/>
      </svg>
      <div style={{
        position: 'absolute', left: 8, bottom: 6,
        fontFamily: window.SH_TYPE.ui, fontSize: 9, fontWeight: 500,
        color: 'rgba(255,255,255,0.85)', letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>{s.label}</div>
    </div>
  );
};

// Tiny avatar circle with initials
const Avatar = ({ initials = 'AB', size = 28, bg, fg = '#fff' }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: bg, color: fg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: window.SH_TYPE.ui, fontSize: size * 0.38, fontWeight: 600,
    flexShrink: 0,
  }}>{initials}</div>
);

// Pill / chip
const Chip = ({ children, p, tone = 'default', style = {} }) => {
  const tones = {
    default: { bg: p.chip, fg: p.ink },
    primary: { bg: p.primary, fg: '#fff' },
    accent:  { bg: p.accent, fg: '#fff' },
    soft:    { bg: 'transparent', fg: p.inkSoft, border: `1px solid ${p.line}` },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      fontFamily: window.SH_TYPE.ui, fontSize: 11, fontWeight: 500,
      background: t.bg, color: t.fg, border: t.border || 'none',
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
};

// Small icon set (line icons)
const Icon = ({ name, size = 16, color = 'currentColor', stroke = 1.6 }) => {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    users:    <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="8.5" r="2.8"/><path d="M16 14.5c2.9 0 5.5 2 5.5 5.5"/></>,
    mail:     <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></>,
    image:    <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 18 6-5 5 4 3-2 4 3"/></>,
    star:     <Star size={size} fill="none" />,
    bell:     <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    chevron:  <path d="m9 6 6 6-6 6"/>,
    plus:     <><path d="M12 5v14M5 12h14"/></>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    home:     <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/>,
    map:      <><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v16M15 6v16"/></>,
    cash:     <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    leaf:     <path d="M21 3c0 9-6 15-15 15-1 0-2-.1-3-.4 0-9 6-15 15-15 1 0 2 .1 3 .4Z M3 21c5-5 10-10 18-18"/>,
    tent:     <><path d="M3 20 12 4l9 16zM12 4v16M9 20l3-5 3 5"/></>,
    compass:  <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></>,
    arrowRight: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    check:    <path d="m5 12 5 5L20 7"/>,
    dot:      <circle cx="12" cy="12" r="3"/>,
    edit:     <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></>,
    upload:   <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></>,
    download: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/></>,
    paperclip:<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>,
    phone:    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/>,
    flag:     <><path d="M4 21V4M4 15h12l-2-3 2-3H4"/></>,
    badge:    <><circle cx="12" cy="9" r="6"/><path d="M9 13.5 7 22l5-3 5 3-2-8.5"/></>,
    clipboard:<><rect x="6" y="4" width="12" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {paths[name] || paths.dot}
    </svg>
  );
};

Object.assign(window, { Star, SHMark, SHWordmark, TopoBg, Photo, Avatar, Chip, Icon });
