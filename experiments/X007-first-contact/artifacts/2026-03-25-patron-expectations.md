# X007: Patron Expectations

These are my thoughts before submitting the first non-trivial commission to a guild built using the Nexus framework.

## What I expect to happen

1. Setup procedure
  - Will initialize a new guild and double-check the roles and everything are as expected
  - Will create codex with the global requirements for libraries and frameworks
  - Will have the Steward setup a workshop
2. Executing commission
  - Submit the commission
  - Run the clockworks until the session begins
  - Consult with the Steward and wait for the commission to complete or fail
3. Post-commission review
  - I expect the commission to succceed, with code pushed to the workshops main branch
  - I expect the code to be reasonably functional (see my additional comments below)
  - Coco and I will perform an initial analysis of the transcripts, pending creation of full analysis tools

## What I think will go well ('be easy')j

- **It will create a web UI**: I think it will successfully create a local script which starts up a web server with the required data. I also think it will export a function allowing us to embed the same.
- **Libraries and frameworks will be suitable**: Even without our guidance, I expect the anima to select reasonable tools for this seet of requirements. Our constraints will just make this outcome better.

## What I think will go poorly ('be hard')

- **CI/CD won't work**: Our requirement for this is that we can import the product as a dependency in other products. I don't actually know how the agent will resolve this requirement. I suspect it will ignore it. It may produce documentation about using a git ref for the npm dependency. This would be lame, but technically usable. It may try to publish to the the ghcr.io registry, but I suspect if it does it won't work for some reason. I doubt it will attempt npm publishing (credentials would be an immediate problem.)

### Execution Problems

- **Process is not turnkey**: A guild will have to be setup for this, including double-checking the roles, codex, etc. In addition, the Clockworks does not yet have automation, so completing the commission is multiple steps: submit it, and then run the clockworks until everything is done.
- **No good way to tell 'how it went'**: The steward will fill this gap, but I don't really have a good grasp of how I would monitor the progress and result of a commission. Part of why this is being built, I guess.

### Product Quality

- **Web page will be ugly**: I doubt that the styling will be particularly pleasing. And I expect data to be organized somewhat poorly. Not presented in a way that maximizes utility. Will miss things a person would immediately think of, such as highlighting anomalous entries such as errors, etc.

### Code Quality

- **Developer tooling will be minimal**: Even though this is a 'greenfield' repository, I expect real setup of developer tooling. I expect handcrafted tsconfig with sub-optimal options, no code quality tooling such as eslint or tests, etc.
- **Poorly thought out dependencies**: Some dependencies will be old/outdated versions. Dependency versions will not be pinned.
- **Poorly factored code**: Large functions, no organization of code modules, inconsistent patterns for arguments and return types, etc. The more the agent has to iterate, the worse this will be. 
- **No/low documentation**: JSDoc will be absent or minimal.

## Addendum: Coco's Expectations

Out of curiosity, I also had Coco answer the same question. The response is captured in [coco-expectations.md](./coco-expectations.md).
