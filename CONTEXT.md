# The Good Fight — Browser Implementation

A browser-based game tracker and play interface for *The Good Fight* solo TTRPG.

## Language

### Personnel & Recruitment

**Operative**:
A recruited, trained card-based unit available for assignment to Operations. The Leader always counts as an Operative.
_Avoid_: unit, agent, member.

**Initiate**:
A recruited card partway through training, not yet available for assignment.
_Avoid_: trainee, recruit-in-training.

**Detained Operative**:
An Operative temporarily unavailable as an Operation-failure penalty; returns on its own.
_Avoid_: captured, jailed, arrested, lost.

**Captured Operative**:
An Operative permanently lost as a Crackdown penalty; its card re-enters the Recruitment Deck. Distinct from a Detained Operative, which comes back on its own.
_Avoid_: killed, detained, lost.

**Leader**:
The player's permanent, un-losable unit. Always counts as an Operative and can always attempt Recruitment.
_Avoid_: player character, PC.

**Leader Skill Level**:
A ratchet tracking the highest card value any of the Leader's Operatives has ever reached; only increases, never drops.
_Avoid_: leader value, skill (bare).

**Recruit Pool**:
Cards drawn from the Recruitment Deck but not yet attempted for recruitment.
_Avoid_: draw pile, hand.

**Recruit Attempt**:
The check that promotes a card from the Recruit Pool to an Initiate.
_Avoid_: recruit check, recruitment roll.

**Tapped**:
An Operative assigned to an Operation this turn, unavailable for further assignment until next turn.
_Avoid_: busy.

### Resources

**Heat**:
A resource representing regime suspicion toward the Resistance.
_Avoid_: suspicion, alert level.

**Influence**:
A resource representing the Resistance's reach and growth.
_Avoid_: reputation, reach.

**Supplies**:
A resource consumed by Operations and gained via Gather Supplies.
_Avoid_: materiel, resources (too generic).

### Operations

**Vandalism**:
The baseline tier of Operation (Minor / Average / Significant), scaled by cost and reward.
_Avoid_: sabotage.

**Gather Supplies**:
The Operation used to earn Supplies.
_Avoid_: supply run.

**Scout**:
A Multi-turn Operation whose success reveals a Mid-Game Operation opportunity.
_Avoid_: recon.

**Late-Game Scout**:
A longer, harsher-penalty variant of Scout whose success reveals a Late-Game Operation opportunity.
_Avoid_: recon.

**Mid-Game Operation / Late-Game Operation**:
Scouted-opportunity Operations gated by Influence. Late-Game Operation completions are the Victory condition.
_Avoid_: endgame op.

**Multi-turn Operation**:
An Operation whose assigned Operatives stay Tapped across more than one turn before it resolves.
_Avoid_: long op.

**Compound Failure**:
An Operation failure with two consequences: one unconditional, one the player chooses between.
_Avoid_: failure bullets, OR penalty.

### Crackdown

**Crackdown**:
An end-of-turn regime response that applies escalating penalties and always reduces Heat.
_Avoid_: raid (a per-tier flavor name, not the mechanic itself), retaliation.

**Crackdown Cascade**:
The substitution rule that redirects a Crackdown penalty to a different personnel type when the required one isn't available.
_Avoid_: fallback, downgrade.

### Outcomes

**Victory**:
The win condition: completing enough Late-Game Operations.
_Avoid_: win state.

**Unwinnable Advisory**:
A non-blocking UI hint shown during normal play when the player has effectively run out of options. Play can continue.
_Avoid_: game over, loss.

**Stall**:
A simulation-only outcome: a simulated game where the strategy stops making legal moves. Normal play has no equivalent loss condition.
_Avoid_: loss, game over.

### System

**Input Mode**:
A player preference for whether randomized results come from the app or are entered manually from the player's own physical dice/cards.
_Avoid_: game mode.

**Resistance Values / Regime Type**:
Player-selected flavor choices made during setup. Narrative only — no mechanical effect.
_Avoid_: theme, background.

**Difficulty**:
A game-wide setting chosen once at setup (easy/medium/hard) that fixes the Influence threshold used for every Mid-Game and Late-Game Operation attempt for the rest of that game. Unlike Resistance Values/Regime Type, this has real mechanical effect.
_Avoid_: difficulty tier (that's the per-threshold label, not this setting).
