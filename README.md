# Snowy Skies

A colorful, original, one-button endless runner for little players. Guide an ice princess over friendly snowy obstacles and collect magical snowflakes.

## Play locally

No installation, server, or build step is needed. Open `index.html` in a modern browser. For the most consistent fullscreen and storage behavior, serve the folder with any simple static-file server.

## Controls

- Tap or click anywhere in the game to jump.
- Press the space bar to jump.
- Use the pause button for a break. The game also pauses when its tab loses focus.

The game saves the best score and sound preference in browser local storage. Sound effects are synthesized in the browser, so the game remains fully offline without external audio files.

## GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, select **Deploy from a branch**.
3. Select the branch containing these files and the `/ (root)` folder.
4. Save. The game will be available at `https://username.github.io/repository-name/`.

All paths are relative, so it works when deployed from a project subdirectory.

## Project layout

```text
index.html          Game markup and accessible UI
style.css           Responsive UI styling
game.js             Canvas rendering, physics, input, audio, and game state
assets/images/      Space for original or CC0 artwork
assets/sounds/      Space for optional original or CC0 sound files
assets/fonts/       Space for optional open-licensed fonts
```

The canvas artwork is drawn from simple shapes at runtime and is original. To add character art or sounds later, keep assets original, AI-generated, or CC0 licensed and replace the corresponding canvas/audio routines in `game.js`.