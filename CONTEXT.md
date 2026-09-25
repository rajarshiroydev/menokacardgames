# Menoka card games

A host's record of casual poker sessions, player investments and results. Each signed-in host has a private ledger; implementation status lives in the feature plan.

## Language

**Host account**: The signed-in person who orchestrates games and owns a private friend list and ledger.

**Player profile**: A named participant in one host's friend list, independent of a sign-in account.

**Ledger**: One host account's saved sessions and resulting standings.

**Session**: One recorded game containing one or more hands and final results.

**Hand**: One deal and its betting rounds ending in an awarded pot or cancellation.

**Total invested**: A player's initial buy-in plus every rebuy in a session.

**Net result**: Ending chips minus total invested under the current no-cash-out rules.

**Session return**: Net result as a percentage of positive total investment in one session.

**Average session return**: Arithmetic mean of a player's eligible session returns, with equal weight per session.

**Profitable session**: A session with positive net result; not a count of hands won.

**Legacy game**: A game saved in the old shared ledger before accounts existed (before 25 September 2026). It stays unowned and hidden until it is claimed into the reviewed host's ledger.

**Claim**: Copying reviewed legacy games into one host's ledger, with that host's own friend profiles and new game numbers. The original legacy record is kept.
