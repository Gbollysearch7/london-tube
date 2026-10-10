import { LINE, STATION, isRail } from "./network";
import type { Journey, Rng } from "./engine";
import type { Link } from "./types";

export interface Choice {
  label: string;
  hint: string;
  /** Applies the outcome and returns a short description of what happened. */
  apply: (j: Journey) => string;
}

export interface EventInstance {
  id: string;
  title: string;
  text: string;
  emoji: string;
  choices: Choice[];
}

interface EventDef {
  id: string;
  weight: number;
  when: (link: Link, j: Journey) => boolean;
  make: (link: Link, j: Journey) => Omit<EventInstance, "id">;
}

const money = (n: number) => `£${n.toFixed(2)}`;

const EVENTS: EventDef[] = [
  {
    id: "signal-failure",
    weight: 3,
    when: (l) => isRail(l.mode),
    make: (l) => ({
      emoji: "🚦",
      title: "Signal failure",
      text: `"We're being held at a red signal due to a signal failure ahead." Your ${LINE[l.line].name} train sits still in the tunnel.`,
      choices: [
        {
          label: "Wait it out",
          hint: "Free · could be 3–14 min",
          apply: (j) => {
            const m = j.rollInt(3, 14);
            j.delay(m);
            j.addStress(m * 0.8);
            return m <= 5 ? `Moving again after ${m} min. Phew.` : `Stuck for ${m} long minutes.`;
          },
        },
        {
          label: "Get off and grab a bus",
          hint: "~6–9 min · bus fare unless Hopper is running",
          apply: (j) => {
            const m = j.rollInt(6, 9);
            const paid = j.meter.busTap(j.clock, "Diversion bus");
            j.delay(m);
            j.addStress(3);
            return paid ? `Bus diversion cost ${money(paid)} and ${m} min.` : `Hopper covered the diversion bus. Lost ${m} min.`;
          },
        },
      ],
    }),
  },
  {
    id: "crowded",
    weight: 3,
    when: (l, j) => (l.mode === "tube" || l.mode === "elizabeth") && j.peak,
    make: () => ({
      emoji: "🥵",
      title: "Rammed carriage",
      text: "The doors open onto a wall of commuters. Somebody's armpit is at eye level.",
      choices: [
        {
          label: "Squeeze in",
          hint: "No delay · much more stress",
          apply: (j) => {
            j.addStress(12);
            return "You made it on. Your personal space did not.";
          },
        },
        {
          label: "Wait for the next one",
          hint: "+2–4 min · calmer",
          apply: (j) => {
            const m = j.rollInt(2, 4);
            j.delay(m);
            j.addStress(-3);
            return `Next train had room. Lost ${m} min.`;
          },
        },
      ],
    }),
  },
  {
    id: "seat",
    weight: 2,
    when: (l) => isRail(l.mode) && l.minutes >= 3,
    make: () => ({
      emoji: "💺",
      title: "A seat opens up",
      text: "Someone gets off and a seat is free. The doors you'll exit from are at the other end of the carriage.",
      choices: [
        {
          label: "Grab the seat",
          hint: "Calmer ride",
          apply: (j) => {
            j.addStress(-8);
            return "Bliss. You sat down.";
          },
        },
        {
          label: "Stand by the exit doors",
          hint: "−1 min at the other end",
          apply: (j) => {
            j.delay(-Math.min(1, j.remaining - 0.1));
            return "You're first off. Every second counts.";
          },
        },
      ],
    }),
  },
  {
    id: "busker",
    weight: 1,
    when: (l) => l.mode === "tube",
    make: () => ({
      emoji: "🎷",
      title: "Busker in the corridor",
      text: "A saxophonist is playing a smooth cover of a 90s hit as you pass through the interchange.",
      choices: [
        {
          label: "Tip £1",
          hint: "−£1.00 · good vibes",
          apply: (j) => {
            j.meter.add("Tip for the busker", 1, j.clock);
            j.addStress(-8);
            return "They nodded. Your day got a little better.";
          },
        },
        { label: "Keep walking", hint: "Nothing changes", apply: () => "You kept your head down." },
      ],
    }),
  },
  {
    id: "card-clash",
    weight: 1,
    when: (l) => isRail(l.mode) || l.mode === "bus",
    make: () => ({
      emoji: "💳",
      title: "Card clash!",
      text: "You tapped your whole wallet on the reader, and two contactless cards are in there.",
      choices: [
        {
          label: "Stop and tap the right card",
          hint: "+1 min",
          apply: (j) => {
            j.delay(1);
            return "Sorted. Only one card charged.";
          },
        },
        {
          label: "Hope for the best",
          hint: "50% chance of an extra fare",
          apply: (j) => {
            if (j.roll() < 0.5) {
              j.meter.add("Card clash, charged twice", 2.8, j.clock);
              j.addStress(5);
              return "The wrong card got charged as well. −£2.80.";
            }
            return "Lucky! Only one card registered.";
          },
        },
      ],
    }),
  },
  {
    id: "traffic",
    weight: 3,
    when: (l) => l.mode === "bus",
    make: (l) => ({
      emoji: "🚧",
      title: "Gridlock",
      text: `Roadworks. The ${LINE[l.line].name} is crawling behind a queue of black cabs.`,
      choices: [
        {
          label: "Stay on",
          hint: "Free · 2–10 min",
          apply: (j) => {
            const m = j.rollInt(2, 10);
            j.delay(m);
            j.addStress(m * 0.5);
            return `Traffic cleared after ${m} min.`;
          },
        },
        {
          label: "Hop off and walk",
          hint: "+3–5 min · less stress",
          apply: (j) => {
            const m = j.rollInt(3, 5);
            j.delay(m);
            j.addStress(-2);
            return `Legs beat traffic. Lost ${m} min.`;
          },
        },
      ],
    }),
  },
  {
    id: "terminates",
    weight: 1,
    when: (l) => l.mode === "bus",
    make: () => ({
      emoji: "🛑",
      title: '"This bus terminates here"',
      text: "The driver cuts the route short. Everybody off.",
      choices: [
        {
          label: "Wait for the next bus",
          hint: "4–8 min · free on the Hopper",
          apply: (j) => {
            const m = j.rollInt(4, 8);
            const paid = j.meter.busTap(j.clock, "Replacement bus");
            j.delay(m);
            j.addStress(4);
            return paid ? `Next bus in ${m} min, plus a new fare.` : `Next bus in ${m} min. Hopper covered it.`;
          },
        },
        {
          label: "Hail a cab",
          hint: "−£12 · faster",
          apply: (j) => {
            j.meter.add("Black cab", 12, j.clock);
            j.delay(-Math.min(2, j.remaining - 0.1));
            return "Expensive, but quick.";
          },
        },
      ],
    }),
  },
  {
    id: "tourist",
    weight: 2,
    when: (l) => l.mode === "walk" || isRail(l.mode),
    make: () => ({
      emoji: "🗺️",
      title: "Lost tourist",
      text: '"Excuse me, which way to Buckingham Palace?" They look desperate.',
      choices: [
        {
          label: "Help them out",
          hint: "+2 min · feel-good",
          apply: (j) => {
            j.delay(2);
            j.addStress(-6);
            return "They thanked you warmly. London karma +1.";
          },
        },
        {
          label: "Point vaguely and keep moving",
          hint: "No delay",
          apply: (j) => {
            j.addStress(2);
            return "You pointed vaguely south-west. Probably fine.";
          },
        },
      ],
    }),
  },
  {
    id: "downpour",
    weight: 4,
    when: (l, j) => (l.mode === "walk" || l.mode === "bike") && j.rain,
    make: () => ({
      emoji: "🌧️",
      title: "The heavens open",
      text: "Sideways London drizzle turns into a proper downpour.",
      choices: [
        {
          label: "Buy an umbrella",
          hint: "−£6.00 · stay dry",
          apply: (j) => {
            j.meter.add("Emergency umbrella", 6, j.clock);
            return "£6 for an umbrella that will break next week.";
          },
        },
        {
          label: "Get wet",
          hint: "+stress",
          apply: (j) => {
            j.addStress(12);
            return "Soaked through. You squelch onwards.";
          },
        },
      ],
    }),
  },
  {
    id: "coffee",
    weight: 1,
    when: (l) => l.mode === "walk",
    make: () => ({
      emoji: "☕",
      title: "Coffee cart",
      text: "A cart is selling flat whites. The smell is incredible.",
      choices: [
        {
          label: "Buy a flat white",
          hint: "−£3.60 · +1 min · calmer",
          apply: (j) => {
            j.meter.add("Flat white", 3.6, j.clock);
            j.delay(1);
            j.addStress(-10);
            return "Caffeine acquired.";
          },
        },
        { label: "Resist", hint: "Save money", apply: () => "Willpower of steel." },
      ],
    }),
  },
  {
    id: "dock-full",
    weight: 3,
    when: (l) => l.mode === "bike",
    make: (l) => ({
      emoji: "🚲",
      title: "Docking station full",
      text: `Every dock near ${STATION[l.to].name} is taken.`,
      choices: [
        {
          label: "Ride to the next dock",
          hint: "+4 min",
          apply: (j) => {
            j.delay(4);
            j.addStress(3);
            return "Found a space two streets away.";
          },
        },
        {
          label: "Wait for a space",
          hint: "1–8 min",
          apply: (j) => {
            const m = j.rollInt(1, 8);
            j.delay(m);
            j.addStress(m * 0.6);
            return `A space came free after ${m} min.`;
          },
        },
      ],
    }),
  },
  {
    id: "river-view",
    weight: 3,
    when: (l) => l.mode === "boat",
    make: () => ({
      emoji: "🌉",
      title: "Tower Bridge is lifting",
      text: "The bascules rise as a tall ship glides through. The deck goes quiet.",
      choices: [
        {
          label: "Take a photo",
          hint: "Calmer",
          apply: (j) => {
            j.addStress(-10);
            return "Great shot. Very London.";
          },
        },
        {
          label: "Answer emails instead",
          hint: "Nothing changes",
          apply: (j) => {
            j.addStress(2);
            return "Inbox zero, view missed.";
          },
        },
      ],
    }),
  },
];

export function pickEvent(j: Journey, link: Link, rng: Rng): EventInstance | null {
  const options = EVENTS.filter((e) => e.when(link, j));
  const total = options.reduce((s, e) => s + e.weight, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const e of options) {
    r -= e.weight;
    if (r <= 0) return { id: e.id, ...e.make(link, j) };
  }
  return null;
}
