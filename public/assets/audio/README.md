# Audio assets

Gameplay SFX and music are **procedural** (Web Audio oscillators) in `src/audio.js`.
This folder is reserved for optional future sample files (CC0 / original).

Mute preference: `localStorage` key `rtypeweb.audio.muted` (`"1"` / `"0"`).
Audio unlocks on the first user gesture; failures degrade silently.
