# rig

Rig is responsible for:

- Guild bootstrap
- Managing guild config
- Managing plugins
- Managing tools

And I'm not even sure about the last one.

## Illustrative SDK

I'm thining the rig sdk is something like:

- `createRig(guildPath: string): Promise<Rig>`

And Rig has functions:

- `listPlugins(): Promise<NexusPlugin[]>`
- `findPlugin<T>(name: string, version?: string): Promise<NexusPlugin>`
- `listTools(): Promise<NexusTool[]>`
- `findTool<T>(name: string, version?: string): Promise<NexusTool>`
- `getGuildConfig(): Promise<GuildConfig>`: all of guild.json, including plugin configs (which are named with the plugin's key)
- `getPluginConfig(pluginName: string): Promise<Record, string<unknown>>`: gets the plugin-specific section from guild.json

Notes:

- Up for debate if 'findXxx' shoudl throw or return null if not found. Similar for plugin config
- Not sure what NexusPlugin is .. some minmimal interface for each plugin with basic metadata, a 'tools[]' array maybe, etc. 
- Similar for NexusTool, although we do already have a ToolDefinition which is possiblye the foundation of this

Questions:

- How do plugins "use" each other? I'm assuming they include the other plugin package as a dependency, but then what
  - Do they go "rig.findPlugin(..)" and cast (or use generics) to get a reference to the other plugins
  - Do all plugin packages by convention export something like `fromRig(rig: Rig)` that returns their "inter-plugin api"?
  - Do plugins declare dependencies via manifest, and rig injects the other plugins into whatever entrypoint plugins have?

Also, are "tools" a core concern or something that should be a plugin? (Meaning rig is really just a plugin host with config)