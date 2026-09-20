# Historical ownership manifest

Updated: 2026-09-20. Source: read-only inventory of the isolated Neon branch `multi-user-auth`. Production was not queried or changed.

This manifest is the review input for assigning the legacy shared ledger to host accounts. Every cohort is deliberately unassigned. Player names, stakes and overlap are context only and must never determine ownership automatically.

## Session cohorts awaiting owner confirmation

Times are Asia/Kolkata. A cohort groups adjacent sessions with the same participant set only to make review easier; ownership is still decided per session.

| Cohort | Games | Date/time | Starting stack | Players | Proposed owner |
| --- | --- | --- | --- | --- | --- |
| A | 5 | 2026-07-28 20:39 | 5,000 | Rajarshi, Soham | Rajarshi |
| B | 6–7 | 2026-08-02 18:52–21:15 | 10,000 | Debraj, Rajarshi, Shubhankar, Soham | Rajarshi |
| C | 8 | 2026-08-09 20:27 | 10,000 | Debraj, Rajarshi | Rajarshi |
| D | 9–12 | 2026-08-16 19:13–21:15 | 10,000 | Debraj, Rajarshi, Shubhankar | Rajarshi |
| E | 13–21 | 2026-08-16 22:42 through 2026-08-17 15:16 | 10,000 | Rahul Basak, Rajarshi | Rajarshi |
| F | 22 | 2026-08-30 19:43 | 10,000 | Debraj, Rajarshi, Shubhankar, Soham | Rajarshi |
| G | 23 | 2026-08-30 20:31 | 10,000 | Abhirup, Debraj, Rajarshi, Shubhankar, Soham | Rajarshi |
| H | 24 | 2026-09-04 14:26 | 10,000 | Ashit, Rahul Basak | Unresolved |
| I | 25 | 2026-09-04 15:55 | 10,000 | Rahul Basak, Rana | Unresolved |
| J | 26 | 2026-09-06 20:18 | 10,000 | Debraj, Rajarshi | Rajarshi |
| K | 27–29 | 2026-09-13 20:13–21:27 | 10,000 then 15,000 | Debraj, Rahul Basak, Rajarshi, Shubhankar, Utsav | Rajarshi |
| L | 31 | 2026-09-19 00:55 | 10,000 | Debraj, Pratik, Rajarshi, Shubhankar | Rajarshi |
| M | 32–33 | 2026-09-19 23:39 through 2026-09-20 00:28 | 500,000 then 1,000,000 | Abhirup, Emon, Supratik | Emon-led group; target host account TBD |

## Player directory awaiting review

The shared directory currently contains Abhirup, Aiush, Ashit, Debraj, Emon, Pratik, Rahul Basak, Rajarshi, Rana, Shubhankar, Soham, Supratik and Utsav. Aiush has no saved session in this inventory. Ratan is a confirmed member of Rajarshi's friend list but does not appear in the historical directory or sessions.

Confirmed friend-list ownership:

- Rajarshi's ledger: Rajarshi, Debraj, Pratik, Rahul Basak, Ratan, Shubhankar, Soham, Utsav and Abhirup.
- Emon-led group: Emon, Abhirup and Supratik. The eventual host account is still to be confirmed.
- Unresolved: Aiush, Ashit and Rana.

Abhirup belongs in both friend lists. His historical results must map to an independent owner-local Abhirup profile in each ledger: cohort G in Rajarshi's ledger and cohort M in the Emon-led ledger.

For each target host ledger, create independent player profiles from the sessions assigned to that host. A name appearing in multiple hosts' sessions becomes a separate profile in each ledger. Preserve an unused player such as Aiush only when the user explicitly assigns that player to a host's friend list.

## Mapping rules

1. Assign every session to exactly one host account or to the restricted unclaimed legacy archive.
2. Record the target account's stable Auth user ID; never use email or player name as the database ownership key.
3. Create owner-local player profiles and map each historical result to one of them. Do not globally merge same-name profiles.
4. Keep original session and player IDs in migration provenance. Allocate owner-local display numbers independently.
5. Reconcile session counts, participant counts, chip totals, results and discard state before and after backfill.
6. Apply the reviewed manifest only to an isolated branch first. Production migration requires separate authorization.

## Review status

- Inventory: complete, 28 sessions and 13 player records.
- Ownership decisions: cohorts A–G and J–L confirmed for Rajarshi; cohort M confirmed for a separate Emon-led group whose host account is pending; cohorts H–I remain unresolved.
- Friend-list decisions: two owner-local profiles are required for Abhirup; Aiush, Ashit and Rana remain unresolved; Ratan is confirmed for Rajarshi but has no historical record.
- Isolated database backfill: cohorts A–G and J–L cloned into Rajarshi's private ledger with provenance; 9 friend profiles, 24 sessions and 72 results reconciled. Legacy source rows remain intact. Cohorts H–I and M remain unowned.
- Production backfill: not started or authorized.
- Production changes: none.
