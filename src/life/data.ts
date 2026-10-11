// The world of London Life: where you can live, work and go.

export type NeedKey = "energy" | "hunger" | "social" | "fun";
export type Needs = Record<NeedKey, number>;

export interface Area {
  /** Station id of the home. */
  id: string;
  name: string;
  rent: number; // per week
  blurb: string;
}

export const AREAS: Area[] = [
  { id: "stratford", name: "Stratford", rent: 150, blurb: "Zone 3 and the cheapest rent. Long trips, but the Jubilee, Elizabeth, Central and DLR all start here." },
  { id: "peckham", name: "Peckham Rye", rent: 165, blurb: "Overground and buses, rooftop bars and Saturday buzz." },
  { id: "brixton", name: "Brixton", rent: 190, blurb: "Victoria line straight into the West End. Brixton Village on your doorstep." },
  { id: "canadawater", name: "Canada Water", rent: 205, blurb: "Jubilee and Overground. Quiet docks, quick to Canary Wharf." },
  { id: "claphamcommon", name: "Clapham Common", rent: 225, blurb: "Northern line, a huge common and Sunday picnics." },
  { id: "camden", name: "Camden Town", rent: 250, blurb: "Northern line, markets and gigs every night." },
  { id: "shoreditch", name: "Shoreditch", rent: 320, blurb: "Zone 1. Walk to half of East London. Your wallet will feel it." },
];

export interface Job {
  id: string;
  /** Workplace station. */
  station: string;
  place: string;
  titles: [string, string, string, string, string];
  pay: [number, number, number, number, number]; // per full day, by level
}

export const JOBS: Job[] = [
  {
    id: "retail",
    station: "oxford",
    place: "a flagship store on Oxford Street",
    titles: ["Shop floor assistant", "Senior sales", "Supervisor", "Assistant manager", "Store manager"],
    pay: [75, 90, 108, 128, 150],
  },
  {
    id: "cafe",
    station: "kingscross",
    place: "a café in Coal Drops Yard",
    titles: ["Barista", "Head barista", "Shift lead", "Café manager", "Café owner"],
    pay: [72, 86, 104, 124, 145],
  },
  {
    id: "tech",
    station: "shoreditch",
    place: "a start-up off Shoreditch High Street",
    titles: ["Junior developer", "Developer", "Senior developer", "Lead engineer", "CTO"],
    pay: [90, 112, 140, 172, 210],
  },
  {
    id: "finance",
    station: "canarywharf",
    place: "a bank tower in Canary Wharf",
    titles: ["Trainee analyst", "Analyst", "Associate", "Vice president", "Partner"],
    pay: [95, 118, 148, 185, 230],
  },
  {
    id: "civil",
    station: "westminster",
    place: "a government department in Westminster",
    titles: ["Civil servant", "Policy officer", "Senior adviser", "Director", "Permanent secretary"],
    pay: [85, 102, 124, 150, 180],
  },
];

export const SHIFT_START = 9 * 60;
export const SHIFT_END = 17 * 60;
/** Turning up after this counts as a missed day. */
export const SHIFT_CUTOFF = 11 * 60;

export interface Activity {
  id: string;
  label: string;
  emoji: string;
  cost: number;
  minutes: number;
  effects: Partial<Needs>;
  /** Open window in minutes after midnight (may run past 24:00). */
  opens?: number;
  closes?: number;
  days?: "weekend" | "weekday" | "friday-saturday" | "saturday";
  xp?: number;
}

