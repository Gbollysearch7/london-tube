# Tube Life

*Mind the Gap: your London life, one commute at a time.*

Plan your way across London by Tube, Elizabeth line, Overground, DLR, rail, bus, river bus, hire bike or on foot.
Arrive **on time**, stay **under budget** and keep your **stress** down.

## How it plays

1. **Plan**: each mission gives you a start, a destination, a leave time, a deadline and a budget, plus conditions like
   rain, strikes or engineering works. Build a route hop by hop. Every option shows the time and money it adds.
2. **Ride**: watch the journey play out on the map at 1×, **2×** or **4×** speed, or **Skip** ahead. Things that
   need a decision (signal failures, rammed carriages, gridlock, full bike docks, card clash…) still stop you.
3. **Score**: ★ on time, ★ under budget, ★ calm (stress 50 or under). Earn a star to unlock the next mission.

### Fare rules (game-scale, modelled on London's real ones)

- Rail fares depend on the zones you pass through and on **peak** time (weekdays 06:30–09:30 and 16:00–19:00).
- Changing lines inside the barriers counts as one journey. Leaving the barriers starts a new fare.
- **Bus Hopper**: £1.75, and unlimited extra buses within 60 minutes of your first tap.
- Hire bikes: £1.65 per 30 minutes. River bus: £5.20 flat.

Fares, times and routes are simplified for the game. They are not live data.

## Game modes

- **🏙️ Your Tube Life:** the main mode. Rent a room in a real area, hold down a job, and keep your Energy, Hunger, Social and Fun
  up. Every trip (to work, to Camden Market, home at 2am on the night bus) is a real commute you plan and ride.
  Get promoted, move house, collect postcards and badges. Design: [docs/LONDON-LIFE.md](docs/LONDON-LIFE.md).
- **📅 Today in London:** one commute per real day, the same for every player, with closures from live TfL.
  Your first run goes on the day's leaderboard and pays into your Tube Life bank.
- **🚇 Commute Challenges:** the 10 hand-made missions.

Inside your life: six characters who text you (your flatmate Jess, best mate Dele, your manager, Mum, Sam and a work mate)
with invites to meet at real places at real times; 12-week seasons with report cards and weekly transport goals; a shop
of travelcards, railcards, a bike, home upgrades and your own coffee cart at a station; one-tap routine commutes; daily
fare caps; realistic delays and strikes; and sound, confetti and haptics. The phone is an iPhone with live widgets.

Reasons to come back: a daily streak bonus, a rested bonus after time away (absence is never punished), the daily
challenge and its leaderboard, promotions, postcards, badges, and friends to text and hang out with.

Your life saves in your browser. Balance is checked by simulated players in `src/life/sim.ts` (`npm test`).

## The phone

Press **P** or the 📱 button to open your in-game phone, even mid-journey. It has 22 apps: Messages and Contacts
(text other players live), Go, Line Status and Arrivals (live from TfL), Oyster, Clock, Weather, Fare Finder,
The Commute (live feed), League, Today, Bank, Jobs, Homes, Badges, Postcards, Tunes, Tips, Invite, Help and Settings.

- **Texting** runs on Supabase (`.env` holds the project URL and publishable key).
  ⚠️ It is in **test mode with no sign-in**: see [SECURITY-TODO.md](SECURITY-TODO.md) before any public release.
- **Testing two players on one computer:** open a second window with `?player=2` on the URL. Each `?player=` value is
  a separate player.
- **Live TfL data:** Line Status and Arrivals call the TfL Unified API directly. It works without a key at low volume;
  set `VITE_TFL_APP_KEY` (free from the TfL API portal) for higher limits. Powered by TfL Open Data.
  Missions still run on the game's own network, so they're always solvable.

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # game logic tests (fares, engine, every mission is solvable)
npm run build    # type-check and production build
```

### Code map

- `src/game/network.ts`: stations, lines, routes and walking links; journey times come from real distances
- `src/game/fares.ts`: fare meter (zones, peak, Hopper, bikes, boats)
- `src/game/engine.ts`: `Journey` simulation used both for planning estimates and for the live ride
- `src/game/events.ts`: random commute events and their choices
- `src/game/solver.ts`: route search used for hints, results benchmarks and tests
- `src/game/missions.ts`: the mission list
- `src/components/`: menu, planner, ride and results screens, plus the SVG map

### Adding a mission

Add an entry to `src/game/missions.ts`, then run `npm test`. The test suite checks that every mission can be
finished on time within its budget.
