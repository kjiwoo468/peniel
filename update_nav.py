#!/usr/bin/env python3
"""
Run this script from your Peniel website root directory to update navigation
across all existing HTML files and fix conclusion cards on end-of-category pages.

Usage:  python3 update_nav.py
The script modifies files IN PLACE (creates .bak backups first).
"""
import os, re, shutil, sys

# ─── New nav items to inject ───────────────────────────────────────────────────

SCRIPTURE_INJECTION = """          <a href="historical-jesus.html">The Historical Jesus</a>
          <a href="messianic-prophecy.html">Messianic Prophecy &amp; Fulfillment</a>"""

ETHICS_INJECTION = """          <a href="capital-punishment.html">Capital Punishment &amp; Justice</a>
          <a href="just-war.html">Just War &amp; Christian Pacifism</a>
          <a href="environmental-stewardship.html">Environmental Stewardship</a>
          <a href="gender-identity.html">Gender, Identity &amp; the Body</a>"""

HISTORY_INJECTION = """          <a href="antisemitism.html">Anti-Semitism &amp; the Church</a>
          <a href="crusades.html">The Crusades &amp; Christian Violence</a>"""

SALVATION_INJECTION = """          <a href="atonement.html">The Atonement: How Does Jesus Save?</a>
          <a href="baptism.html">Baptism: Mode, Meaning &amp; Necessity</a>
          <a href="problem-of-evil.html">The Problem of Evil &amp; Suffering</a>"""

SCIENCE_INJECTION = """          <a href="spiritual-gifts.html">Spiritual Gifts &amp; Tongues</a>
          <a href="consciousness-soul.html">Consciousness, Soul &amp; Neuroscience</a>
          <a href="mental-health.html">Mental Health &amp; the Church</a>"""

# ─── Conclusion-card replacements for end-of-category pages ───────────────────

CONCLUSION_FIXES = {
    # key = filename, value = (old_snippet, new_snippet)
    "documentary-hypothesis.html": (
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Scripture &amp; Interpretation complete</p><h2>You\'ve finished all six Scripture topics</h2>\n  <p>Next, explore the Ethics &amp; Human Sexuality category — where the church is most visibly divided today.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="ethics.html">Go to Ethics &rarr;</a>',
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Up next in Scripture</p><h2>The Historical Jesus</h2>\n  <p>Josephus, Tacitus, and what non-Christian sources actually say about Jesus — examined honestly.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="historical-jesus.html">Continue &rarr;</a>'
    ),
    "wealth-poverty.html": (
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Ethics &amp; Human Sexuality complete</p><h2>You\'ve finished all five Ethics topics</h2>\n  <p>Next, explore History &amp; Justice — slavery, holy war, and the troubled history of biblical misuse.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="history.html">Go to History &rarr;</a>',
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Up next in Ethics</p><h2>Capital Punishment &amp; Justice</h2>\n  <p>Genesis 9:6, Romans 13, and the divided Christian conscience on the death penalty.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="capital-punishment.html">Continue &rarr;</a>'
    ),
    "conquest-archaeology.html": (
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">History &amp; Justice complete</p><h2>You\'ve finished all five History topics</h2>\n  <p>Next, explore Heaven, Hell &amp; Salvation — eternity, divine sovereignty, and who gets in.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="salvation.html">Go to Salvation &rarr;</a>',
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Up next in History</p><h2>Anti-Semitism &amp; the Church</h2>\n  <p>How Matthew 27:25 and John 8:44 were weaponized — and what responsible theology requires.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="antisemitism.html">Continue &rarr;</a>'
    ),
    "infant-salvation.html": (
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Heaven, Hell &amp; Salvation complete</p><h2>You\'ve finished all five Salvation topics</h2>\n  <p>Next, explore Faith &amp; Science — creation, evolution, miracles, and the age of the universe.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="science.html">Go to Science &rarr;</a>',
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Up next in Salvation</p><h2>The Atonement: How Does Jesus Save?</h2>\n  <p>Penal substitution, Christus Victor, moral influence — how Christ\'s death actually saves.</p>\n  <div class="conclusion-card__actions"><a class="btn btn--gold" href="atonement.html">Continue &rarr;</a>'
    ),
    "faith-science-history.html": (
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">You\'ve reached the end of the Faith &amp; Science category</p>\n    <h2>All five categories now complete</h2>\n    <p>You\'ve worked through all 26 topics across Scripture, Ethics, History, Salvation, and Science. Wrestling with hard questions is not a threat to faith — it is a form of it.</p>\n    <div class="conclusion-card__actions">\n      <a class="btn btn--gold" href="index.html">Return to all categories</a>\n      <a class="btn btn--ghost" style="border-color:rgba(255,255,255,.4);color:rgba(255,255,255,.8);" href="inerrancy.html">Start again from the beginning</a>\n    </div>',
        '<p class="eyebrow" style="color:var(--gold);margin-bottom:.4rem;">Up next in Science</p>\n    <h2>Spiritual Gifts &amp; Tongues</h2>\n    <p>Did the miraculous gifts cease with the apostles — or does the Spirit still give them today?</p>\n    <div class="conclusion-card__actions">\n      <a class="btn btn--gold" href="spiritual-gifts.html">Continue &rarr;</a>\n      <a class="btn btn--ghost" style="border-color:rgba(255,255,255,.4);color:rgba(255,255,255,.8);" href="science.html">Back to Science topics</a>\n    </div>'
    ),
}

# ─── Nav injection anchors ─────────────────────────────────────────────────────

INJECTIONS = [
    ('<a href="documentary-hypothesis.html">The Documentary Hypothesis</a>', SCRIPTURE_INJECTION),
    ('<a href="wealth-poverty.html">Wealth, Poverty &amp; the Prosperity Gospel</a>', ETHICS_INJECTION),
    ('<a href="conquest-archaeology.html">The Conquest of Canaan &amp; Archaeology</a>', HISTORY_INJECTION),
    ('<a href="infant-salvation.html">What Happens to Infants Who Die?</a>', SALVATION_INJECTION),
    ('<a href="faith-science-history.html">Faith &amp; Science History</a>', SCIENCE_INJECTION),
]

# ─── Main ──────────────────────────────────────────────────────────────────────

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content

    # Inject new nav items (only if not already present)
    for anchor, injection in INJECTIONS:
        if anchor in content and injection.strip().split('\n')[0].strip() not in content:
            content = content.replace(anchor, anchor + '\n' + injection)

    # Fix conclusion cards
    fname = os.path.basename(path)
    if fname in CONCLUSION_FIXES:
        old, new = CONCLUSION_FIXES[fname]
        if old in content:
            content = content.replace(old, new)

    if content != original:
        shutil.copy2(path, path + '.bak')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    html_files = [f for f in os.listdir('.') if f.endswith('.html')
                  and f not in ('login.html', 'register.html')]
    changed, skipped = [], []
    for fname in sorted(html_files):
        if process_file(fname):
            changed.append(fname)
        else:
            skipped.append(fname)
    print(f"Updated {len(changed)} files: {', '.join(changed)}")
    print(f"Unchanged: {len(skipped)} files")

if __name__ == '__main__':
    main()
