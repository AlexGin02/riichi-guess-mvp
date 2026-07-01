# Riichi Guess MVP

A minimal two-player Japanese Riichi Mahjong variant for remote play. Two people open the same deployed URL, create or join a room, play draw/discard until tenpai, guess the wait, and resolve by guessing or locked self-draw trials.

## Local Run

1. Run `npm install`.
2. Run `cp .env.example .env.local`.
3. Fill `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. In Supabase SQL Editor, run all of `supabase/schema.sql`.
5. In Supabase Dashboard -> Database -> Replication, confirm `rooms` is enabled for Realtime.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.
8. Browser A creates a room. Browser B/incognito opens the share link and auto-joins as South.

## Online Deployment

1. Push this project to GitHub.
2. Create a Vercel project from the repo.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
4. Deploy.
5. Open the deployed URL, create a room, and send the share link to your friend.

## Supabase

The app writes:

- `rooms`: authoritative room and `game_state` JSON
- `players`: mirrored player hand/river rows for future hardening

For MVP playability, `supabase/schema.sql` creates permissive anonymous RLS policies for select/insert/update on both tables. This is intentionally permissive for testing with remote friends and is not a production security model.

Realtime sync uses Postgres changes on the active `rooms` row. Every game action updates `rooms.game_state`; the other browser receives that update through Supabase Realtime.

## DEV TEST MODE

During `Draw / Discard`, the current player sees `DEV TEST MODE`.

Fast test:

1. Click `Force known tenpai hand`.
2. Discard `9m`.
3. The game enters guessing.
4. The locked wait is `5m`.
5. Guess `5m` plus any other tile to test guesser win.
6. Reset, force tenpai again, and guess two wrong tiles to test self-draw.

The dev wall is stacked so the first wrong trial misses all 5 draws and returns to guessing; the next wrong trial can hit `5m`.

## Supabase Required

This app is built for remote two-player realtime play. If Supabase env vars are missing, the app shows a setup message and does not start a local one-person demo. Remote play requires Supabase.

## Tests and Build

Run:

```bash
npm test
npm run lint
npm run build
```

Tests cover wall creation, initial deal, winning hands, tenpai waits, guessing, self-draw trials, locked waits, reset preserving seats, and DEV known-tenpai setup.

## Manual Verification

1. Browser A clicks `Create Room`.
2. Browser A confirms East is seated and South is open.
3. Browser B/incognito opens the share link.
4. Browser B auto-joins as South.
5. Browser A discards a tile.
6. Browser B sees East river update immediately.
7. Browser B draws and discards.
8. Browser A sees South river update immediately.
9. Current player clicks `Force known tenpai hand`.
10. Current player discards `9m`.
11. Both browsers enter guessing.
12. Guesser selects `5m` and one other tile.
13. Game over shows guesser win.
14. Reset, force tenpai again, guess two wrong tiles, and run the self-draw trial.

## Troubleshooting

Blank page: run `npm install` and `npm run dev`, check `.env.local`, then check the browser console.

Supabase env missing: add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart.

Room not syncing: in Supabase Dashboard -> Database -> Replication, enable `rooms` for Realtime, re-run `supabase/schema.sql`, and refresh both browsers.

Second player cannot join: use a different browser/incognito/device, check the full room link, and confirm the room does not already have South seated.

Database permission error: re-run `supabase/schema.sql`; it creates permissive anon policies.

Vercel build failure: run `npm install`, `npm run lint`, and `npm run build` locally. Fix the first reported error and confirm Vercel has both env vars.

## MVP Rule Assumptions

- Tenpai is detected after each discard by checking both players' 13-tile hands.
- If both players are tenpai after a discard, East is selected first.
- The app ignores yaku, scoring, riichi sticks, dora, honba, furiten, chombo, kan, ron, and calls.
- A hand can win with 4 melds + 1 pair or seven pairs.
- Kokushi Musou is not implemented.
- Self-draw trials do not alter the tenpai player's hand and do not recalculate waits.
- Guessing uses tile types, not physical tile instances.
- The UI does not render the opponent's full hand.
- Locked waits are not shown before game over, but MVP state is client-accessible through Supabase JSON. True secrecy requires Supabase Edge Functions or another trusted server.
