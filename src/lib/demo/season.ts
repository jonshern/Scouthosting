// The demo unit's season: a fictional troop with a realistic fall of
// meetings, a campout, a merit badge day, a court of honor, chat,
// treasury activity and scouts at different ranks.
//
// Pure data, no database. Dates are offsets from "now" so the demo
// always looks like the middle of a live season, whenever it's reset.
// Every name is invented; every address is @demo.invalid. The tests in
// season.test.ts hold those rules.

import { DEMO_EMAIL_DOMAIN } from "./mode";

export const DEMO_UNIT = {
  unitType: "Troop" as const,
  unitNumber: "42",
  charterOrg: "Maple Ridge Community Center",
  city: "Maple Ridge",
  state: "MN",
  council: "Sample",
  district: "Lakes District",
  founded: "1987",
  tagline: "Camping every month since 1987",
  meetingDay: "Mondays",
  meetingTime: "7:00 PM",
  meetingLocation: "Maple Ridge Community Center, Room B",
  primaryColor: "#1f4e79",
  accentColor: "#d39b2a",
  // Vault passphrase for the demo org. Fine to publish: every name in
  // the demo is made up, and the database is wiped on every reset.
  passphrase: "maple-ridge-demo-passphrase",
};

export const RANKS = [
  "Scout",
  "Tenderfoot",
  "Second Class",
  "First Class",
  "Star",
  "Life",
  "Eagle",
] as const;
export type Rank = (typeof RANKS)[number];

export const PATROLS = [
  { name: "Foxes", color: "#c2410c", description: "Our newest scouts, crossed over in the spring." },
  { name: "Hawks", color: "#1d4ed8", description: "Second- and third-year scouts." },
  { name: "Otters", color: "#0f766e", description: "The older patrol; most are working toward Star and Life." },
] as const;

export type DemoScout = {
  key: string;
  firstName: string;
  lastName: string;
  patrol: (typeof PATROLS)[number]["name"];
  age: number;
  rank: Rank;
  position?: string;
  /** Key of the parent adult (see DEMO_ADULTS). */
  parent: string;
};

export type DemoAdult = {
  key: string;
  firstName: string;
  lastName: string;
  position?: string;
  phone?: string;
  /** Demo account role signed in as this adult, if any. */
  account?: "admin" | "leader" | "counselor" | "parent";
  /** Leader YPT on file (two-deep chat needs at least two). */
  ypt?: boolean;
  skills?: string[];
};

export const DEMO_ADULTS: readonly DemoAdult[] = [
  { key: "ellis", firstName: "Morgan", lastName: "Ellis", position: "Scoutmaster", phone: "555-010-4201", account: "admin", ypt: true, skills: ["wilderness first aid", "trailer towing"] },
  { key: "shah", firstName: "Priya", lastName: "Shah", position: "Assistant Scoutmaster", phone: "555-010-4202", account: "leader", ypt: true, skills: ["backpacking", "dutch oven"] },
  { key: "whitfield", firstName: "Dana", lastName: "Whitfield", position: "Merit Badge Counselor", phone: "555-010-4203", account: "counselor", ypt: true, skills: ["first aid", "cooking"] },
  { key: "rivera", firstName: "Jordan", lastName: "Rivera", phone: "555-010-4204", account: "parent", skills: ["photography"] },
  { key: "okafor", firstName: "Grace", lastName: "Okafor", position: "Committee Chair", phone: "555-010-4205", ypt: true },
  { key: "lindqvist", firstName: "Erik", lastName: "Lindqvist", position: "Treasurer", phone: "555-010-4206", ypt: true },
  { key: "nguyen", firstName: "Thanh", lastName: "Nguyen", phone: "555-010-4207", skills: ["15-passenger van"] },
  { key: "brooks", firstName: "Alicia", lastName: "Brooks", phone: "555-010-4208" },
  { key: "kowalski", firstName: "Pete", lastName: "Kowalski", phone: "555-010-4209", skills: ["canoeing"] },
  { key: "haddad", firstName: "Leila", lastName: "Haddad", phone: "555-010-4210" },
  { key: "mercer", firstName: "Sean", lastName: "Mercer", phone: "555-010-4211" },
];

