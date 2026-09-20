# Historical ownership manifest

Updated: 2026-09-20. Source: read-only inventory of the isolated Neon branch `multi-user-auth`. Production was not queried or changed.

This manifest is the review input for assigning the legacy shared ledger to host accounts. Every cohort is deliberately unassigned. Player names, stakes and overlap are context only and must never determine ownership automatically.

## Session cohorts awaiting owner confirmation

Times are Asia/Kolkata. A cohort groups adjacent sessions with the same participant set only to make review easier; ownership is still decided per session.

| Cohort | Games | Date/time | Starting stack | Players | Proposed owner |
| --- | --- | --- | --- | --- | --- |
| A | 5 | 2026-07-28 20:39 | 5,000 | Rajarshi, Soham | Unassigned |
| B | 6–7 | 2026-08-02 18:52–21:15 | 10,000 | Debraj, Rajarshi, Shubhankar, Soham | Unassigned |
| C | 8 | 2026-08-09 20:27 | 10,000 | Debraj, Rajarshi | Unassigned |
| D | 9–12 | 2026-08-16 19:13–21:15 | 10,000 | Debraj, Rajarshi, Shubhankar | Unassigned |
| E | 13–21 | 2026-08-16 22:42 through 2026-08-17 15:16 | 10,000 | Rahul Basak, Rajarshi | Unassigned |
| F | 22 | 2026-08-30 19:43 | 10,000 | Debraj, Rajarshi, Shubhankar, Soham | Unassigned |
| G | 23 | 2026-08-30 20:31 | 10,000 | Abhirup, Debraj, Rajarshi, Shubhankar, Soham | Unassigned |
| H | 24 | 2026-09-04 14:26 | 10,000 | Ashit, Rahul Basak | Unassigned |
| I | 25 | 2026-09-04 15:55 | 10,000 | Rahul Basak, Rana | Unassigned |
| J | 26 | 2026-09-06 20:18 | 10,000 | Debraj, Rajarshi | Unassigned |
| K | 27–29 | 2026-09-13 20:13–21:27 | 10,000 then 15,000 | Debraj, Rahul Basak, Rajarshi, Shubhankar, Utsav | Unassigned |
| L | 31 | 2026-09-19 00:55 | 10,000 | Debraj, Pratik, Rajarshi, Shubhankar | Unassigned |
| M | 32–33 | 2026-09-19 23:39 through 2026-09-20 00:28 | 500,000 then 1,000,000 | Abhirup, Emon, Supratik | Unassigned |

## Player directory awaiting review

The shared directory currently contains Abhirup, Aiush, Ashit, Debraj, Emon, Pratik, Rahul Basak, Rajarshi, Rana, Shubhankar, Soham, Supratik and Utsav. Aiush has no saved session in this inventory.

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
- Ownership decisions: waiting for user confirmation.
- Database backfill: not started.
- Production changes: none.
