# Commission: Fix Consult Workshop Setup

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What's Broken

When I run `nexus consult --role artificer`, I get this:

```
$ npx github:shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680 consult --role artificer
Error: could not determine the guild repository URL.
Ensure the nexus CLI is installed from a git repository with an origin remote.
```

The consult command currently tries to determine the guild's repository by reading the git remote of the script's own directory. The problem is that the CLI is typically installed via npx, which runs from an npm cache directory — not a git clone. There's no git remote to read.

I'd like this to work. When I consult with a guild member, they should be standing in the guild's workshop, ready to talk. I shouldn't have to think about how that happens.

If any setup or configuration is needed from the user, document it in the README.

Come to think of, I also don't want to have to pass "--repo" every time I post a commission. It should automatically go to your workshop.