export const DEMO_SCOUTS: readonly DemoScout[] = [
  // Foxes
  { key: "theo", firstName: "Theo", lastName: "Rivera", patrol: "Foxes", age: 11, rank: "Scout", parent: "rivera" },
  { key: "max", firstName: "Max", lastName: "Nguyen", patrol: "Foxes", age: 11, rank: "Tenderfoot", position: "Patrol Leader", parent: "nguyen" },
  { key: "owen", firstName: "Owen", lastName: "Brooks", patrol: "Foxes", age: 11, rank: "Scout", parent: "brooks" },
  { key: "eli", firstName: "Eli", lastName: "Haddad", patrol: "Foxes", age: 12, rank: "Tenderfoot", parent: "haddad" },
  { key: "jonah", firstName: "Jonah", lastName: "Mercer", patrol: "Foxes", age: 11, rank: "Scout", parent: "mercer" },
  // Hawks
  { key: "sam", firstName: "Sam", lastName: "Rivera", patrol: "Hawks", age: 13, rank: "First Class", position: "Patrol Leader", parent: "rivera" },
  { key: "ben", firstName: "Ben", lastName: "Kowalski", patrol: "Hawks", age: 13, rank: "Second Class", parent: "kowalski" },
  { key: "luca", firstName: "Luca", lastName: "Shah", patrol: "Hawks", age: 12, rank: "Second Class", parent: "shah" },
  { key: "isaac", firstName: "Isaac", lastName: "Okafor", patrol: "Hawks", age: 13, rank: "First Class", position: "Quartermaster", parent: "okafor" },
  { key: "noah", firstName: "Noah", lastName: "Lindqvist", patrol: "Hawks", age: 12, rank: "Tenderfoot", parent: "lindqvist" },
  // Otters
  { key: "caleb", firstName: "Caleb", lastName: "Ellis", patrol: "Otters", age: 16, rank: "Life", position: "Senior Patrol Leader", parent: "ellis" },
  { key: "miles", firstName: "Miles", lastName: "Brooks", patrol: "Otters", age: 15, rank: "Star", position: "Patrol Leader", parent: "brooks" },
  { key: "aiden", firstName: "Aiden", lastName: "Kowalski", patrol: "Otters", age: 15, rank: "Star", position: "Scribe", parent: "kowalski" },
  { key: "ravi", firstName: "Ravi", lastName: "Shah", patrol: "Otters", age: 14, rank: "First Class", position: "Troop Guide", parent: "shah" },
];

