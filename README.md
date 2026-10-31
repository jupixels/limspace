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
| Mouse wheel | zoom |
| N | night vision (drains battery) |
| Esc | pause |

Headphones recommended.

## Running locally

It is a static site with no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8123
```

Then open http://localhost:8123.

## Structure

- `js/main.js`: renderer, post-processing chain, game loop, start/pause
- `js/world.js`: level geometry, area lights, reflection probes, water, inhabitants
- `js/player.js`: first-person controller: walking, jumping, wading, climbing, camcorder motion
- `js/body.js`: the player's visible hazmat-suited body and its animations
- `js/camcorder.js`: VHS/camcorder shader and viewfinder overlay
- `js/audio.js`: positional audio, reverb zones
- `js/events.js`: scripted and random scares
- `audio/`: sound effects generated with ElevenLabs
- `models/`: hazmat character generated and rigged with Meshy
- `textures/`: CC0 tile textures from [ambientCG](https://ambientcg.com) (Tiles107, Tiles132A, Tiles133A, Tiles133B)

Built with [three.js](https://threejs.org/).
