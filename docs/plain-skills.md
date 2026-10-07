# Using Caddie without installing a plugin

Claude Code reads skills and commands from a project's `.claude/` folder as well as from plugins. If you would rather not install plugins, you can copy Caddie's skills and commands into a project and point them at a clone of this repository.

## Steps

1. Clone and install once, anywhere:

   ```
   git clone https://github.com/timlaneseo-tech/unfayr-caddie ~/caddie
   cd ~/caddie && npm install
   ```

2. In the project where you want to keep your results (any folder; it can be empty), copy the skills and commands:

   ```
   mkdir -p .claude/skills .claude/commands
   cp -r ~/caddie/skills/* .claude/skills/
   cp ~/caddie/commands/*.md .claude/commands/
   ```

3. The command files refer to the plugin's location as `${CLAUDE_PLUGIN_ROOT}`, which only plugins fill in. Replace it with your clone's path:

   ```
   sed -i 's#${CLAUDE_PLUGIN_ROOT}#/home/you/caddie#g' .claude/commands/*.md
   ```

   On Windows, open the three files in `.claude\commands\` and replace `${CLAUDE_PLUGIN_ROOT}` with the clone path using forward slashes, for example `C:/Users/you/caddie`.

4. The commands load the skills by their plugin names (`caddie:intent-match` and so on). Without the plugin those names do not exist, and the command already says what to do: read `skills/<name>/SKILL.md` from the clone instead. Nothing else changes.

5. Start Claude Code in that project and run `/find --sample summitplumbing.example`, then follow [SETUP.md](../SETUP.md) for your own site.

## Updating

`git pull` in the clone updates the scripts. Re-copy `skills/` and `commands/` (and redo step 3) when they change; the commit log says when they do.

Built by Unfayr · unfayr.com
