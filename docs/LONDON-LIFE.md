# Tube Life (design)

> Name decided: **Tube Life**, tagline "Mind the Gap". The life layer exists to give you reasons to travel;
> the transport network is the game. Wealth changes what you own in the city, never whether you ride it.

A life sim set in London, in the spirit of The Sims and Lagos Life, built on the commute game.
You are a new Londoner: you rent a room, hold down a job, look after your needs, see friends,
and every trip across the city is a real commute you plan and ride.

## 1. Pillars

1. **Every trip is a game.** Getting anywhere uses the existing planner, fares and ride events.
   Where you live, where you work and when you travel are the big strategic choices.
2. **Little life decisions with visible consequences.** Eat, sleep, work, go out, save or spend.
   Needs and money push back, but the game never punishes you for being away.
3. **Always a reason to come back.** Something new every real day, something to chase every week,
   and long goals that take weeks (see section 7).
4. **London is real.** Real stations and fare rules, live TfL line status, real neighbourhoods.

## 2. Core loop

```
 Morning at home ─► commute to work ─► work shift ─► evening out (or home) ─► commute home ─► sleep
       ▲                                                                                          │
       └───────────────────────────── day summary: pay, rent, XP, badges ◄────────────────────────┘
```

A game day takes about 5–10 real minutes. Weekends have no work: a free day to explore.

## 3. Systems

### Needs (0–100)
| Need | Falls by | Restored by |
|---|---|---|
| ⚡ Energy | being awake, commuting, working, nights out | sleep, naps, coffee |
| 🍔 Hunger | time (faster than the rest) | breakfast, cooking, food venues |
| 💬 Social | time alone | pubs, gigs, friends, **texting real players** |
| 🎉 Fun | work, stressful commutes | parks, cinema, markets, music |

**Mood** is the weighted average of needs. Mood sets work performance, and therefore pay rises
and promotions. Low needs also show as warnings, never as game over.

### Time
- The day starts at 07:00 at home. Activities and trips advance the clock.
- Peak fares (06:30–09:30 and 16:00–19:00 on weekdays) and weekend off-peak all apply.
- After midnight most lines close. The Night Tube (Victoria, Central, Jubilee, Northern and Piccadilly)
  runs on Friday and Saturday nights; otherwise you take buses, walk or cycle.
- You can only sleep at home. Sleeping later means less energy tomorrow.

