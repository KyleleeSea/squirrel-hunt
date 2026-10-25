# 🐿️ Squirrel Hunt

A two-player 3D hide-and-seek game in a pastel, Human: Fall Flat-style backyard — except the players are squirrels.

**Play:** open the site, one player clicks **Host a game** and shares the 4-letter room code (or the link), the other enters the code and clicks **Join**.

## How a round works

1. **Hide** (25 s) — the hider scurries off while the seeker's screen is blindfolded.
2. **Seek** (90 s) — the seeker hunts; get within arm's reach and press **E** (or click) to catch. In the last 30 seconds the seeker gets a "squirrel sense" arrow.
3. Roles swap and the score carries over.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | move |
| Mouse (click canvas to lock) | look |
| Space | jump (or leap off a tree) |
| Shift | sprint |
| Walk into a tree trunk or ladder | climb |
| E / click | catch (seeker) |
| Scroll | zoom camera |

Hiding spots: bushes (walk right in), the hollow log, the doghouse, under the picnic table, up any tree, the fort.

## Tech

- [Three.js](https://threejs.org) for rendering, custom AABB physics with climbing and mantling.
- Peer-to-peer multiplayer over WebRTC with [PeerJS](https://peerjs.com). The host's browser runs the authoritative round logic; signaling uses the public PeerJS cloud, after which traffic flows directly between the two players.
- Pure static site — no build step, no server. Serve the folder with any static file server, e.g. `python3 -m http.server`.
