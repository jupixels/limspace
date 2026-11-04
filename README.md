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
- **Tape 03: Recess.** A birthday party in a pastel field that goes on too far, ringed by hills you never reach. Nobody came. A red balloon leads you to five invitations: at a playground where the swings and the merry-go-round move by themselves, in a house set for guests, under a pink tree, on a pond dock, in a field of freestanding doors (one of them opens onto somewhere else). Then white stairs climb into the clouds to a classroom with your name on a desk. The Guests, tall and in party hats, only move when you aren't looking.
- **Tape 04: Closing Time.** A mall after hours, on two floors and a garage: a fountain atrium with a carousel that turns when you look away, a department store full of mannequins that creep closer between glances, a food court, a neon arcade that wakes up on its own, a toy store, and a security office up the stopped escalators. The main doors are chained; the guard's keycard is pinned to one of the mannequins, and the office opens the garage gate. The PA insists you aren't allowed to leave. The Listener walks the ground floor and hunts by sound: walk softly, crouch, don't run.

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
- `js/tapes/tape1.js` to `tape4.js`: each tape's floor plan, props, story and events
- `js/tapes/materials.js`: textures (loaded and painted) and materials
- `js/creatures.js`: the Swimmer, the Occupant and the Listener, built from primitives and posed in code
- `audio/`: sound effects generated with ElevenLabs
- `models/`: hazmat character generated and rigged with Meshy
- `textures/`: CC0 textures from [ambientCG](https://ambientcg.com) (Tiles107, Tiles132A, Tiles133A, Tiles133B, Carpet008, Wallpaper002A, OfficeCeiling001, WoodFloor051, Concrete034)

Built with [three.js](https://threejs.org/).
