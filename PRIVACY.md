# Privacy

Scforge runs entirely on your machine. It collects no data, has no telemetry, and makes no network requests of its own.

It reads and writes files in your repository (`.scforge/`, `.claude/agents/`, settings and ignore entries) and runs `git` and the gate commands you configure. Anything those commands do, for example a test suite that calls the network, is your project's behavior, not Scforge's.

Claude Code sends prompts to Anthropic as usual when agents run; see Anthropic's privacy policy for that.

Questions: open an issue at https://github.com/nashpb/scforge/issues.
