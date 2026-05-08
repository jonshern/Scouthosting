// Icon set — minimal stroke icons
const Icon = ({ name, className = "ico", size = 14 }) => {
  const s = { width: size, height: size };
  const p = (d, extra = {}) => (
    <svg viewBox="0 0 24 24" className={className} style={s} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...extra}>
      {d}
    </svg>
  );
  switch (name) {
    case "home": return p(<><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></>);
    case "pages": return p(<><path d="M7 3h8l4 4v14H7zM15 3v4h4"/></>);
    case "site": return p(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>);
    case "events": return p(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>);
    case "photos": return p(<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M21 17l-5-5-9 9"/></>);
    case "posts": return p(<><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></>);
    case "roster": return p(<><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2"/><path d="M15 20a4 4 0 0 1 6 0"/></>);
    case "forms": return p(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>);
    case "media": return p(<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-6-6-9 9"/></>);
    case "settings": return p(<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.8a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.4a7 7 0 0 0-2 1.2l-2.4-.8-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-.8a7 7 0 0 0 2 1.2L10 21h4l.5-2.4a7 7 0 0 0 2-1.2l2.4.8 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/></>);
    case "domain": return p(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18"/></>);
    case "lock": return p(<><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>);
    case "search": return p(<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>);
    case "plus": return p(<><path d="M12 5v14M5 12h14"/></>);
    case "minus": return p(<><path d="M5 12h14"/></>);
    case "trash": return p(<><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></>);
    case "copy": return p(<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>);
    case "drag": return p(<><circle cx="9" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="18" r="1.2"/></>);
    case "up": return p(<><path d="M6 14l6-6 6 6"/></>);
    case "down": return p(<><path d="M6 10l6 6 6-6"/></>);
    case "left": return p(<><path d="M14 6l-6 6 6 6"/></>);
    case "right": return p(<><path d="M10 6l6 6-6 6"/></>);
    case "eye": return p(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>);
    case "edit": return p(<><path d="M4 20h4l11-11-4-4L4 16zM14 5l4 4"/></>);
    case "save": return p(<><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-6h8v6"/></>);
    case "publish": return p(<><path d="M5 12l5 5L20 7"/></>);
    case "undo": return p(<><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-3"/></>);
    case "redo": return p(<><path d="M15 14l4-4-4-4"/><path d="M19 10h-9a5 5 0 0 0 0 10h3"/></>);
    case "code": return p(<><path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/></>);
    case "type": return p(<><path d="M5 6V4h14v2M9 20h6M12 4v16"/></>);
    case "image": return p(<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-6-6-9 9"/></>);
    case "cta": return p(<><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M14 12h3M14 12l-2-2M14 12l-2 2"/></>);
    case "list": return p(<><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></>);
    case "columns": return p(<><rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/></>);
    case "divider": return p(<><path d="M3 12h18"/></>);
    case "spacer": return p(<><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/></>);
    case "video": return p(<><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2v8l-4-2z"/></>);
    case "map": return p(<><path d="M9 5l-6 2v12l6-2 6 2 6-2V5l-6 2z"/><path d="M9 5v12M15 7v12"/></>);
    case "faq": return p(<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="17" r=".5"/></>);
    case "calendar": return p(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>);
    case "globe": return p(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>);
    case "phone": return p(<><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></>);
    case "tablet": return p(<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/></>);
    case "desktop": return p(<><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>);
    case "history": return p(<><path d="M3 12a9 9 0 1 0 3-7"/><path d="M3 4v5h5M12 7v5l3 2"/></>);
    case "zap": return p(<><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></>);
    case "more": return p(<><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></>);
    case "x": return p(<><path d="M6 6l12 12M18 6L6 18"/></>);
    case "check": return p(<><path d="M5 12l5 5L20 7"/></>);
    case "link": return p(<><path d="M10 14a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7L11.7 6.7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.3 3.3a4 4 0 0 0 5.7 5.7l1.6-1.6"/></>);
    case "expand": return p(<><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></>);
    case "lightning": return p(<><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></>);
    case "sliders": return p(<><path d="M4 6h6M14 6h6M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></>);
    case "compass": return p(<><circle cx="12" cy="12" r="9"/><path d="M14 10l-2 6-2-2 4-4z"/></>);
    case "info": return p(<><circle cx="12" cy="12" r="9"/><path d="M12 8v0M11 12h1v5h1"/></>);
    case "mail": return p(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>);
    default: return null;
  }
};

window.Icon = Icon;
