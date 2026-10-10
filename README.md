# Mind the Gap: a London commute game

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
