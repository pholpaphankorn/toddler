## Goal
- Can configure roles for agents run in toddler in config. Config should have skills, prompt or any related stuff for each role
- PM agent role to turn specs to issues and organize tasks for agents inside toddler
- Config for PM agent that point to where specs stores wheter it's stored locally or some Github or GitLab issues
- Can configure which agent user uses like claude code, codex ,etc. This could be the same config as agent roles.
- Have default agents scheduling or prioritization by usage limit. For example, If user has claude and codex, it should prioritize the one with more weekly usage limit left first. If equal, compare 5h limit usage left, if equal just random 
- Make agents prioritization code extendable for more custom prioritization. 
- In config about agents prioritization, we can have simple list of preferred agents like [claude, codex]. If claude comes first in the list. let's prioritize it.
- Config has stop condition threshold of "toddler run" on both weekly and 5h limit. either hit we stop 
- Stop condition code is extendable.
- GitLab issues compatible

