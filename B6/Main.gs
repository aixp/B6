uses GLib
uses Gtk

uses B6

const PACKAGE: string = "B6"
const LOCALEDIR: string = "mo"

const VERSION: string = "0.1"

def private initIntl ()
	GLib.Intl.setlocale(GLib.LocaleCategory.ALL, "")
	GLib.Intl.bindtextdomain(PACKAGE, LOCALEDIR)
	GLib.Intl.bind_textdomain_codeset(PACKAGE, "UTF-8")
	GLib.Intl.textdomain(PACKAGE)

def private initCSS ()
	var cssProvider = new Gtk.CssProvider()
	cssProvider.load_from_resource("/B6.css")
	Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

init
	initIntl()

	if args.length == 2
		Gtk.init(ref args)

		initCSS()

		B6.init(args[1])
		B6.b6.set_title(B6.b6.title + " " + VERSION)
		B6.b6.destroy.connect(Gtk.main_quit)

		Gtk.main()

		B6.close()
	else
		print("usage: %s device", args[0])
