# Play Today Deployment Checklist

## Supabase

- [ ] Create a Supabase project.
- [ ] Open Supabase SQL Editor.
- [ ] Paste and run all of `supabase/schema.sql`.
- [ ] Open Database -> Replication.
- [ ] Confirm `rooms` is enabled under `supabase_realtime`.
- [ ] Copy the project URL.
- [ ] Copy the anon public key.

## Local Smoke Test

- [ ] Run `npm install`.
- [ ] Run `cp .env.example .env.local`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run dev`.
- [ ] Open `http://localhost:3000`.
- [ ] Create a room.
- [ ] Open the share link in incognito or a second browser.
- [ ] Confirm the second browser auto-joins as South.
- [ ] Discard from East and confirm South updates.
- [ ] Draw/discard from South and confirm East updates.
- [ ] Use `DEV TEST MODE`.
- [ ] Discard `9m`.
- [ ] Guess `5m` and confirm game over.

## Vercel

- [ ] Push the repo to GitHub.
- [ ] Create a Vercel project from the repo.
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Deploy.
- [ ] Open the deployed URL.
- [ ] Create a room.
- [ ] Send the share link to your friend.
- [ ] Confirm your friend auto-joins as South.
- [ ] Play one normal discard/draw/discard round.
- [ ] Use `DEV TEST MODE` once to verify guessing and self-draw.