export interface Venue {
  id: string;
  station: string;
  name: string;
  emoji: string;
  activities: Activity[];
}

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const VENUES: Venue[] = [
  {
    id: "camden-market",
    station: "camden",
    name: "Camden Market",
    emoji: "🎸",
    activities: [
      { id: "street-food", label: "Street food crawl", emoji: "🌮", cost: 11, minutes: 60, effects: { hunger: 50, fun: 15 }, opens: h(10), closes: h(21) },
      { id: "gig", label: "Gig at the Roundhouse", emoji: "🎤", cost: 22, minutes: 150, effects: { fun: 45, social: 25, energy: -15 }, opens: h(19), closes: h(23), xp: 15 },
    ],
  },
  {
    id: "borough",
    station: "londonbridge",
    name: "Borough Market",
    emoji: "🧀",
    activities: [
      { id: "borough-lunch", label: "Graze the stalls", emoji: "🥪", cost: 13, minutes: 60, effects: { hunger: 55, fun: 12 }, opens: h(10), closes: h(17) },
      { id: "riverside-drinks", label: "Riverside drinks", emoji: "🍻", cost: 14, minutes: 90, effects: { social: 30, fun: 15, energy: -8 }, opens: h(17), closes: h(23) },
    ],
  },
  {
    id: "west-end",
    station: "leicester",
    name: "West End",
    emoji: "🎭",
    activities: [
      { id: "cinema", label: "Cinema", emoji: "🍿", cost: 16, minutes: 150, effects: { fun: 40, energy: -5 }, opens: h(12), closes: h(23, 30) },
      { id: "show", label: "West End show", emoji: "🎭", cost: 48, minutes: 180, effects: { fun: 65, social: 15, energy: -12 }, opens: h(19), closes: h(23), xp: 20 },
    ],
  },
  {
    id: "southbank",
    station: "waterloo",
    name: "South Bank",
    emoji: "🎡",
    activities: [
      { id: "riverwalk", label: "Walk along the river", emoji: "🚶", cost: 0, minutes: 60, effects: { fun: 18, energy: -6 }, opens: h(7), closes: h(23) },
      { id: "book-market", label: "Browse the book market", emoji: "📚", cost: 6, minutes: 45, effects: { fun: 15 }, opens: h(11), closes: h(19), days: "weekend" },
    ],
  },
  {
    id: "stjames",
    station: "westminster",
    name: "St James's Park",
    emoji: "🦢",
    activities: [{ id: "feed-ducks", label: "Lunch by the lake", emoji: "🦆", cost: 5, minutes: 45, effects: { hunger: 25, fun: 12 }, opens: h(8), closes: h(20) }],
  },
  {
    id: "westfield",
    station: "stratford",
    name: "Stratford",
    emoji: "🏟️",
    activities: [
      { id: "shopping", label: "Westfield shopping", emoji: "🛍️", cost: 30, minutes: 90, effects: { fun: 30, energy: -8 }, opens: h(10), closes: h(21) },
      { id: "match", label: "Match at the stadium", emoji: "⚽", cost: 40, minutes: 180, effects: { fun: 60, social: 35, energy: -15 }, opens: h(12), closes: h(18), days: "saturday", xp: 20 },
    ],
  },
  {
    id: "canary-gym",
    station: "canarywharf",
    name: "Canary Wharf",
    emoji: "🏙️",
    activities: [
      { id: "gym", label: "Gym session", emoji: "🏋️", cost: 9, minutes: 60, effects: { fun: 15, energy: -10, hunger: -10 }, opens: h(6), closes: h(22), xp: 8 },
      { id: "after-work", label: "After-work drinks", emoji: "🥂", cost: 18, minutes: 90, effects: { social: 35, fun: 15, energy: -8 }, opens: h(17), closes: h(23), days: "weekday" },
    ],
  },
  {
    id: "brixton-village",
    station: "brixton",
    name: "Brixton Village",
    emoji: "🌶️",
    activities: [
      { id: "brixton-food", label: "Dinner at Brixton Village", emoji: "🍛", cost: 12, minutes: 60, effects: { hunger: 50, social: 12 }, opens: h(11), closes: h(23) },
      { id: "club", label: "Club night", emoji: "🪩", cost: 20, minutes: 180, effects: { fun: 55, social: 35, energy: -30 }, opens: h(22), closes: h(27), days: "friday-saturday", xp: 15 },
    ],
  },
  {
    id: "clapham-park",
    station: "claphamcommon",
    name: "Clapham Common",
    emoji: "🌳",
    activities: [{ id: "picnic", label: "Picnic on the common", emoji: "🧺", cost: 7, minutes: 75, effects: { fun: 20, social: 15, hunger: 25 }, opens: h(9), closes: h(20) }],
  },
  {
    id: "hackney-pub",
    station: "hackney",
    name: "Hackney",
    emoji: "🍺",
    activities: [{ id: "pub", label: "Pub with mates", emoji: "🍺", cost: 13, minutes: 120, effects: { social: 40, fun: 15, energy: -10 }, opens: h(12), closes: h(23, 30) }],
  },
  {
    id: "portobello",
    station: "nhg",
    name: "Portobello Road",
    emoji: "🏺",
    activities: [{ id: "portobello", label: "Portobello market", emoji: "🧭", cost: 10, minutes: 90, effects: { fun: 30, social: 10 }, opens: h(9), closes: h(17), days: "saturday", xp: 10 }],
  },
  {
    id: "shoreditch-roof",
    station: "shoreditch",
    name: "Shoreditch",
    emoji: "🌆",
    activities: [
      { id: "rooftop", label: "Rooftop bar", emoji: "🍸", cost: 15, minutes: 90, effects: { social: 30, fun: 20, energy: -8 }, opens: h(17), closes: h(25) },
      { id: "brunch", label: "Bottomless brunch", emoji: "🥂", cost: 35, minutes: 120, effects: { social: 40, fun: 30, hunger: 45, energy: -10 }, opens: h(11), closes: h(15), days: "weekend", xp: 10 },
    ],
  },
  {
    id: "peckham-roof",
    station: "peckham",
    name: "Peckham",
    emoji: "🌇",
    activities: [{ id: "franks", label: "Sunset rooftop drinks", emoji: "🌅", cost: 12, minutes: 90, effects: { social: 30, fun: 20, energy: -6 }, opens: h(16), closes: h(23) }],
  },
  {
    id: "kx-yard",
    station: "kingscross",
    name: "Coal Drops Yard",
    emoji: "☕",
    activities: [{ id: "kx-browse", label: "Wander the canal side", emoji: "🛶", cost: 0, minutes: 45, effects: { fun: 12 }, opens: h(8), closes: h(22) }],
  },
  {
    id: "oxford-st",
    station: "oxford",
    name: "Oxford Street",
    emoji: "🛍️",
    activities: [{ id: "oxford-shop", label: "Shopping spree", emoji: "👟", cost: 35, minutes: 90, effects: { fun: 30, energy: -10 }, opens: h(10), closes: h(21) }],
  },
];

