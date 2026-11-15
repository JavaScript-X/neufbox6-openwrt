#!/usr/bin/env python3
"""List the strings of the Neufbox pages to translate and update po/fr/nb6.po with them.

usage: python3 scripts/i18n-extract.py      (from the repository root)

Sources: _('...') in the LuCI views and helpers, the menu titles, and the error messages the
backend scripts send to the pages. Existing translations are kept; new strings get an empty
msgstr, strings no longer used are dropped.
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PO = os.path.join(ROOT, 'po', 'fr', 'nb6.po')


def sources():
    out = []

    def add(s):
        if s and s not in out:
            out.append(s)

    js = sorted(glob.glob(os.path.join(ROOT, 'files/www/luci-static/resources/view/nb6/*.js')))
    js += [os.path.join(ROOT, 'files/www/luci-static/resources/nb6', f) for f in ('icons.js', 'qr.js')]
    for f in js:
        for m in re.finditer(r"_\('((?:[^'\\]|\\.)*)'\)", open(f, encoding='utf-8').read()):
            add(m.group(1).replace("\\'", "'"))
    menu = json.load(open(os.path.join(ROOT, 'files/usr/share/luci/menu.d/luci-app-nb6.json'), encoding='utf-8'))
    for v in menu.values():
        add(v['title'])
    for f in ('usr/libexec/rpcd/luci.nb6', 'usr/sbin/nb6-guest', 'usr/sbin/nb6-wps', 'usr/sbin/nb6-update', 'usr/sbin/nb6-maint'):
        src = open(os.path.join(ROOT, 'files', f), encoding='utf-8').read()
        for pat in (r'"error":"([^"]+)"', r'echo "([a-z][^"$]*)" >&2', r'fail "([^"$]+)"', r'event "([^"$]+)"'):
            for m in re.finditer(pat, src):
                add(m.group(1))
    return out


def esc(s):
    return s.replace('\\', '\\\\').replace('"', '\\"')


def unesc(s):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), s)


def read_po(path):
    tr = {}
    if not os.path.exists(path):
        return tr
    msgid = None
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if line.startswith('msgid "'):
            msgid = unesc(line[7:-1])
        elif line.startswith('msgstr "') and msgid is not None:
            tr[msgid] = unesc(line[8:-1])
            msgid = None
    return tr


def main():
    old = read_po(PO)
    strings = sources()
    os.makedirs(os.path.dirname(PO), exist_ok=True)
    with open(PO, 'w', encoding='utf-8', newline='\n') as f:
        f.write('msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\n"\n"Language: fr\\n"\n\n')
        for s in strings:
            f.write('msgid "%s"\nmsgstr "%s"\n\n' % (esc(s), esc(old.get(s, ''))))
    missing = [s for s in strings if not old.get(s)]
    print('%d strings, %d without a translation' % (len(strings), len(missing)))
    for s in missing:
        print('  ' + s)


if __name__ == '__main__':
    main()
