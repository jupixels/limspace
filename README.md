# LIMSPACE

A found-footage liminal-space horror game that runs in the browser. You play back an unlabeled camcorder tape and walk through empty places that should not exist.

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

## Tape 01

The hall's only exit is shuttered. Something on the bottom of the pool opens it, and taking it wakes what lives in the water. It only moves while you aren't watching it. If it reaches you, the tape rewinds.

## Tape 02: Vacancy

https://jupixels.github.io/limspace/?tape=2 (or finish Tape 01)

A hotel corridor that doesn't end. Something tall is standing in it. Don't look at it for long; every time you look away, it comes closer. Keep walking. One of the rooms will open.

## Tape 03: Home

https://jupixels.github.io/limspace/?tape=3 (or finish Tape 02)

A family house at night with the power out, built slightly wrong. The tape is in the VCR. The stairs go up into an attic someone has been filming from. Something blind lives here and it moves toward whatever it hears: walking is noticed, running is heard across the house, crouching is almost silent. The breaker is in the garage, and it is loud.

## Running locally

It is a static site with no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8123
```

Then open http://localhost:8123.

## Structure

- `js/main.js`: renderer, post-processing chain, game loop, pause menu, death/rewind and end-of-tape sequences
- `js/world.js`: level geometry, area lights, reflection probes, water, inhabitants
- `js/player.js`: first-person controller: walking, jumping, wading, climbing, camcorder motion
- `js/body.js`: the player's visible hazmat-suited body and its animations
- `js/camcorder.js`: VHS/camcorder shader and viewfinder overlay
- `js/audio.js`: positional audio, reverb zones
- `js/events.js`: Tape 01 director: tape pickup, the Swimmer, scripted and random scares
- `js/hotel.js`: Tape 02 level: the looping corridor, room 215, lights that follow you
- `js/events2.js`: Tape 02 director: laps, the Occupant's stare meter and steps, the exit
- `js/house.js`: Tape 03 level: the house, its room graph, lamps, the corner camera feeding the TV
- `js/events3.js`: Tape 03 director: hearing and hunting, the breaker, the VCR
- `js/creatures.js`: the Swimmer, the Occupant and the Listener, built from primitives and posed in code
- `audio/`: sound effects generated with ElevenLabs
- `models/`: hazmat character generated and rigged with Meshy
- `textures/`: CC0 textures from [ambientCG](https://ambientcg.com) (Tiles107, Tiles132A, Tiles133A, Tiles133B, Carpet008, Wallpaper002A, OfficeCeiling001, WoodFloor051, Concrete034)

Built with [three.js](https://threejs.org/).
