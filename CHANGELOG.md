# Changelog

## 0.3.1

- Inhibit direct scanout only while the overlay is open; restore on every close.
- Explicitly request a stage update and retry once if the first repaint is missing.
- Release input after 1.5 seconds without a first repaint, and clean up failed opens.
- Log activation and first repaint timing without recording application names or keys.
- Test idle fullscreen rendering and simulated missing-repaint cleanup.

## 0.3.0

- Activate in GNOME Overview and panel popups while excluding locked sessions.
- Replace hundreds of label/dot actors with one Cairo/Pango drawing layer.
- Increase default density: target spacing 40 logical pixels (up to 676 hints).
- Arrow keys move the grid 4 pixels; Shift+arrows move it 1 pixel.
- Backspace now cancels, like Escape, in every mode.
- Test Overview, panel popup preservation, 2560x1600 rendering and grid movement.

## 0.2.0

- Smaller translucent labels, no border, and reduced default grid density.
- Offset labels from target points and add hold-Space preview.
- Add Ctrl+Super+M menu mode without an application focus grab.
- Add appearance and shortcut preferences.
- Package source and extension archives with checksums.
- Add installer backups, optional GNOME/keyd conflict handling, and uninstall.
- Add native Wayland popup and keyboard integration tests.

## 0.1.0

- Local GNOME 51 two-letter pointer extension.
- Alt+M integration with an existing keyd F13 mapping.
