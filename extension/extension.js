import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ACTIVE_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP;

export default class LetterPointer extends Extension {
    enable() {
        this._settings = this.getSettings();
        const seat = global.stage.context.get_backend().get_default_seat();
        this._pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        Main.wm.addKeybinding('letter-pointer-activate', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, ACTIVE_MODES,
            () => this._open());
        Main.wm.addKeybinding('letter-pointer-menu', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, ACTIVE_MODES,
            () => this._open(true));
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._close());
        this._sessionSignal = Main.sessionMode.connect('updated', () => this._close());
    }

    disable() {
        Main.wm.removeKeybinding('letter-pointer-activate');
        Main.wm.removeKeybinding('letter-pointer-menu');
        Main.layoutManager.disconnect(this._monitorSignal);
        Main.sessionMode.disconnect(this._sessionSignal);
        this._close();
        this._pointer?.run_dispose();
        this._pointer = null;
        this._settings = null;
    }

    _open(preserveFocus = false) {
        if (this._overlay || this._clickTimer || Main.sessionMode.isLocked)
            return;
        // Overview needs a nested grab to keep letters out of search. Panel
        // popups must retain their own grab or they dismiss on loss of focus.
        preserveFocus = Main.actionMode === Shell.ActionMode.POPUP ||
            (preserveFocus && Main.actionMode === Shell.ActionMode.NORMAL);
        const [x, y] = global.get_pointer();
        this._monitorIndex = Math.max(0, Main.layoutManager.monitors.findIndex(m =>
            x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height));
        this._overlay = new St.Widget({reactive: !preserveFocus, can_focus: !preserveFocus,
            layout_manager: new Clutter.FixedLayout()});
        this._overlay.set_size(global.stage.width, global.stage.height);
        Main.layoutManager.addTopChrome(this._overlay);
        if (!preserveFocus) {
            this._grab = Main.pushModal(this._overlay);
            if (this._grab.is_revoked()) {
                this._close();
                return;
            }
        }
        this._held = new Set();
        this._drawing = new St.DrawingArea({width: global.stage.width, height: global.stage.height});
        this._drawing.connect('repaint', () => this._paint());
        this._overlay.add_child(this._drawing);
        if (!preserveFocus) {
            this._overlay.connect('key-press-event', (_actor, event) => this._press(event));
            this._overlay.connect('key-release-event', (_actor, event) => this._release(event));
        }
        this._captureSignal = global.stage.connect('captured-event', (_stage, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS) {
                this._close();
                return preserveFocus ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._draw();
        if (preserveFocus && !this._grabMenuKeys()) {
            this._close();
            Main.notify('Letter Pointer', 'A selection key is already reserved by another shortcut.');
            return;
        }
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._timeout = 0;
            this._close();
            return GLib.SOURCE_REMOVE;
        });
    }

    _grabMenuKeys() {
        this._menuActions = new Map();
        const bindings = [...LETTERS].map(letter => [letter, letter.charCodeAt(0)]);
        bindings.push(['Escape', Clutter.KEY_Escape], ['BackSpace', Clutter.KEY_BackSpace],
            ['Tab', Clutter.KEY_Tab], ['space', Clutter.KEY_space]);
        for (const name of ['Left', 'Right', 'Up', 'Down']) {
            bindings.push([name, Clutter[`KEY_${name}`], 0]);
            bindings.push([`<Shift>${name}`, Clutter[`KEY_${name}`], Clutter.ModifierType.SHIFT_MASK]);
        }
        for (const [name, key, state = 0] of bindings) {
            const action = global.display.grab_accelerator(name,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT | Meta.KeyBindingFlags.TRIGGER_RELEASE);
            if (!action)
                return false;
            this._menuActions.set(action, {get_key_code: () => key, get_key_symbol: () => key,
                get_state: () => state});
            Main.wm.allowKeybinding(Meta.external_binding_name_for_action(action), ACTIVE_MODES);
        }
        this._activatedSignal = global.display.connect('accelerator-activated', (_display, action) => {
            const event = this._menuActions?.get(action);
            if (event)
                this._press(event);
        });
        this._deactivatedSignal = global.display.connect('accelerator-deactivated', (_display, action) => {
            const event = this._menuActions?.get(action);
            if (event)
                this._release(event);
        });
        this._focusSignal = global.display.connect('notify::focus-window', () => this._close());
        return true;
    }

    _draw() {
        this._prefix = '';
        this._selected = null;
        this._peeking = false;
        this._labels = [];
        const m = Main.layoutManager.monitors[this._monitorIndex];
        const spacing = this._settings.get_int('grid-spacing');
        const cols = Math.max(1, Math.min(26, Math.floor(m.width / spacing)));
        const rows = Math.max(1, Math.min(26, Math.floor(m.height / spacing)));
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const text = LETTERS[row] + LETTERS[col];
                const x = Math.floor(m.x + (col + 0.5) * m.width / cols);
                const y = Math.floor(m.y + (row + 0.5) * m.height / rows);
                this._labels.push({text, x, y, visible: true});
            }
        }
        this._drawing.queue_repaint();
    }

    _paint() {
        const cr = this._drawing.get_context();
        try {
            const monitor = Main.layoutManager.monitors[this._monitorIndex];
            const size = this._settings.get_int('font-size');
            const alpha = this._settings.get_double('background-opacity');
            const font = Pango.FontDescription.from_string('monospace');
            font.set_absolute_size(size * Pango.SCALE);
            const layout = PangoCairo.create_layout(cr);
            layout.set_font_description(font);
            layout.set_text('mm', -1);
            const [width, height] = layout.get_pixel_size();
            for (const label of this._labels) {
                if (!label.visible)
                    continue;
                const x = Math.max(monitor.x, Math.min(label.x + 4, monitor.x + monitor.width - width - 4));
                const y = Math.max(monitor.y, Math.min(label.y + 3, monitor.y + monitor.height - height));
                cr.setSourceRGBA(0.06, 0.06, 0.06, alpha);
                cr.rectangle(x, y, width + 4, height);
                cr.fill();
                layout.set_text(label.text, -1);
                cr.moveTo(x + 2, y + 1);
                cr.setSourceRGBA(0, 0, 0, 0.85);
                PangoCairo.show_layout(cr, layout);
                cr.moveTo(x + 2, y);
                cr.setSourceRGB(1, 0.95, 0.68);
                PangoCairo.show_layout(cr, layout);
                cr.rectangle(label.x - 1, label.y - 1, 2, 2);
                cr.fill();
            }
        } finally {
            cr.$dispose();
        }
    }

    _movePoints(dx, dy) {
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        for (const label of this._labels) {
            label.x = monitor.x + (label.x - monitor.x + dx + monitor.width) % monitor.width;
            label.y = monitor.y + (label.y - monitor.y + dy + monitor.height) % monitor.height;
        }
        this._drawing.queue_repaint();
    }

    _refreshLabels() {
        for (const label of this._labels) {
            const visible = !this._peeking && label.text.startsWith(this._prefix);
            label.visible = visible;
        }
        this._drawing.queue_repaint();
    }

    _release(event) {
        const captured = this._held.has(event.get_key_code());
        this._held.delete(event.get_key_code());
        if (event.get_key_symbol() === Clutter.KEY_space) {
            this._peeking = false;
            this._refreshLabels();
        }
        if (this._selected && this._held.size === 0)
            this._clickSelected();
        return captured ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    _press(event) {
        const code = event.get_key_code();
        if (this._held.has(code))
            return Clutter.EVENT_STOP;
        this._held.add(code);
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape || key === Clutter.KEY_BackSpace) {
            this._close();
        } else if ([Clutter.KEY_Left, Clutter.KEY_Right, Clutter.KEY_Up, Clutter.KEY_Down].includes(key)) {
            const step = event.get_state() & Clutter.ModifierType.SHIFT_MASK ? 1 : 4;
            this._movePoints(key === Clutter.KEY_Left ? -step : key === Clutter.KEY_Right ? step : 0,
                key === Clutter.KEY_Up ? -step : key === Clutter.KEY_Down ? step : 0);
        } else if (key === Clutter.KEY_space) {
            this._peeking = true;
            this._refreshLabels();
        } else if (key === Clutter.KEY_Tab) {
            this._monitorIndex = (this._monitorIndex + 1) % Main.layoutManager.monitors.length;
            this._draw();
        } else if (!this._selected) {
            const letter = String.fromCodePoint(Clutter.keysym_to_unicode(key)).toLowerCase();
            if (LETTERS.includes(letter) && letter.length === 1) {
                const prefix = this._prefix + letter;
                const matches = this._labels.filter(label => label.text.startsWith(prefix));
                if (matches.length) {
                    this._prefix = prefix;
                    this._refreshLabels();
                    if (prefix.length === 2)
                        this._selected = matches[0];
                }
            }
        }
        return Clutter.EVENT_STOP;
    }

    _clickSelected() {
        const {x, y} = this._selected;
        this._close();
        // Release the modal grab and consume the final key release before clicking.
        const [startX, startY] = global.get_pointer();
        this._pointer.notify_relative_motion(GLib.get_monotonic_time(), x - startX, y - startY);
        this._clickTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
            const [px, py] = global.get_pointer();
            this._pointer.notify_relative_motion(GLib.get_monotonic_time(), x - px, y - py);
            this._clickTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                this._clickTimer = 0;
                const [actualX, actualY, mods] = global.get_pointer();
                if (Math.abs(actualX - x) > 1 || Math.abs(actualY - y) > 1 ||
                    Main.sessionMode.isLocked ||
                    (mods & (Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK |
                        Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.SHIFT_MASK)))
                    return GLib.SOURCE_REMOVE;
                this._pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
                this._pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _close() {
        for (const name of ['_activatedSignal', '_deactivatedSignal', '_focusSignal']) {
            if (this[name]) {
                global.display.disconnect(this[name]);
                this[name] = 0;
            }
        }
        for (const action of this._menuActions?.keys() ?? []) {
            Main.wm.allowKeybinding(Meta.external_binding_name_for_action(action), Shell.ActionMode.NONE);
            global.display.ungrab_accelerator(action);
        }
        this._menuActions = null;
        if (this._captureSignal) {
            global.stage.disconnect(this._captureSignal);
            this._captureSignal = 0;
        }
        for (const name of ['_timeout', '_clickTimer']) {
            if (this[name]) {
                GLib.Source.remove(this[name]);
                this[name] = 0;
            }
        }
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        if (this._overlay) {
            Main.layoutManager.removeChrome(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }
        this._drawing = null;
        this._labels = [];
        this._selected = null;
        this._held = null;
    }
}
