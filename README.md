# LIMSPACE

A found-footage liminal-space horror game that runs in the browser. You carry a camcorder through an endless, generated world of empty places that should not exist: backrooms, poolrooms, a pastel meadow, a mall after closing.

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

## The world

There is no map, no story and no exit. Every world is generated from a seed (shown on the title screen; **NEW WORLD** rolls another) and streams in around you as you walk, forever, in every direction. It is made of four kinds of place that bleed into each other through doorways:

- **The backrooms:** yellow wallpaper, damp carpet and buzzing panel lights, in a maze that never repeats.
- **The poolrooms:** white tile halls, shallow and deep pools, light from skylights that lead nowhere.
- **The meadow:** mown grass under a pastel sky, with doors, swing sets, stairs and televisions standing in it.
- **The mall:** a two-storey shopping arcade after closing: shutters, neon signs, a fountain still running.

Things to find: lost tapes with someone's voice on them, payphones that ring when you come close, and very rarely a door that goes somewhere else. Your found tapes are saved per world.

Each kind of place has something living in it, and it is rare: the Swimmer in deep pools (it moves only when unseen), the Occupant in the backrooms (don't stare, don't turn your back), the Listener in the mall (it hunts by sound; crouch), and something in the meadow that only watches. If one catches you, the tape rewinds a few seconds.

## Running locally

It is a static site with no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8123
```

Then open http://localhost:8123.

## Structure

- `js/main.js`: renderer, post-processing chain, game loop, title and pause menus, ambience, catch and rewind
- `js/player.js`: first-person controller: walking, jumping, wading, climbing, camcorder motion
- `js/body.js`: the player's visible hazmat-suited body and its animations
- `js/camcorder.js`: VHS/camcorder shader and viewfinder overlay
- `js/audio.js`: positional audio, reverb zones
- `js/ow/world.js`: chunk streaming, lights that follow you, water, the air of each place
- `js/ow/biomes.js`: the four kinds of place and the walls and doorways between them
- `js/ow/materials.js`: textures (loaded and painted), materials, reflection maps
- `js/ow/director.js`: tapes, phones, the door, and where and when things appear
- `js/ow/noise.js`: seeded hashing and random numbers
- `js/creatures.js`: the Swimmer, the Occupant and the Listener, built from primitives and posed in code
- `audio/`: sound effects generated with ElevenLabs
- `models/`: hazmat character generated and rigged with Meshy
- `textures/`: CC0 textures from [ambientCG](https://ambientcg.com) (Tiles107, Tiles132A, Tiles133A, Tiles133B, Carpet008, Wallpaper002A, OfficeCeiling001, WoodFloor051, Concrete034)

Built with [three.js](https://threejs.org/).
