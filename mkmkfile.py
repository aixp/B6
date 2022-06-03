#! /usr/bin/env python3
# -*- coding: utf-8 -*-
#
# Alexander Shiryaev, 2021.05, 2021.11
#

import sys, os, re

def readFile (fileName):
	with open(fileName, 'rb') as fh:
		s = fh.read().decode('utf-8')
	return s

def srcFileName (name, level=3):
	if os.path.exists(name + '.gs'):
		fileName = name + '.gs'
	elif os.path.exists(name + '_' + OS + '.gs'):
		fileName = name + '_' + OS + '.gs'
	elif os.path.exists(name + '.vala'):
		fileName = name + '.vala'
	elif os.path.exists(name + '_' + OS + '.vala'):
		fileName = name + '_' + OS + '.vala'
	elif os.path.exists(name + '.vapi'):
		fileName = name + '.vapi'
	elif os.path.exists(name + '_' + OS + '.vapi'):
		fileName = name + '_' + OS + '.vapi'
	else:
		level = level - 1
		if level > 0:
			fileName = srcFileName(os.path.join('..', name), level=level)
		else:
			fileName = None
	return fileName

_pImp = re.compile("uses ([^\n]+)\n")

def addSrc (targets, pkgs, name):
	if name in targets:
		return

	fileName = srcFileName(name)

	if fileName == None:
		sys.stderr.write('%s source file not found\n' % (name,))
	else:
		vv = []
		targets[name] = vv

		src = readFile(fileName)
		for s in _pImp.findall(src):
			ss = s.strip()
			if ss in ('GLib', 'Gtk', 'Gdk', 'Cairo', 'Json', 'Sqlite', 'Soup', 'Gee'):
				pkgs.add(ss)
			elif srcFileName(ss) != None:
				vv.append(ss)
				addSrc(targets, pkgs, ss)
		if 'GLib.Math' in src:
			pkgs.add('GLib.Math')

def pkgDeps (x):
	p = []
	if 'Gtk' in x:
		p.append("gtk+-3.0")
	else:
		if 'Gdk' in x:
			p.append("gdk-3.0")
		if 'GLib' in x:
			p.append("glib-2.0")
			p.append("gio-2.0") # FIXME: not always required
		if 'Cairo' in x:
			p.append("cairo")
	if 'Soup' in x:
		p.append('libsoup-3.0')
	if 'Json' in x:
		p.append('json-glib-1.0')
	if 'Gee' in x:
		p.append('gee-0.8')
	if 'Sqlite' in x:
		p.append('sqlite3')
	return p

extToLang = {
	'gs': 'Vala',
	'vala': 'Vala',
	'ui': 'Glade'
}

