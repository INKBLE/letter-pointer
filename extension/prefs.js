import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LetterPointerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Letter Pointer', icon_name: 'input-mouse-symbolic'});
        const appearance = new Adw.PreferencesGroup({title: 'Appearance'});
        for (const [key, title, min, max, step, digits] of [
            ['font-size', 'Font size', 9, 24, 1, 0],
            ['background-opacity', 'Background opacity', 0, 1, 0.05, 2],
            ['grid-spacing', 'Grid spacing', 24, 140, 4, 0],
        ]) {
            const row = new Adw.SpinRow({title, digits,
                adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step * 2})});
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            appearance.add(row);
        }
        page.add(appearance);
        const shortcuts = new Adw.PreferencesGroup({title: 'Shortcuts'});
        const row = new Adw.EntryRow({title: 'Menu shortcut', show_apply_button: true,
            text: settings.get_strv('letter-pointer-menu')[0] ?? ''});
        row.set_tooltip_text('GTK accelerator, for example <Control><Super>m');
        row.connect('apply', () => {
            const [valid, key, modifiers] = Gtk.accelerator_parse(row.text);
            if (valid && Gtk.accelerator_valid(key, modifiers)) {
                settings.set_strv('letter-pointer-menu', [Gtk.accelerator_name(key, modifiers)]);
                row.remove_css_class('error');
            } else {
                row.add_css_class('error');
            }
        });
        shortcuts.add(row);
        page.add(shortcuts);
        window.add(page);
    }
}