/** Things you can do at home. */
export const HOME_ACTIVITIES: Activity[] = [
  { id: "breakfast", label: "Make breakfast", emoji: "🍳", cost: 2, minutes: 20, effects: { hunger: 30 }, opens: h(5), closes: h(12) },
  { id: "cook", label: "Cook dinner", emoji: "🍝", cost: 5, minutes: 45, effects: { hunger: 50, fun: 5 }, opens: h(16), closes: h(24) },
  { id: "snack", label: "Raid the fridge", emoji: "🥪", cost: 2, minutes: 10, effects: { hunger: 18 } },
  { id: "nap", label: "Nap", emoji: "😴", cost: 0, minutes: 60, effects: { energy: 18, hunger: -4 } },
  { id: "tv", label: "Watch telly", emoji: "📺", cost: 0, minutes: 60, effects: { fun: 15, energy: -2 } },
  { id: "call", label: "Call home", emoji: "📞", cost: 0, minutes: 30, effects: { social: 15 } },
  { id: "flatmates", label: "Games night with flatmates", emoji: "🎲", cost: 4, minutes: 120, effects: { social: 30, fun: 25, energy: -6 }, opens: h(18), closes: h(24) },
];

/** Available anywhere that isn't home. */
export const STREET_ACTIVITIES: Activity[] = [
  { id: "coffee", label: "Grab a coffee", emoji: "☕", cost: 3.6, minutes: 10, effects: { energy: 10, fun: 2 } },
  { id: "meal-deal", label: "Meal deal", emoji: "🥪", cost: 4, minutes: 15, effects: { hunger: 30 } },
];

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const BADGES: Badge[] = [
  { id: "first-day", name: "First Day", emoji: "🪪", description: "Work your first shift" },
  { id: "punctual", name: "Never Late", emoji: "⏱️", description: "Arrive on time 5 workdays in a row" },
  { id: "promoted", name: "Moving Up", emoji: "📈", description: "Get your first promotion" },
  { id: "top-job", name: "Top of the Ladder", emoji: "👑", description: "Reach level 5 in any job" },
  { id: "explorer", name: "Explorer", emoji: "🧭", description: "Visit 5 different venues" },
  { id: "londoner", name: "True Londoner", emoji: "🎡", description: "Visit 12 different venues" },
  { id: "night-owl", name: "Night Owl", emoji: "🦉", description: "Get home after 1am" },
  { id: "night-bus", name: "Night Bus Survivor", emoji: "🚌", description: "Ride a bus after midnight" },
  { id: "hopper", name: "Hopper Hero", emoji: "🎫", description: "Ride two buses for one fare" },
  { id: "social", name: "Social Butterfly", emoji: "🦋", description: "Keep Social above 80 at the end of a day" },
  { id: "texter", name: "Group Chat Legend", emoji: "💬", description: "Text other players 10 times" },
  { id: "hangout", name: "Bumped Into You", emoji: "🤝", description: "Hang out with another player" },
  { id: "rent", name: "Landlord's Favourite", emoji: "🏠", description: "Pay rent 4 weeks running without going overdrawn" },
  { id: "saver", name: "Rainy Day Fund", emoji: "💰", description: "Have £1,000 in the bank" },
  { id: "mover", name: "New Postcode", emoji: "📦", description: "Move to a new area" },
  { id: "daily", name: "Daily Commuter", emoji: "📅", description: "Finish a daily challenge" },
  { id: "streak-7", name: "Week Streak", emoji: "🔥", description: "Play 7 real days in a row" },
  { id: "perfect", name: "Perfect Day", emoji: "🌟", description: "End a day with every need above 60" },
];

export const BADGE: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));
export const AREA: Record<string, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a]));
export const JOB: Record<string, Job> = Object.fromEntries(JOBS.map((j) => [j.id, j]));
export const VENUE: Record<string, Venue> = Object.fromEntries(VENUES.map((v) => [v.id, v]));