### Home and areas
Choose where to live at the start, then move later via the Homes app (one week's rent as a deposit).

| Area | Zone | Rent / week | Flavour |
|---|---|---|---|
| Stratford | 3 | £150 | cheapest, long trips |
| Peckham Rye | 2 | £165 | Overground and buses, great bars |
| Brixton | 2 | £190 | Victoria line straight into town |
| Canada Water | 2 | £205 | Jubilee and Overground |
| Clapham Common | 2 | £225 | Northern line |
| Camden Town | 2 | £250 | Northern line, markets and gigs |
| Shoreditch | 1 | £320 | walk to lots, expensive |

### Work
Pick a workplace, each on the map. Shifts run 09:00–17:00 on weekdays.

| Job | Station | Day pay (level 1 → 5) |
|---|---|---|
| Shop floor → Store manager | Oxford Circus | £75 → £150 |
| Barista → Café owner | King's Cross | £72 → £145 |
| Junior developer → CTO | Shoreditch High St | £90 → £210 |
| Trainee analyst → Partner | Canary Wharf | £95 → £230 |
| Civil servant → Permanent secretary | Westminster | £85 → £180 |

- Arriving by 09:00 counts as on time. Late arrivals lose pay by the minute and performance.
- Not arriving by 11:00 counts as a day off: no pay, and a performance hit.
- During the shift you choose how to work (head down, help the team, slack off), trading
  performance against energy, fun and social.
- Every 100 performance points brings a promotion: a new title and higher pay.

### Money
Wages arrive at the end of each worked day. Rent is due every Sunday night. Fares, food and nights out
come out of your balance. Going overdrawn is allowed, but if you're more than £200 down, Mum bails
you out (with a stern phone call and a mood hit). No game over.

### Venues
Each venue is a real place at a station on the network, with 1–3 activities. Each activity has a cost,
a duration, opening hours or days, and effects on needs. Highlights: Camden Market and gigs, Borough
Market, a West End show, Brixton Village and a Friday club night, a match at Stratford on a Saturday,
St James's Park, the South Bank, a Shoreditch rooftop bar and Hackney pubs. Every venue you visit for
the first time adds a postcard to your collection.

## 4. Social: real players inside the game
- Texting a real player restores Social (capped per game hour), so the phone becomes a need-filler.
- Your status shows where you are ("At Camden Market"). If another online player is at the same place,
  a **Hang out** action appears: a big Social boost for both, and an automatic 👋 text.
- The feed shows promotions, moves and daily challenge results. The League ranks by life level and
  daily scores.

## 5. Daily challenge: "Today in London"
- One commute per real day, the same for every player, generated from the date.
- Closures come from **live TfL line status** (daytime disruptions mapped onto the game network).
  If TfL is down or nothing is disrupted, a seeded random closure is used. The route finder
  confirms it can be finished before it's offered.
- One scored run per day goes on the day's leaderboard. Stars pay cash into your London Life balance.

## 6. Progression
- **Life level** from XP: worked days, on-time arrivals, new venues, daily challenges, badges.
- **Career levels** 1–5 per job.
- **Badges** (about 20): Night Bus Survivor, Hopper Hero, Never Late (5 on-time days in a row),
  Social Butterfly, Explorer (10 venues), Landlord's Favourite (rent paid 4 weeks running), and more.
- **Postcards:** one for each venue and each Commute Challenge mission.

## 7. Reasons to come back

| Timescale | Hook |
|---|---|
| Every visit | Finish today's day: needs to fix, money to make, places to go |
| Every real day | Daily challenge and leaderboard, daily streak with growing rewards, a **rested bonus** after a break |
| Every real week | Weekly league reset, rent day drama, the weekend's special venues |
| Long term | Promotions, moving to a better area, badge and postcard collections |
| Social | Friends online, hang-outs, group chats, beating friends on the daily |

Retention rule: **reward returning, never punish absence.** Needs don't decay while the game is closed;
coming back after a day or more gives a rested bonus instead.

## 8. Phone apps added
- 🏦 **Bank:** balance, transactions, next rent, wages.
- 💼 **Jobs:** career ladder, performance, switching jobs.
- 🔑 **Homes:** areas, rent, moving.
- 📅 **Today:** the daily challenge, its leaderboard and your streak.
- 🏅 **Badges:** achievements.

## 9. Build phases
1. **Phase 1, the playable life (this build):** setup, needs, day loop, home actions, work shifts,
   venues, trips via planner and ride, money and rent, promotions, day summary, local saves, streak and
   rested bonus, daily challenge with live TfL and a leaderboard, badges, postcards, the new phone apps,
   and hang-outs with real players.
2. **Phase 2:** an apartment view (2D) with furniture to buy, relationships with NPCs, random life events
   (a flatmate's party, a birthday), seasons.
3. **Phase 3:** online saves (after security is restored), and friends' homes to visit.

## 10. Status

Phase 1 is built and playable. Measured by simulated players over 8 game weeks: sensible players reach the top job in
about 8 weeks and save £50–£700 a week; late-game money piles up, so Phase 2 needs things to spend it on
(furniture, nicer flats, holidays).

## 11. Balance targets (checked by automated simulation)
- A sensible player (on time, eats, sleeps by midnight, goes out 2–3 times a week) ends each week
  £50–£250 better off in a mid-rent area, and is promoted roughly every 1–2 game weeks.
- A reckless player (always out, always late) drifts into overdraft within about 2 weeks.
- No need-only strategy wins: hermits fail Social and Fun; party animals fail Energy and money.
