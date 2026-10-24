import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const uuid = 'letter-pointer@inkble.local';
const mode = ARGV[0];
const stateDir = GLib.build_filenamev([GLib.get_user_state_dir(), 'letter-pointer']);
const backup = Gio.File.new_for_path(`${stateDir}/installer-settings.json`);
const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
const media = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.media-keys'});
const conflictKey = 'control-center-static';
const source = Gio.SettingsSchemaSource.new_from_directory(ARGV[1], Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.letter-pointer', false)});

if (mode === 'install' || mode === 'install-keyd') {
    if (!backup.query_exists(null)) {
        GLib.mkdir_with_parents(stateDir, 0o700);
        const stream = backup.create(Gio.FileCreateFlags.PRIVATE, null);
        stream.write_all(new TextEncoder().encode(JSON.stringify({
            controlCenter: media.get_strv(conflictKey),
            activate: settings.get_strv('letter-pointer-activate'),
        }, null, 2)), null);
        stream.close(null);
    }
    if (mode === 'install-keyd') {
        media.set_strv(conflictKey, media.get_strv(conflictKey).filter(key => key !== 'XF86Tools'));
        settings.set_strv('letter-pointer-activate', ['XF86Tools', '<Alt>m']);
    }
    const enabled = shell.get_strv('enabled-extensions');
    if (!enabled.includes(uuid))
        shell.set_strv('enabled-extensions', [...enabled, uuid]);
    shell.set_strv('disabled-extensions', shell.get_strv('disabled-extensions').filter(item => item !== uuid));
} else if (mode === 'uninstall') {
    shell.set_strv('enabled-extensions', shell.get_strv('enabled-extensions').filter(item => item !== uuid));
    shell.set_strv('disabled-extensions', shell.get_strv('disabled-extensions').filter(item => item !== uuid));
    if (backup.query_exists(null)) {
        const [, bytes] = backup.load_contents(null);
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        const after = saved.controlCenter.filter(key => key !== 'XF86Tools');
        // Do not overwrite shortcut changes made by the user after installation.
        if (JSON.stringify(media.get_strv(conflictKey)) === JSON.stringify(after))
            media.set_strv(conflictKey, saved.controlCenter);
    }
} else {
    throw new Error('Expected install, install-keyd, or uninstall');
}
Gio.Settings.sync();
