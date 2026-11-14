"""Quote normalization and checking for GradQuest program research."""
from __future__ import annotations

import html as htmlmod
import re
from pathlib import Path

INLINE = {
    "span", "strong", "b", "u", "a", "em", "i", "abbr", "time", "label",
    "small", "sup", "sub", "font", "mark", "cite", "dfn", "code", "kbd",
    "samp", "var", "bdi", "bdo", "wbr", "nobr", "button",
}
BLOCK = {
    "p", "div", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
    "br", "section", "article", "header", "footer", "dt", "dd", "ul", "ol",
    "table", "blockquote", "pre", "hr", "figure", "figcaption", "main",
    "aside", "nav", "form", "fieldset", "legend", "caption", "thead",
    "tbody", "tfoot", "address", "details", "summary", "dl",
}

SCRIPT_RE = re.compile(r"<(script|style|noscript|svg)\b[^>]*>.*?</\1>", re.I | re.S)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
INLINE_RE = re.compile(r"</?(?:%s)\b[^>]*>" % "|".join(sorted(INLINE)), re.I)
BLOCK_RE = re.compile(r"</?(?:%s)\b[^>]*/?>" % "|".join(sorted(BLOCK)), re.I)
ANY_TAG_RE = re.compile(r"<[^>]+>")

CURLY = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u2032": "'", "\u2033": '"',
    "\u00a0": " ", "\u202f": " ", "\u2007": " ", "\u2009": " ",
    "\u200a": " ", "\u2008": " ", "\u2002": " ", "\u2003": " ",
    "\u2004": " ", "\u2005": " ", "\u2006": " ", "\u205f": " ",
    "\u3000": " ", "\u00ad": "", "\u200b": "", "\u200c": "",
    "\u200d": "", "\ufeff": "", "\u2010": "-", "\u2011": "-",
    "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2015": "-",
})


def normalize_text(s: str) -> str:
    s = s.translate(CURLY)
    s = htmlmod.unescape(s)
    s = s.translate(CURLY)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_html(raw: str) -> str:
    raw = SCRIPT_RE.sub(" ", raw)
    raw = COMMENT_RE.sub(" ", raw)
    raw = INLINE_RE.sub("", raw)  # no extra spaces
    raw = BLOCK_RE.sub(" ", raw)
    raw = ANY_TAG_RE.sub(" ", raw)
    return normalize_text(raw)


def load_normalized(path: str | Path) -> str:
    path = Path(path)
    data = path.read_bytes()
    if data[:4] == b"%PDF":
        # prefer sidecar .txt from pdftotext
        txt = path.with_suffix(".txt")
        if txt.exists():
            return normalize_text(txt.read_text(errors="replace"))
        raise FileNotFoundError(f"PDF without extracted text: {path}")
    if path.suffix.lower() == ".docx":
        txt = path.with_suffix(".txt")
        if txt.exists():
            return normalize_text(txt.read_text(errors="replace"))
        raise FileNotFoundError(f"DOCX without extracted text: {path}")
    text = data.decode("utf-8", errors="replace")
    # HTML if it looks like it
    if path.suffix.lower() in {".html", ".htm"} or "<html" in text[:2000].lower() or "<!doctype" in text[:200].lower():
        return normalize_html(text)
    return normalize_text(text)


def quote_ok(normalized_page: str, quote: str) -> tuple[bool, str]:
    q = normalize_text(quote)
    if not q:
        return False, "empty quote"
    if len(quote) > 300:
        # allow if only after considering that we check the raw quote length
        return False, f"quote longer than 300 chars ({len(quote)})"
    if q in normalized_page:
        return True, "OK"
    return False, "quote not found in normalized page text"