def process (fh, exe, mainSrc, langs):
	targets = {}
	pkgs = set()
	addSrc(targets, pkgs, mainSrc)

	if OS == "Windows":
		exeSuffix = ".exe"
	else:
		exeSuffix = ""

	exeGUI = exe + exeSuffix
	exeConsole = exe + "_console" + exeSuffix

	fh.write('# this file generated automatically\n\n')

	fh.write("NAME = %s\n\n" % (exe,))

	fh.write("VALAC ?= valac\n")
	fh.write('VALACFLAGS += --save-temps -X -I.. -X -DGETTEXT_PACKAGE=\\"%s\\"\n\n' % (exe,))

	if OS == "Windows":
		fh.write("EXPORT_DIR_SUFFIX ?=\n")
		fh.write("EXPORT_DIR ?= PC-${NAME}${EXPORT_DIR_SUFFIX}\n\n")
	else:
		fh.write("EXPORT_DIR ?= PC-${NAME}\n\n")

	if os.path.exists('Makefile.incHeader'):
		fh.write( readFile('Makefile.incHeader') )

	fh.write(".PHONY: all export clean\n\n")

	fh.write( "all: %s" % (exeGUI,) )
	if OS == "Windows":
		fh.write(" %s" % (exeConsole,))
	if os.path.exists('Makefile.incAll'):
		fh.write( ' ' + readFile('Makefile.incAll').strip() )
	fh.write("\n\n")

	allSrcs = set()
	addDeps = set()
	trD = {}
	trSrcs = set()
	for k in targets:
		x = srcFileName(k)
		allSrcs.add(x)
		ext = x.split('.')[-1]
		if x.endswith('.vapi'):
			y = x[:-5] + '.c'
			if os.path.exists(y):
				allSrcs.add(y)
			y = x[:-5] + '.h'
			if os.path.exists(y):
				addDeps.add(y)
		ext = x.split('.')[-1]
		y = extToLang.get(ext)
		if y != None:
			trD.setdefault(y, []).append(x)
			trSrcs.add(x)

	gResources = False
	if os.path.exists("%s.gresource.xml" % (exe,)):
		z = re.compile('>([^<]+)</file>').findall(readFile("%s.gresource.xml" % (exe,)))
		for x in z:
			ext = x.split('.')[-1]
			y = extToLang.get(ext)
			if y != None:
				trD.setdefault(y, []).append(x)
				trSrcs.add(x)

		fh.write("resources.c: %s ${NAME}.gresource.xml\n" % (' '.join(z),))
		fh.write("\tglib-compile-resources --target=resources.c --generate-source ${NAME}.gresource.xml\n\n")

		allSrcs.add("resources.c")

		gResources = True
		addDeps.add("${NAME}.gresource.xml")

	if (len(trD) > 0) and (len(langs) > 0):
		fh.write("${NAME}.pot: %s\n" % (' '.join(trSrcs),))
		isFirst = True
		i = 0
		for k, v in trD.items():
			isLast = i == len(trD) - 1
			a = ['xgettext --force-po']
			if not isFirst:
				a.append('--join-existing')
			if isLast:
				a.append('--package-name ${NAME} --package-version 0.1 --default-domain ${NAME}')
			a.append('--output ${NAME}.pot -L %s' % (k,))
			if k not in ('Glade',):
				a.append('--from-code=UTF-8')
			a.extend(v)
			fh.write('	%s\n' % (' '.join(a),))
			i += 1
			isFirst = False
		fh.write("	sed --in-place ${NAME}.pot --expression='s/CHARSET/UTF-8/'\n")
		fh.write("	grep -v POT-Creation-Date ${NAME}.pot > ${NAME}.pot.tmp\n")
		fh.write("	mv ${NAME}.pot.tmp ${NAME}.pot\n")
		fh.write('\n')

		moDeps = []
		for lang in langs:
			fh.write('${NAME}_%s.po: ${NAME}.pot\n' % (lang,))
			fh.write('	[ -f "${NAME}_%s.po" ] && msgmerge --no-fuzzy-matching ${NAME}_%s.po ${NAME}.pot --output-file=${NAME}_%s.po || msginit --no-translator --locale %s --output-file ${NAME}_%s.po --input ${NAME}.pot\n\n' % (lang, lang, lang, lang, lang))

			x = "mo/%s/LC_MESSAGES/${NAME}.mo" % (lang,)
			moDeps.append(x)
			fh.write("%s: ${NAME}_%s.po\n" % (x, lang))
			fh.write("	mkdir -p mo/%s/LC_MESSAGES\n" % (lang,))
			fh.write("	msgfmt --check --verbose --output-file mo/%s/LC_MESSAGES/${NAME}.mo ${NAME}_%s.po\n\n" % (lang, lang))
		fh.write("all: %s\n\n" % (' '.join(moDeps),))
		fh.write("export: %s\n\n" % (' '.join(moDeps),))

	allSrcs = ' '.join(allSrcs)
	addDeps = ' '.join(addDeps)

	fh.write("SRCS += %s\n\n" % (allSrcs,))

	fh.write("DEPS += ${SRCS}")
	if addDeps != '':
		fh.write(" %s" % (addDeps,))
	fh.write("\n\n")

	# exe target
	fh.write("%s: ${DEPS}\n" % (exeGUI,))
	fh.write("\t${VALAC} ${VALACFLAGS} -o %s" % (exeGUI,))
	p = pkgDeps(pkgs)
	for pp in p:
		fh.write(" --pkg %s" % (pp,))
	if 'GLib.Math' in pkgs:
		fh.write(' -X -lm')
	if 'cairo_jpg' in targets:
		fh.write(' -X -ljpeg')
	if gResources:
		fh.write(" --gresources=${NAME}.gresource.xml")
	fh.write(" ${SRCS}")
	if OS == "Windows":
		fh.write(" -X -mwindows")
	fh.write('\n\n')

	if OS == "Windows":
		# exe console target
		fh.write("%s: ${DEPS}\n" % (exeConsole,))
		fh.write("\t${VALAC} ${VALACFLAGS} -o %s" % (exeConsole,))
		p = pkgDeps(pkgs)
		for pp in p:
			fh.write(" --pkg %s" % (pp,))
		if 'GLib.Math' in pkgs:
			fh.write(' -X -lm')
		if gResources:
			fh.write(" --gresources=${NAME}.gresource.xml")
		fh.write(" ${SRCS}")
		fh.write('\n\n')

	if OS == "Windows":
		fh.write("export: %s %s\n" % (exeGUI, exeConsole))
		if 'Gtk' in pkgs:
			fh.write("\t../mingw-export-gtk ${EXPORT_DIR} || true\n")
		else:
			fh.write("\t../mingw-export-glib ${EXPORT_DIR} || true\n")
		fh.write("	cp -p %s %s ${EXPORT_DIR}/\n" % (exeGUI, exeConsole))
		fh.write("	${STRIP} -s ${EXPORT_DIR}/%s ${EXPORT_DIR}/%s\n" % (exeGUI, exeConsole))
		fh.write('	echo "set XDG_DATA_DIRS=share" > ${EXPORT_DIR}/%s\n' % (exeGUI.split('.')[0]+'.cmd',))
		fh.write('	echo "%s" >> ${EXPORT_DIR}/%s\n' % (exeGUI, exeGUI.split('.')[0]+'.cmd'))
		fh.write('	echo "set XDG_DATA_DIRS=share" > ${EXPORT_DIR}/%s\n' % (exeConsole.split('.')[0]+'.cmd',))
		fh.write('	echo "%s" >> ${EXPORT_DIR}/%s\n' % (exeConsole, exeConsole.split('.')[0]+'.cmd'))
		fh.write("	cp -Rp mo ${EXPORT_DIR}/ || true\n\n")
	else:
		fh.write("export: %s\n" % (exeGUI,))
		fh.write("	mkdir -p ${EXPORT_DIR}\n")
		fh.write("	cp -p %s ${EXPORT_DIR}/\n" % (exeGUI,))
		fh.write("	strip -s ${EXPORT_DIR}/%s\n" % (exeGUI,))
		fh.write("	cp -p ${NAME}.svg ${EXPORT_DIR}/ || echo 'icon not found'\n")
		fh.write("	cp -Rp mo ${EXPORT_DIR}/ || true\n")

		fh.write("	echo '#!/bin/sh' > ${EXPORT_DIR}/${NAME}.run\n")
		fh.write("	echo >> ${EXPORT_DIR}/${NAME}.run\n")
		fh.write('	echo \'rn=`readlink -f "$${0}"`\' >> ${EXPORT_DIR}/${NAME}.run\n')
		fh.write("	echo 'cd `dirname \"$${rn}\"` && exec ./%s' >> ${EXPORT_DIR}/${NAME}.run\n" % (exeGUI,))
		fh.write("	chmod +x ${EXPORT_DIR}/%s.run\n\n" % (exe,))

	if os.path.exists('Makefile.incTargets'):
		fh.write( readFile('Makefile.incTargets') )

	fh.write("clean:\n\trm -rf *.c ${NAME}.pot mo %s" % (exeGUI,))
	if OS == "Windows":
		fh.write(" %s" % (exeConsole,))

	if os.path.exists('Makefile.incClean'):
		fh.write( ' ' + readFile('Makefile.incClean').strip() )

	fh.write('\n')

def main ():
	global OS

	if len(sys.argv) == 4:
		exe = sys.argv[1]
		mainSrc = sys.argv[2]
		OS = sys.argv[3]

		process(sys.stdout, exe, mainSrc, [])
	elif len(sys.argv) == 5:
		exe = sys.argv[1]
		mainSrc = sys.argv[2]
		OS = sys.argv[3]
		langs = sys.argv[4]

		process(sys.stdout, exe, mainSrc, langs.split())
	else:
		print("usage: %s exe mainSrc OS [ langs ]" % (sys.argv[0],))

if __name__ == '__main__':
	main()
