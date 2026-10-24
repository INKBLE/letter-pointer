import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const root = GLib.getenv('LETTER_POINTER_SOURCE');
const {default: LetterPointer} = await import(Gio.File.new_for_path(`${root}/extension/extension.js`).get_uri());
const sleep = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
function check(value, name) {
    if (!value)
        throw new Error(name);
    console.log(`LETTER_TEST PASS ${name}`);
}

export default class IntegrationTest extends LetterPointer {
    _open(preserveFocus = false) {
        const start = GLib.get_monotonic_time();
        this._openedAt = start;
        super._open(preserveFocus);
        console.log(`LETTER_TEST OPEN_MS menu=${preserveFocus} ${(GLib.get_monotonic_time() - start) / 1000}`);
    }

    _paint() {
        const start = GLib.get_monotonic_time();
        super._paint();
        console.log(`LETTER_TEST PAINT_MS ${(GLib.get_monotonic_time() - start) / 1000} OPEN_TO_PAINT_MS ${(GLib.get_monotonic_time() - this._openedAt) / 1000}`);
    }

    getSettings() {
        const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/extension/schemas`,
            Gio.SettingsSchemaSource.get_default(), false);
        return new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.letter-pointer', false)});
    }

    enable() {
        super.enable();
        this._settings.set_strv('letter-pointer-activate', ['XF86Tools', '<Alt>m']);
        this._test().catch(e => {
            console.error(`LETTER_TEST FAIL ${e}: ${e.stack}`);
            global.context.terminate();
        });
    }

    async _test() {
        await sleep(2000);
        Main.overview.hide();
        const fixture = Gio.Subprocess.new(['gjs', '-m', `${root}/tests/fixture.js`], Gio.SubprocessFlags.NONE);
        await sleep(2000);
        const window = global.get_window_actors().map(actor => actor.meta_window)
            .find(window => window.get_title() === 'Letter Pointer Test');
        check(Boolean(window), 'native fixture window exists');
        window.activate(global.get_current_time());
        await sleep(300);
        const keyboard = global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const press = code => keyboard.notify_key(GLib.get_monotonic_time(), code, Clutter.KeyState.PRESSED);
        const release = code => keyboard.notify_key(GLib.get_monotonic_time(), code, Clutter.KeyState.RELEASED);
        const tap = async code => { press(code); await sleep(40); release(code); await sleep(100); };
        const call = method => new Promise((resolve, reject) => Gio.DBus.session.call(
            'org.letterpointer.Fixture', '/org/letterpointer/Fixture',
            'org.letterpointer.Fixture', method, null, null, Gio.DBusCallFlags.NONE,
            3000, null, (connection, result) => {
                try { resolve(connection.call_finish(result).deep_unpack()); }
                catch (error) { reject(error); }
            }));
        const state = async () => JSON.parse((await call('State'))[0]);
        await sleep(300);
        check((await state()).active, 'native application focused');
        await call('Popup');
        await sleep(200);
        check((await state()).popup, 'native popup visible');
        press(29); press(125); press(50);
        await sleep(80);
        release(50); release(125); release(29);
        await sleep(200);
        check(Boolean(this._overlay) && !this._grab, 'menu shortcut opens nonmodal overlay');
        const openedState = await state();
        check(openedState.active && openedState.popup, 'popup and application focus preserved');
        if (GLib.getenv('LETTER_POINTER_SCREENSHOT')) {
            const stream = Gio.File.new_for_path(GLib.getenv('LETTER_POINTER_SCREENSHOT'))
                .replace(null, false, Gio.FileCreateFlags.NONE, null);
            const screenshot = new Shell.Screenshot();
            await new Promise((resolve, reject) => screenshot.screenshot(false, stream, (object, result) => {
                try { object.screenshot_finish(result); resolve(); }
                catch (error) { reject(error); }
            }));
            stream.close(null);
        }
        const text = openedState.text;
        await tap(30);
        check(this._prefix === 'a', 'native selection key captured without focus grab');
        const selectedState = await state();
        check(selectedState.text === text && selectedState.popup, 'selection key does not leak to app');
        press(57); await sleep(100);
        check(this._labels.every(label => !label.visible), 'space hides all hints');
        release(57); await sleep(100);
        check(this._labels.some(label => label.visible), 'space release restores hints');
        const firstX = this._labels[0].x;
        await tap(106);
        check(this._labels[0].x === firstX + 4, 'arrow moves target points four pixels');
        press(42); await tap(105); release(42); await sleep(100);
        check(this._labels[0].x === firstX + 3, 'shift arrow moves target points one pixel');
        await tap(14);
        check(!this._overlay && !this._captureSignal, 'backspace cancels and releases selection keys');
        const closedState = await state();
        check(closedState.active && closedState.popup, 'backspace cancellation preserves popup');
        await tap(1);
        await tap(183);
        check(Boolean(this._overlay) && Boolean(this._grab), 'F13 normal activation');
        const labels = this._labels;
        check(labels.length >= 468, 'default grid is denser');
        await tap(14);
        check(!this._overlay && !this._grab, 'normal mode releases grab');
        Main.overview.show();
        await sleep(500);
        await tap(183);
        check(Boolean(this._overlay) && Boolean(this._grab), 'F13 activates from Overview');
        await tap(14);
        check(!this._overlay && Main.overview.visible, 'backspace cancels without closing Overview');
        press(29); press(125); await tap(50); release(125); release(29);
        await sleep(150);
        check(Boolean(this._overlay) && Boolean(this._grab), 'menu shortcut uses modal selection in Overview');
        await tap(1);
        Main.overview.hide();
        await sleep(500);
        const panelMenu = Main.panel.statusArea.dateMenu.menu;
        panelMenu.open();
        await sleep(250);
        await tap(183);
        check(Boolean(this._overlay), 'F13 activates from Shell panel popup');
        await tap(14);
        check(!this._overlay && panelMenu.isOpen, 'backspace preserves underlying panel popup');
        panelMenu.close();
        await sleep(250);
        window.activate(global.get_current_time());
        await sleep(150);
        this._open(true);
        const frame = window.get_frame_rect();
        const selected = this._labels.find(label => label.x > frame.x + 40 && label.x < frame.x + frame.width - 40 &&
            label.y > frame.y + 300 && label.y < frame.y + frame.height - 40);
        check(Boolean(selected), 'click target inside native client');
        const clicks = (await state()).clicks;
        const keycodes = [30,48,46,32,18,33,34,35,23,36,37,38,50,49,24,25,16,19,31,20,22,47,17,45,21,44];
        for (const letter of selected.text)
            await tap(keycodes[letter.charCodeAt(0) - 97]);
        await sleep(200);
        const [x, y] = global.get_pointer();
        check(!this._overlay && Math.abs(x - selected.x) < 2 && Math.abs(y - selected.y) < 2,
            'two real letter key events select exact target');
        check((await state()).clicks - clicks === 2, 'native client receives click press and release');
        this._open(true);
        this.disable();
        check(!this._overlay && !this._captureSignal && !this._pointer, 'disable cleans resources');
        keyboard.run_dispose();
        fixture.force_exit();
        console.log('LETTER_TEST COMPLETE');
        global.context.terminate();
    }

    disable() {
        if (this._pointer)
            super.disable();
    }
}
