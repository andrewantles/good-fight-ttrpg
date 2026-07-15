index.html
- Log needs to be in reverse, with newest events at the top
- Log also needs to disappear off the page, so the end turn button doesn't keep scrolling lower and lower.
- operations need tooltips or other detail about what they do, requirements, and what the consequences or rewards woul be
- QOL: operations should be able to select multiple operatives, and the engine should know that if two operatives selected for a one operative requirement operation, then run it twice. 
- it looks like operations are adding heat to the success of the roll, but heat should be subtracted from the d100 roll, increasing difficulty. 
- heat is being reset to zero each turn. It should be cumulative and build, keeping it's total through turns. The only times heat should go down is from crackdown successes (equal to crackdown success roll) or through the outcomes of various mid and late game operations

simulate.html 
- only the random AI tends to do anything besides gather supplies - logic error somewhere?
- all games seem to max out at 1001-1005 turnsm according to dashboard, whether win or lose. Win should trigger game end.
- Operation Completion Heatmap graph: shows milestones being completed on turn 0,1,2,... this shouldn't be possible. Late game operations (what I'm assuming is meant by "milestone," since they are the only win condition) take many turns to build influence, recruits, to discover via Scout operation, and to attempt.