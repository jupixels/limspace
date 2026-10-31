# LIMSPACE

A found-footage liminal-space horror game that runs in the browser. You play back an unlabeled camcorder tape and walk through empty places that should not exist.

**Play:** https://jupixels.github.io/limspace/

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | move |
| Shift | run |
| C | crouch |
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
- `js/world.js`: level geometry, lights, water, inhabitants
- `js/player.js`: first-person controller and camcorder body motion
- `js/camcorder.js`: VHS/camcorder shader and viewfinder overlay
- `js/audio.js`: positional audio, reverb zones
- `js/events.js`: scripted and random scares
- `audio/`: sound effects generated with ElevenLabs

Built with [three.js](https://threejs.org/).