export function demoEmail(firstName: string, lastName: string): string {
  return `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, "") + `@${DEMO_EMAIL_DOMAIN}`;
}

// ---------------------------------------------------------------------------
// Calendar. `day` is an offset in days from the reset; `at` is local "HH:MM".

export type DemoSlot = {
  title: string;
  description?: string;
  capacity: number;
  /** Adult keys (DEMO_ADULTS) who hold a seat, in sign-up order. */
  takenBy: string[];
  /** Adult keys waiting for a seat. */
  waitlist?: string[];
};

export type DemoEvent = {
  key: string;
  title: string;
  description: string;
  category: string;
  day: number;
  at: string;
  /** Length in hours, or whole days when `nights` is set. */
  hours?: number;
  nights?: number;
  location: string;
  locationAddress?: string;
  cost?: number;
  capacity?: number;
  signupRequired?: boolean;
  requiresPermissionSlip?: boolean;
  rrule?: string;
  serviceHours?: number;
  campingNights?: number;
  hikingMiles?: number;
  /** RSVP "yes" from these scout keys (and their parents get the RSVP). */
  going?: string[];
  maybe?: string[];
  notGoing?: string[];
  slots?: DemoSlot[];
  /** Give the event its own chat channel. */
  channel?: boolean;
};

export const DEMO_EVENTS: readonly DemoEvent[] = [
  {
    key: "meeting",
    title: "Troop meeting",
    description: "Weekly meeting: patrol corners, skills instruction and a game. Class A uniform.",
    category: "meeting",
    // Weekly: the seed moves this to the next meeting day.
    day: 0,
    at: "19:00",
    hours: 1.5,
    location: "Maple Ridge Community Center, Room B",
    rrule: "FREQ=WEEKLY;BYDAY=MO",
  },
  {
    key: "coh",
    title: "Fall Court of Honor",
    description: "Rank advancements, merit badges and a potluck. Families welcome.",
    category: "court-of-honor",
    day: -18,
    at: "18:30",
    hours: 2,
    location: "Maple Ridge Community Center, Main Hall",
    going: ["sam", "theo", "max", "owen", "eli", "ben", "luca", "isaac", "noah", "caleb", "miles", "aiden", "ravi"],
  },
  {
    key: "service",
    title: "Service project: Lakeside Park cleanup",
    description: "Trail sweep and buckthorn pull with the city parks crew. Gloves and water provided.",
    category: "service",
    day: -9,
    at: "09:00",
    hours: 3,
    location: "Lakeside Park, north shelter",
    serviceHours: 3,
    going: ["sam", "max", "ben", "isaac", "caleb", "miles", "ravi", "eli"],
    notGoing: ["owen"],
  },
  {
    key: "plc",
    title: "Patrol Leaders' Council",
    description: "Plan the next three months of meetings. Patrol leaders and the SPL; parents not needed.",
    category: "meeting",
    day: 4,
    at: "18:00",
    hours: 1,
    location: "Maple Ridge Community Center, Room B",
    going: ["caleb", "sam", "max", "miles"],
  },
  {
    key: "campout",
    title: "Fall campout at Pine Hollow",
    description:
      "Two nights of tent camping. Saturday: orienteering course and cooking for Second Class 2a. " +
      "Leave from the community center Friday at 5:30 PM, back Sunday by noon.",
    category: "campout",
    day: 11,
    at: "17:30",
    nights: 2,
    location: "Pine Hollow Scout Camp",
    locationAddress: "4100 Pine Hollow Rd, Maple Ridge, MN",
    cost: 35,
    capacity: 24,
    signupRequired: true,
    requiresPermissionSlip: true,
    campingNights: 2,
    going: ["sam", "theo", "max", "ben", "luca", "isaac", "caleb", "miles", "ravi"],
    maybe: ["eli", "noah"],
    notGoing: ["aiden"],
    channel: true,
    slots: [
      { title: "Driver, Friday out", description: "Seats for 3+ scouts. Leave 5:30 PM.", capacity: 4, takenBy: ["nguyen", "kowalski", "shah"] },
      { title: "Driver, Sunday back", description: "Pick up at camp by 11:30 AM.", capacity: 4, takenBy: ["rivera", "brooks"] },
      { title: "Saturday dinner cook coach", description: "Help the Foxes with their first patrol meal.", capacity: 1, takenBy: ["whitfield"], waitlist: ["haddad"] },
      { title: "Gear check, Thursday", description: "Tents, stoves and lanterns at the trailer, 6 PM.", capacity: 2, takenBy: ["ellis"] },
    ],
  },
  {
    key: "badgeday",
    title: "Maple Ridge Merit Badge Day",
    description:
      "Six stations across two rotations, run by district counselors. Scouts pick one station per rotation " +
      "and finish the rest of the badge with their counselor afterward.",
    category: "merit-badge-day",
    day: 25,
    at: "09:00",
    hours: 7,
    location: "Maple Ridge Middle School",
    locationAddress: "200 School St, Maple Ridge, MN",
    cost: 10,
    signupRequired: true,
    going: ["sam", "max", "ben", "luca", "isaac", "noah", "miles", "aiden", "ravi"],
    channel: true,
  },
  {
    key: "hike",
    title: "Ridge Trail day hike",
    description: "Eight miles on the Ridge Trail. Counts toward Hiking merit badge req 5. Pack lunch, two liters of water.",
    category: "hike",
    day: 39,
    at: "08:00",
    hours: 6,
    location: "Ridge Trail, east trailhead",
    hikingMiles: 8,
    going: ["sam", "ben", "caleb", "ravi"],
    maybe: ["miles"],
  },
];

/** The badge day's public sign-up address and Waypoint-style event file. */
export const BADGE_DAY_SLUG = "maple-ridge-merit-badge-day";

export const BADGE_DAY_FILE = {
  title: "Maple Ridge Merit Badge Day",
  blocks: [
    { id: "A", label: "Morning rotation" },
    { id: "B", label: "Afternoon rotation" },
  ],
  stations: [
    { id: "firstaid", block: "A", badge: "First Aid", capacity: 10 },
    { id: "cooking", block: "A", badge: "Cooking", capacity: 8 },
    { id: "robotics", block: "A", badge: "Robotics", capacity: 8 },
    { id: "camping", block: "B", badge: "Camping", capacity: 12 },
    { id: "cyber", block: "B", badge: "Cybersecurity", capacity: 10 },
    { id: "woodwork", block: "B", badge: "Woodwork", capacity: 6 },
  ],
  volunteerRoles: [
    { id: "checkin", label: "Check-in table", need: 2, desc: "8:15 to 9:15. Hand out passports and match scouts to stations." },
    { id: "lunch", label: "Lunch crew", need: 3, desc: "11:30 to 12:45. Set up tables and clean up." },
    { id: "firstaid-lead", label: "First aid lead", need: 1, desc: "All day. Owns the kit and the incident log." },
  ],
};

/** Who's in which badge day seat. Station keys → scout keys; role keys → adult keys. */
export const BADGE_DAY_SIGNUPS: Record<string, { taken: string[]; waitlist?: string[] }> = {
  "station:firstaid": { taken: ["max", "ben", "noah", "luca"] },
  "station:cooking": { taken: ["sam", "isaac", "ravi", "miles", "aiden", "ben", "luca", "noah"], waitlist: ["max"] },
  "station:robotics": { taken: ["aiden"] },
  "station:camping": { taken: ["max", "noah", "luca"] },
  "station:cyber": { taken: ["sam", "isaac", "ravi", "miles"] },
  "station:woodwork": { taken: ["ben"] },
  "role:checkin": { taken: ["okafor"] },
  "role:lunch": { taken: ["brooks", "haddad"] },
  "role:firstaid-lead": { taken: ["whitfield"] },
};

// ---------------------------------------------------------------------------
// Advancement

/** What each scout earned at the court of honor (rank or merit badge). */
export const COH_AWARDS: ReadonlyArray<{ scout: string; award: string; category: "Rank" | "Merit Badge" }> = [
  { scout: "max", award: "Tenderfoot rank", category: "Rank" },
  { scout: "eli", award: "Tenderfoot rank", category: "Rank" },
  { scout: "ben", award: "Second Class rank", category: "Rank" },
  { scout: "sam", award: "First Class rank", category: "Rank" },
  { scout: "miles", award: "Star rank", category: "Rank" },
  { scout: "caleb", award: "Life rank", category: "Rank" },
  { scout: "isaac", award: "Environmental Science merit badge", category: "Merit Badge" },
  { scout: "ravi", award: "Swimming merit badge", category: "Merit Badge" },
  { scout: "aiden", award: "Citizenship in the Community merit badge", category: "Merit Badge" },
];

/**
 * Requirement progress (catalog IDs, see @scout-core/catalog). Scouts
 * working on their next rank, and the counselor's First Aid and Cooking
 * scouts.
 */
export const PROGRESS: ReadonlyArray<{ scout: string; id: string; status: "in_progress" | "done" | "signed_off"; by?: "counselor" | "leader" }> = [
  { scout: "theo", id: "rank:scout#1a", status: "signed_off", by: "leader" },
  { scout: "theo", id: "rank:scout#1b", status: "signed_off", by: "leader" },
  { scout: "theo", id: "rank:scout#2", status: "done" },
  { scout: "theo", id: "rank:scout#3", status: "in_progress" },
  { scout: "sam", id: "rank:star#1", status: "in_progress" },
  { scout: "sam", id: "rank:star#2", status: "signed_off", by: "leader" },
  { scout: "max", id: "rank:second-class#1a", status: "signed_off", by: "leader" },
  { scout: "max", id: "rank:second-class#2a", status: "in_progress" },
  { scout: "ben", id: "rank:first-class#3a", status: "done" },
  { scout: "caleb", id: "rank:eagle#5", status: "in_progress" },
  { scout: "max", id: "badge:first-aid#1", status: "signed_off", by: "counselor" },
  { scout: "max", id: "badge:first-aid#2", status: "signed_off", by: "counselor" },
  { scout: "max", id: "badge:first-aid#3", status: "done" },
  { scout: "ben", id: "badge:first-aid#1", status: "signed_off", by: "counselor" },
  { scout: "ben", id: "badge:first-aid#2", status: "in_progress" },
  { scout: "sam", id: "badge:cooking#1", status: "signed_off", by: "counselor" },
  { scout: "sam", id: "badge:cooking#2", status: "signed_off", by: "counselor" },
  { scout: "sam", id: "badge:cooking#3", status: "done" },
  { scout: "sam", id: "badge:cooking#4", status: "in_progress" },
];

/** The counselor's badges and the scouts assigned to them. */
export const COUNSELOR_BADGES = ["first-aid", "cooking", "camping"] as const;
export const COUNSELOR_ASSIGNMENTS: ReadonlyArray<{ scout: string; badge: (typeof COUNSELOR_BADGES)[number] }> = [
  { scout: "max", badge: "first-aid" },
  { scout: "ben", badge: "first-aid" },
  { scout: "sam", badge: "cooking" },
  { scout: "luca", badge: "camping" },
];

/** District counselors on the unit's list (not all are Compass users). */
export const COUNSELOR_LIST = [
  { name: "Dana Whitfield", badges: ["First Aid", "Cooking", "Camping"], adult: "whitfield", notes: "Also runs the badge day First Aid station." },
  { name: "Ray Castellano", badges: ["Robotics", "Electronics"], notes: "District counselor; meets at the library makerspace." },
  { name: "Hannah Brandt", badges: ["Cybersecurity", "Digital Technology"], notes: "Prefers group sessions." },
  { name: "Walt Jorgensen", badges: ["Woodwork", "Pioneering"], notes: "Has a shop; two-scout minimum." },
];

// ---------------------------------------------------------------------------
// Chat. Channel kinds match Compass's standing channels; `ago` is minutes before the reset.

export const MESSAGES: ReadonlyArray<{ channel: "troop" | "parents" | "leaders" | "campout" | "badgeday"; from: string; ago: number; body: string }> = [
  { channel: "troop", from: "ellis", ago: 60 * 24 * 3, body: "Great turnout at the park cleanup. 8 scouts, 24 service hours logged. Thank you!" },
  { channel: "troop", from: "shah", ago: 60 * 24 * 2, body: "Campout sign-ups are open. Permission slips are on the event page this year, no paper." },
  { channel: "troop", from: "ellis", ago: 60 * 5, body: "Reminder: bring your Scout handbook Monday. We're doing map and compass in patrols." },
  { channel: "parents", from: "rivera", ago: 60 * 26, body: "Is the campout OK for a first-timer? Theo's never slept in a tent." },
  { channel: "parents", from: "shah", ago: 60 * 25, body: "Absolutely. The Foxes tent together and an adult is in the next site. Packing list is on the event." },
  { channel: "parents", from: "nguyen", ago: 60 * 20, body: "I can drive Friday with room for three." },
  { channel: "leaders", from: "okafor", ago: 60 * 30, body: "Committee meeting moved to the 2nd Tuesday. Budget draft is in the treasury reports." },
  { channel: "leaders", from: "lindqvist", ago: 60 * 28, body: "Campsite deposit is paid. Dues are 80% in; I'll send balances this week." },
  { channel: "leaders", from: "ellis", ago: 60 * 4, body: "Need one more adult for the Sunday drive back. Anyone?" },
  { channel: "campout", from: "shah", ago: 60 * 12, body: "Menu for Saturday dinner is posted. Foxes are cooking chili with Dana coaching." },
  { channel: "campout", from: "whitfield", ago: 60 * 10, body: "I'll bring the patrol first aid kits for a quick check before we leave." },
  { channel: "badgeday", from: "whitfield", ago: 60 * 6, body: "First Aid station has 6 seats left. Do the prereq worksheet before you come." },
  { channel: "badgeday", from: "ellis", ago: 60 * 3, body: "Cooking filled up fast. Max is first on the waitlist." },
];

// ---------------------------------------------------------------------------
// Treasury. Cents; positive = money in. `scout` charges/credits a scout account.

export const TREASURY: ReadonlyArray<{
  fund: "general" | "scout-accounts";
  type: "dues" | "event-charge" | "deposit" | "expense" | "fundraiser-credit";
  amountCents: number;
  description: string;
  day: number;
  scout?: string;
  event?: string;
}> = [
  { fund: "general", type: "deposit", amountCents: 182_500, description: "Opening balance carried from last year", day: -60 },
  ...["sam", "theo", "max", "owen", "eli", "ben", "luca", "isaac", "noah", "caleb", "miles"].map((scout) => ({
    fund: "general" as const,
    type: "dues" as const,
    amountCents: 9_000,
    description: "Annual dues",
    day: -40,
    scout,
  })),
  { fund: "general", type: "expense", amountCents: -12_000, description: "Pine Hollow campsite deposit", day: -14, event: "campout" },
  { fund: "general", type: "expense", amountCents: -4_675, description: "Court of honor: patches and cards", day: -19, event: "coh" },
  { fund: "general", type: "deposit", amountCents: 64_000, description: "Popcorn sale, unit share", day: -7 },
  ...["sam", "theo", "max", "ben", "luca", "isaac", "caleb", "miles", "ravi"].map((scout) => ({
    fund: "scout-accounts" as const,
    type: "event-charge" as const,
    amountCents: -3_500,
    description: "Fall campout fee",
    day: -2,
    scout,
    event: "campout",
  })),
  ...[
    ["sam", 4_200],
    ["theo", 2_100],
    ["ben", 5_600],
    ["caleb", 7_800],
    ["miles", 3_300],
  ].map(([scout, amountCents]) => ({
    fund: "scout-accounts" as const,
    type: "fundraiser-credit" as const,
    amountCents: amountCents as number,
    description: "Popcorn sale credit",
    day: -7,
    scout: scout as string,
  })),
];

export const ANNOUNCEMENTS = [
  { title: "Fall campout sign-ups are open", body: "Sign up on the event page by next Wednesday. Permission slips are signed online.", pinned: true, day: -2 },
  { title: "Merit badge day registration", body: "Pick one station per rotation. Popular stations have a waitlist.", pinned: false, day: -5 },
];

export const POSTS = [
  {
    title: "Lakeside Park cleanup",
    body: "Eight scouts pulled two trailers of buckthorn and swept a mile of trail. The parks crew says thanks!",
    day: -8,
  },
  {
    title: "Congratulations, new ranks!",
    body: "Six scouts advanced at the Fall Court of Honor, including Caleb's Life rank. Photos coming soon.",
    day: -17,
  },
];
