# Asset inventory

- Full machine-readable list: `ASSET_MANIFEST.json` (source URL, path, bytes, SHA-256).
- Retrieval errors: `ASSET_ERRORS.json` (empty after final crawl).
- Final closure: 155 public files, 7,481,120 bytes.
- Runtime: Vite entry bundle plus React, Phaser, Firebase library chunk and 300-question unit chunk.
- Media: generated pixel-art hero, monsters, bosses, weapons, cards, effects, environment and XP gems; local BGM/SFX.
- Firebase library is bundled but configuration values are unset, so ranking remains offline/local.
- No API keys, bearer tokens or credentials were added.
