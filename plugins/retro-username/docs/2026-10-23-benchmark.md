# Benchmark: 0.6 text band → 0.7 real-pixel cozy room

Date: 2026-10-23 · Machine: Intel Core Ultra 7 155U, WSL2 (4 vCPU, 11 GB), Windows GPU via WSLg · Claude Code 2.1.309 · kitty 0.49.2

## What was measured

- **Render cost per frame** inside the mod: the 0.6 path (`layout` + `paintScene` + `drawPet` + `runs`) against the 0.7 path (`frame()` + base64 encode), over the same scripted minute (idle → Edit → Bash → thinking → error → idle, 10 s each). Timed with `performance.now()` in the mod runtime itself: `/pet bench [frames]` in a live session, and the same function inside `claude plugin test`.
- **Bytes per frame to the terminal**: SGR + text bytes for the 0.6 runs (19-byte SGR per run, UTF-8 text, 2 per row), base64 payload for the 0.7 Image.
- **Whole-system CPU** while the band animates: Claude Code's process and kitty's process, % of one core from `/proc/<pid>/stat` over 20 s, in a live kitty session with nothing else happening.

## Results

### Render cost in the mod runtime (`/pet bench 200`, live session, 191 columns)

| path | median | p95 | max | per frame | rate | to terminal | busy |
|---|---|---|---|---|---|---|---|
| 0.6 text band | 2.38 ms | 8.51 ms | 18.49 ms | 12.6 KB | 3.3 fps | 42 KB/s | 0.8% |
| 0.7 real pixels | 3.77 ms | 5.22 ms | 19.34 ms | 250.7 KB | 8 fps | 2,006 KB/s | 3.0% |

Headless (`claude plugin test`, 150 columns, 200 frames): 0.6 1.48 ms median / 10.1 KB per frame; 0.7 2.60 ms median / 196.9 KB per frame (max 41 ms = the one-time static build).

### How the 0.7 frame got there (mod runtime, 450×84 px, isolated probe)

| step | ms / frame |
|---|---|
| first port of the approved spike | 12.0 (room 4.9, lights 3.4, board 2.1) |
| bit truncation instead of `Math.floor` in `set()` and the falloff; square-root table | — |
| sky, moon and mountains moved to the static layer behind a sky mask | — |
| chalkboard face cached, redrawn only when its numbers change | **4.06** (room 2.44, lights 0.71, shade 0.52) |

`Math.*` calls cost ≈ 38 ns each in the mod runtime (≈ 20× Node), which is why they were taken out of the per-pixel loops. The unoptimised spike in Node took 80–100 ms per full-band frame; the same work now takes 1.6 ms in Node.

### Whole-system CPU (% of one core, 20 s, live kitty session)

| band | kitty renderer | Claude Code | kitty |
|---|---|---|---|
| 0.6 text band | software GL (llvmpipe) | 12.0% | 0% |
| 0.7 real pixels, 8 fps | software GL (llvmpipe) | 13.9% | **189.6%** |
| 0.6 text band | Windows GPU (Mesa d3d12) | 10.9% | 0.1% |
| 0.7 real pixels, 8 fps | Windows GPU (Mesa d3d12) | 12.7% | 30.6% |
| 0.7 real pixels, idle (adaptive 4 fps) | Windows GPU (Mesa d3d12) | 11.2% | **15.1%** |

## Findings

1. **The mod's own cost is small**: +1–2 points of one core in Claude Code for the real-pixel band (render ≈ 3–4 ms per frame).
2. **The terminal pays for the pixels**: every frame is a whole picture (≈ 200–250 KB base64 at 150–191 columns), ≈ 50× the bytes of the text band. The mod API has no compression and no partial update for an Image.
3. **On WSLg kitty fell back to software OpenGL** and burned ~2 cores. Forcing Mesa's d3d12 driver (the Windows GPU) cut that 6×. `~/.local/bin/kitty` is now a wrapper that sets `GALLIUM_DRIVER=d3d12`, and the Start-menu entry uses it.
4. **Adaptive frame rate** halves the steady-state cost: 8 fps while Claude works or thinks, 4 fps idle, 1 fps asleep, and half again over SSH (`SSH_CONNECTION` set), since every frame crosses the network.

## Over SSH

Over SSH the bytes cross the network: ≈ 2 MB/s at 8 fps (191 columns), ≈ 0.5–1 MB/s with the adaptive rate and the SSH halving. Fine on a LAN/cloud link, noticeable on a slow one; `RETRO_GRAPHICS=off` on the VM gives the text band.

## Reproduce

- In any session with the mod: `/pet bench` (200 frames) or `/pet bench 1000`.
- Whole-system CPU: start kitty with `-o allow_remote_control=yes --listen-on unix:/tmp/retro-kitty`, run Claude Code in it, then sample `/proc/<pid>/stat` utime+stime for kitty and claude over 20 s; `/pet scene off` / `/pet scene auto` switch text ↔ pixels.
