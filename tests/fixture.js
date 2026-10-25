import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';

Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const root = GLib.getenv('LETTER_POINTER_SOURCE');
const {default: Preferences} = await import(Gio.File.new_for_path(`${root}/extension/prefs.js`).get_uri());

const app = new Gtk.Application({application_id: 'org.letterpointer.Fixture'});
app.connect('activate', () => {
    Adw.init();
    const [, metadataBytes] = Gio.File.new_for_path(`${root}/extension/metadata.json`).load_contents(null);
    const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
    const preferences = new Preferences({...metadata, path: `${root}/extension`,
        dir: Gio.File.new_for_path(`${root}/extension`)});
    const preferencesWindow = new Adw.PreferencesWindow();
    preferences.fillPreferencesWindow(preferencesWindow);
    console.log('LETTER_TEST PASS preferences window created');
    preferencesWindow.destroy();
    const window = new Gtk.ApplicationWindow({application: app, title: 'Letter Pointer Test',
        default_width: 900, default_height: 560});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 20,
        margin_top: 40, margin_bottom: 40, margin_start: 40, margin_end: 40});
    const entry = new Gtk.Entry({text: 'Selection keys must not reach this field'});
    box.append(entry);
    const popup = new Gtk.Popover();
    const items = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
    for (const text of ['New File', 'Open Folder', 'Save', 'Close'])
        items.append(new Gtk.Button({label: text}));
    popup.set_child(items);
    const button = new Gtk.MenuButton({label: 'File', popover: popup});
    box.append(button);
    window.set_child(box);
    let clicks = 0;
    const gesture = new Gtk.GestureClick({propagation_phase: Gtk.PropagationPhase.CAPTURE});
    gesture.connect('pressed', () => clicks++);
    gesture.connect('released', () => clicks++);
    window.add_controller(gesture);
    window.present();
    entry.grab_focus();
    const api = Gio.DBusExportedObject.wrapJSObject(
        '<node><interface name="org.letterpointer.Fixture"><method name="State"><arg type="s" direction="out"/></method><method name="Popup"/></interface></node>', {
            State: () => JSON.stringify({active: window.is_active, popup: popup.visible, text: entry.text, clicks}),
            Popup: () => popup.popup(),
        });
    api.export(Gio.DBus.session, '/org/letterpointer/Fixture');
    // Keep the exported object alive across GC during longer rendering tests.
    app.fixtureApi = api;
});
app.run([]);
