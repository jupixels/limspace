# LIMSPACE

A found-footage liminal-space horror game that runs in the browser. You carry a camcorder through empty places that should not exist, one tape at a time.

**Play:** https://jupixels.github.io/limspace/

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | move |
| Shift | run |
| Space | jump; climb out of the pool when facing the edge |
| C | crouch (duck underwater in the pool) |
| E | interact |
| Mouse wheel | zoom |
| N | night vision (drains battery) |
| Esc | pause (look sensitivity, camera effects, volume) |

Headphones recommended.

## The tapes

Four hand-built places, each on its own tape, all on the shelf from the start. Each has its own story told through recordings left behind (eight per tape, saved once found), its own entity, and things that happen by themselves when you aren't looking.

- **Tape 01: Overtime.** An office at 2:13 am that keeps going past the supply closet: a cubicle farm, a yellow maze, a flooded section, a storage room with no light at all, maintenance tunnels. The elevator needs four fuses. Something tall lives past the closet door: don't stare at it, and don't turn your back on it.
- **Tape 02: Deep End.** A swim lesson that never ended, in white-tiled halls of water: a lap hall with pillars standing in the deep end, a kiddie pool under cloud wallpaper, a waterslide tunnel, a flooded floor you can only reach underwater, and a diving tower over a pool that keeps getting deeper. Three valves drain it; the way out is at the bottom. The Swimmer only moves while you aren't looking.
- **Tape 03: Recess.** (not recorded yet) The party is still waiting for you.
- **Tape 04: Closing Time.** (not recorded yet) The mall is now closed.

If something catches you, the tape rewinds a few seconds.

## Running locally

It is a static site with no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8123
```

Then open http://localhost:8123.

## Structure

- `js/main.js`: renderer, post-processing chain, game loop, tape shelf, pause and end screens, ambience, catch and rewind
- `js/player.js`: first-person controller: walking, jumping, wading, climbing, camcorder motion
- `js/body.js`: the player's visible hazmat-suited body and its animations
- `js/camcorder.js`: VHS/camcorder shader and viewfinder overlay
- `js/audio.js`: positional audio, reverb zones
- `js/tapes/level.js`: a tape's place: merged geometry by section, lights that follow you, water, platforms, the air of each room
- `js/tapes/grid.js`: hand-drawn floor plans on a grid, turned into floors, ceilings, walls and doorways
- `js/tapes/kit.js`: things that move while you aren't looking, things that roll by themselves, triggers
- `js/tapes/base.js`: what every tape shares: recordings, prompts, objectives, the entities
- `js/tapes/tape1.js`, `tape2.js`: each tape's floor plan, props, story and events
- `js/tapes/materials.js`: textures (loaded and painted) and materials
- `js/creatures.js`: the Swimmer, the Occupant and the Listener, built from primitives and posed in code
- `audio/`: sound effects generated with ElevenLabs
- `models/`: hazmat character generated and rigged with Meshy
- `textures/`: CC0 textures from [ambientCG](https://ambientcg.com) (Tiles107, Tiles132A, Tiles133A, Tiles133B, Carpet008, Wallpaper002A, OfficeCeiling001, WoodFloor051, Concrete034)

Built with [three.js](https://threejs.org/).
