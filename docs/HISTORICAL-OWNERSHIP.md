# Historical ownership manifest

Updated: 2026-09-25. Source: inventory of the isolated Neon branch `multi-user-auth` (2026-09-20), extended on 2026-09-24 from `vercel-preview`, a same-day copy of production (32 games, 15 players).

This manifest records who owns each game from the old shared ledger. Every decision below was made by the user; player names, stakes and overlap were context only and must never decide ownership automatically. **Status:** Rajarshi's 27 games were claimed in production on 2026-09-25. The Emon-led group's and Rahul Basak's games stay unowned and hidden until those hosts sign in.

## Session cohorts and owners

Times are Asia/Kolkata. A cohort groups adjacent sessions with the same participant set only to make review easier; ownership is still decided per session.

| Cohort | Games | Date/time | Starting stack | Players | Owner (decided) |
| --- | --- | --- | --- | --- | --- |
| A | 5 | 2026-07-28 20:39 | 5,000 | Rajarshi, Soham | Rajarshi |
| B | 6–7 | 2026-08-02 18:52–21:15 | 10,000 | Debraj, Rajarshi, Shubhankar, Soham | Rajarshi |
| C | 8 | 2026-08-09 20:27 | 10,000 | Debraj, Rajarshi | Rajarshi |
| D | 9–12 | 2026-08-16 19:13–21:15 | 10,000 | Debraj, Rajarshi, Shubhankar | Rajarshi |
| E | 13–21 | 2026-08-16 22:42 through 2026-08-17 15:16 | 10,000 | Rahul Basak, Rajarshi | Rajarshi |
| F | 22 | 2026-08-30 19:43 | 10,000 | Debraj, Rajarshi, Shubhankar, Soham | Rajarshi |
| G | 23 | 2026-08-30 20:31 | 10,000 | Abhirup, Debraj, Rajarshi, Shubhankar, Soham | Rajarshi |
| H | 24 | 2026-09-04 14:26 | 10,000 | Ashit, Rahul Basak | Rahul Basak (claimed when he signs in) |
| I | 25 | 2026-09-04 15:55 | 10,000 | Rahul Basak, Rana | Rahul Basak (claimed when he signs in) |
| J | 26 | 2026-09-06 20:18 | 10,000 | Debraj, Rajarshi | Rajarshi |
| K | 27–29 | 2026-09-13 20:13–21:27 | 10,000 then 15,000 | Debraj, Rahul Basak, Rajarshi, Shubhankar, Utsav | Rajarshi |
| L | 31 | 2026-09-19 00:55 | 10,000 | Debraj, Pratik, Rajarshi, Shubhankar | Rajarshi |
| M | 32–33 | 2026-09-19 23:39 through 2026-09-20 00:28 | 500,000 then 1,000,000 | Abhirup, Emon, Supratik | Emon-led group (claimed when its host signs in) |
| N | 34–36 | 2026-09-20 18:39–20:13 | 10,000 then 20,000 | Debraj, Rajarshi, Shubhankar, Utsav (36 only) | Rajarshi |
| O | 37 | 2026-09-20 23:25 | 10,000 | Abhirup, Ashish, Emon | Emon-led group (claimed when its host signs in) |

## Player directory

The production directory (2026-09-24) contains Abhirup, Aiush, Ashish, Ashit, Debraj, Emon, Pratik, Rahul Basak, Rajarshi, Rana, Ratan, Shubhankar, Soham, Supratik and Utsav. Aiush and Ratan have no saved session.

Confirmed friend-list ownership:

- Rajarshi's ledger (therajarshiroy@gmail.com): Rajarshi, Debraj, Pratik, Rahul Basak, Ratan, Shubhankar, Soham, Utsav and Abhirup.
- Emon-led group: Emon, Abhirup, Supratik and Ashish. The host's email isn't known yet; the games stay in the unclaimed archive until that host signs in.
- Rahul Basak's ledger: Rahul Basak, Ashit and Rana. The games stay in the unclaimed archive until Rahul signs in.
- Aiush: left out of every friend list by user decision (2026-09-24). His legacy record stays in the unclaimed archive.

Abhirup belongs in both friend lists. His historical results must map to an independent owner-local Abhirup profile in each ledger: cohort G in Rajarshi's ledger and cohorts M and O in the Emon-led ledger. Rahul Basak likewise has one profile in Rajarshi's ledger and another in his own.

For each target host ledger, create independent player profiles from the sessions assigned to that host. A name appearing in multiple hosts' sessions becomes a separate profile in each ledger. Preserve an unused player such as Aiush only when the user explicitly assigns that player to a host's friend list.

## Mapping rules

1. Assign every session to exactly one host account or to the restricted unclaimed legacy archive.
2. Record the target account's stable Auth user ID; never use email or player name as the database ownership key.
3. Create owner-local player profiles and map each historical result to one of them. Do not globally merge same-name profiles.
4. Keep original session and player IDs in migration provenance. Allocate owner-local display numbers independently.
5. Reconcile session counts, participant counts, chip totals, results and discard state before and after backfill.
6. Apply the reviewed manifest only to an isolated branch first. Production migration requires separate authorization.

## Claiming games

`migrations/0008_claim_reviewed_history.sql` adds the owner-only function `claim_reviewed_history(account, game numbers, friend names, decision)`. It copies the listed unowned games into one signed-in host's ledger, creates that host's friend profiles, builds normalized results and buy-ins, records provenance, and refuses a player who isn't on the friend list or a game set that doesn't match. Rerunning it returns 0. The claims below were rehearsed on a throwaway copy of production (2026-09-24): 27, 3 and 2 games, 95 results in total, every total reconciled.

| Host | Legacy game numbers | Friend list | When |
| --- | --- | --- | --- |
| Rajarshi | 5–23, 26–29, 31, 34–36 | Rajarshi, Debraj, Pratik, Rahul Basak, Ratan, Shubhankar, Soham, Utsav, Abhirup | Done 2026-09-25: 27 games, account `4db9f3e6-9b4b-445b-8ca3-831773acdb3c` |
| Emon-led group | 32, 33, 37 | Emon, Abhirup, Supratik, Ashish | After the host signs in; the user supplies the email |
| Rahul Basak | 24, 25 | Rahul Basak, Ashit, Rana | After Rahul signs in; the user supplies the email |

## Review status

- Inventory: complete. 28 sessions and 13 players on the development branch (2026-09-20); production had 32 games and 15 players at cutover.
- Ownership decisions: complete (2026-09-24). Cohorts A–G, J–L and N for Rajarshi; M and O for the Emon-led group; H–I for Rahul Basak.
- Friend-list decisions: complete. Abhirup has profiles in Rajarshi's and Emon's ledgers, Rahul Basak in Rajarshi's and his own; Aiush is in no list.
- Development branch: cohorts A–G and J–L cloned into Rajarshi's ledger by `data/0003` (9 friend profiles, 24 sessions, 72 results reconciled).
- Production: Rajarshi's claim done on 2026-09-25 (27 games, 9 friends; standings matched the rehearsal). Waiting: the Emon-led group (32, 33, 37) and Rahul Basak (24, 25), each once the host signs in and the user supplies the email. Aiush stays in the unclaimed archive. Legacy source rows remain intact.
