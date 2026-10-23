# claude-mods

Claude Code mods: our own **retro-username**, plus community mods pinned at the exact commits we reviewed (their code stays in their own repositories).

## Install

In Claude Code:

```
/plugin marketplace add NavazdeenS/claude-mods
/plugin install retro-username@claude-mods
```

or from a shell:

```
claude plugin marketplace add git@github.com:NavazdeenS/claude-mods.git
claude plugin install retro-username@claude-mods
```

Update later with `claude plugin marketplace update claude-mods` then `claude plugin update retro-username@claude-mods`.

## retro-username

In a graphics terminal (kitty, Ghostty; iTerm2 3.5+ in fullscreen) the band above the prompt is one real-pixel, fully animated cozy room: a chalkboard with your name and the CONTEXT / SESSION / WEEKLY meters, Claude coding at the desk (its screen follows what it is doing), a window with snow or rain, string lights, a cat, a candle, a clock with your real time, a bookshelf, plants and a record player. Everywhere else it is a retro text band with usage bars and a band pet.

- `/pet` — stats; `/pet feed | play | open | wear <outfit> | name <name> | style <mochi|clawd|mini|classic>`
- `/pet scene off` — the text band even in a graphics terminal; `/pet scene auto` — back on
- `/pet bench [frames]` — the 0.6 text band against the real-pixel band, in your runtime
- `RETRO_GRAPHICS=on|off` — skip graphics detection

The room needs a band at least 150 and at most 255 columns wide and 14 rows tall. On WSL, run kitty through WSLg with `GALLIUM_DRIVER=d3d12` so it draws on the GPU (≈ 6× less CPU than software OpenGL). Benchmark: [plugins/retro-username/docs/2026-10-23-benchmark.md](plugins/retro-username/docs/2026-10-23-benchmark.md).

## Community mods (by reference)

| mod | upstream | pinned commit |
|---|---|---|
| hud | [hoobnn/hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods) `claude-code/hud` | 60ee5dd |
| filetree | [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) | bf8de32 |
| blast-radius | [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods) `mods/blast-radius` | 11abba8 |
| rich-terminal | [xiaolai/claude-rich-terminal](https://github.com/xiaolai/claude-rich-terminal) | d20c34a |
| savvy-progress | [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit) `plugins/savvy-progress` | 272a877 |
| pixelband | [furqan-khan07/pixelband](https://github.com/furqan-khan07/pixelband) | 20e27f9 |

Each is MIT-licensed by its author; this marketplace only points at their code. Install any of them the same way, e.g. `/plugin install hud@claude-mods`.
