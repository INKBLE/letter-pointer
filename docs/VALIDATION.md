# Validation: 0.3.0

Test environment: Arch Linux, GNOME Shell 51.1, headless native Wayland,
1280x720 and 2560x1600 logical resolutions, a separate D-Bus session and temporary XDG paths.
No current desktop settings are changed by the integration tests.

Verified with real virtual keyboard events and a native GTK 4 client:

- Preferences window construction with GNOME's ExtensionPreferences base.
- Ctrl+Super+M activation while a native popup is open.
- Popup stays visible and the application retains focus.
- Selection keys are intercepted and do not reach the text entry.
- Space preview hides and restores labels and target points.
- Backspace and Escape cancel the overlay.
- Overview activation with both shortcuts; cancellation preserves Overview.
- Panel popup activation; cancellation preserves the underlying date menu.
- Arrow movement by 4 pixels and Shift+arrow movement by 1 pixel.
- F13 activation and Escape in normal modal mode.
- Two actual letter key presses position the pointer at the selected target.
- The native client receives one button press and one button release.
- Disabling the extension removes overlay, input handlers, and virtual device.

Packaging tests validate ZIP contents and integrity, source extraction,
installation to temporary XDG directories, upgrade backup, and uninstall.
They use an unavailable D-Bus address to prevent contacting the real desktop.

The preview image is an actual screenshot of the synthetic test window.
It contains no personal application content.

Measured synchronous opening at 1280x720 changed from about 12-13 ms in
0.2.0 to about 1 ms with the single drawing layer. First repaint completed
about 21 ms after the activation handler began at 1280x720, and about 42 ms
at 2560x1600 on a cold rendering path. Subsequent opening paths were faster.
These are local headless observations, not hardware-to-photon latency or a
guarantee for the user's foreground session. The reported one-second delay
was not independently reproduced in the isolated environment.

Not yet verified for 0.3.0: the user's VS Code menu in the regular login
session, fractional scaling, mixed-scale physical multi-monitor layouts,
or GNOME versions other than 51.0/51.1 APIs. Only 51.1 was executed here.
The metadata deliberately supports only the GNOME 51 major series.

The prior 0.1.0 release was manually verified by the user for physical Alt+M,
clicking, Escape, and existing keyd Alt+A/D shortcuts. Version 0.3.0 still
requires a logout/login after installation before manual testing.
