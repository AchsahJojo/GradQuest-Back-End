#!/usr/bin/env python3
"""Build school-{id}.checked.json for batch2 per verify-prep plan.

Also usable as a post-verify overlay: re-applies verified/holds/rejects/manual
catalog evidence without destroying quoteFound/pageHashes from verifyFacts.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[1]
CHECKS = Path(__file__).resolve().parent / "checks"
NOW = datetime.now(timezone.utc)
FETCHED = NOW.isoformat().replace("+00:00", "Z")
SNAPSHOT_DAY = NOW.strftime("%Y%m%d")
EVIDENCE = "user browser save 2026-11-13"
VERIFIED_BY = "user 2026-11-13"

BATCH2_IDS = [1, 2, 4, 5, 7, 8, 9, 13, 14, 23]

CATALOG_URL_PREFIXES = (
    "https://catalog.cpp.edu/",
    "https://catalog.csulb.edu/",
    "https://ecatalog.calstatela.edu/",
    "https://catalog.sdsu.edu/",
    "https://catalog.csuchico.edu/",
)

# Hold map: schoolId -> {factId: holdReason}
HOLDS: dict[int, dict[str, str]] = {
    # UNLV f7 kept verified; f16 rejected — not held after Achsah 2026-11-13.
    7: {},  # filled dynamically: all deadline + cost facts
    13: {
        "f32": "Hold: university-only Spring 2027 Computer Engineering dates; department page has no Spring window. Awaiting Achsah decision.",
    },
    2: {
        "f28": "Hold: department required-courses list (CS 5250/5300/5800/6640) omits CS 5215 present on 2026-27 catalog. Awaiting Achsah decision.",
    },
    9: {
        "f4": "Leave out: prefer 2026-27 catalog conditional-admission wording (f50). Department 'may apply' with 3.0 stays out per Achsah 2026-11-13.",
        "f11": "Hold: 2023-24 department curriculum page; prefer 2026-27 catalog curriculum (Achsah 2026-11-13).",
    },
}


def check_passed(entry: dict) -> bool:
    if "pass" in entry:
        return bool(entry["pass"])
    if "ok" in entry:
        return bool(entry["ok"])
    status = str(entry.get("status", "")).lower()
    return status in {"pass", "ok", "passed"}


def load_quote_map(school_id: int) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for name in (f"school-{school_id}.quote-check.json", f"school-{school_id}-catalog.quote-check.json"):
        path = CHECKS / name
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        for entry in data.get("checks", []):
            fid = entry.get("id")
            if not fid:
                continue
            # later catalog check can overwrite; both should agree for merged ids
            out[fid] = check_passed(entry)
    return out


def is_catalog_url(url: str) -> bool:
    return any(url.startswith(p) for p in CATALOG_URL_PREFIXES) or "preview_program.php" in url


def school7_hold_ids(facts: list[dict]) -> dict[str, str]:
    holds: dict[str, str] = {}
    for f in facts:
        fid = f["id"]
        kind = f.get("kind", "")
        name = (f.get("name") or "").lower()
        detail = (f.get("detail") or "").lower()
        blob = f"{name} {detail}"
        # f41/f42 are tagged kind=deadline in source JSON but are cost facts
        is_cost = fid in {"f18", "f41", "f42"} or "cost" in name or "tuition" in name or "cost" in detail
        is_deadline = kind == "deadline" and not is_cost
        if is_cost:
            holds[fid] = "Hold: Fullerton MSE cost fact (Fall 2023 rates / cost wording). Awaiting Achsah refresh decision."
        elif is_deadline:
            holds[fid] = "Hold: Fullerton MSE deadline fact (Fall 2026 dates have passed / cycle stale). Awaiting Achsah refresh decision."
    return holds


def build_or_overlay(school_id: int, overlay_existing: bool) -> dict:
    src = RESEARCH / f"school-{school_id}.json"
    research = json.loads(src.read_text())
    quote_map = load_quote_map(school_id)

    checked_path = RESEARCH / f"school-{school_id}.checked.json"
    existing = None
    if overlay_existing and checked_path.exists():
        existing = json.loads(checked_path.read_text())

    holds = dict(HOLDS.get(school_id, {}))
    if school_id == 7:
        holds.update(school7_hold_ids(research["facts"]))

    existing_by_id = {f["id"]: f for f in (existing or {}).get("facts", [])}

    out_facts = []
    for fact in research["facts"]:
        fid = fact["id"]
        prev = existing_by_id.get(fid, {})

        # Start from research fact fields (may include verified/rejectedReason/verifiedBy)
        base = {
            "id": fact["id"],
            "kind": fact["kind"],
            "name": fact["name"],
            "detail": fact["detail"],
            "sourceUrl": fact["sourceUrl"],
            "quote": fact["quote"],
        }

        quote_passed = quote_map.get(fid, False)
        # Prefer live verifyFacts quoteFound when overlaying; else batch2 quote check
        if overlay_existing and "quoteFound" in prev:
            quote_found = bool(prev["quoteFound"])
        else:
            quote_found = quote_passed

        catalog = is_catalog_url(fact["sourceUrl"])
        if catalog:
            quote_check = "manual"
            evidence = EVIDENCE
        else:
            # preserve prior manual if overlay set it; else auto
            quote_check = prev.get("quoteCheck") if overlay_existing and prev.get("quoteCheck") == "manual" else "auto"
            if not catalog:
                # force non-catalog to auto unless we intentionally marked manual above
                quote_check = "auto" if not catalog else quote_check
            evidence = None

        # Rejected from decisions / merged verified:false with rejectedReason
        rejected_reason = fact.get("rejectedReason") or prev.get("rejectedReason")
        verified_by = fact.get("verifiedBy") or prev.get("verifiedBy")
        already_rejected = fact.get("verified") is False and bool(rejected_reason)

        hold_reason = holds.get(fid)

        if already_rejected:
            verified = False
            if not verified_by:
                verified_by = VERIFIED_BY
            hold_reason = None
        elif hold_reason:
            verified = False
            # holds are prep decisions, not user verifiedBy unless already set
        elif quote_passed or (catalog and quote_check == "manual"):
            # Plan: verified true on every quote-passed fact not already verified false, except holds
            # For catalog-only saved pages, treat quote-check pass as quote-passed even if live WAF
            verified = True
            # Preserve explicit verified:true + verifiedBy from decisions
            if fact.get("verified") is True:
                verified_by = fact.get("verifiedBy") or VERIFIED_BY
        else:
            verified = False

        # If decisions marked verified true, keep that (unless hold/reject)
        if fact.get("verified") is True and not hold_reason and not already_rejected:
            verified = True
            verified_by = fact.get("verifiedBy") or VERIFIED_BY

        fetched_at = prev.get("fetchedAt") if overlay_existing and prev.get("fetchedAt") else FETCHED

        out = {
            **base,
            "quoteFound": quote_found if (quote_passed or overlay_existing) else quote_passed,
            "quoteCheck": quote_check,
            "verified": verified,
            "fetchedAt": fetched_at,
        }
        # For initial build (not overlay), quoteFound comes from batch2 checks
        if not overlay_existing:
            out["quoteFound"] = quote_passed
            # Catalog manual still records quoteFound from offline check
            if catalog and quote_passed:
                out["quoteFound"] = True

        if evidence:
            out["evidence"] = evidence
        if rejected_reason and already_rejected:
            out["rejectedReason"] = rejected_reason
        if hold_reason and not already_rejected:
            out["holdReason"] = hold_reason
        if verified_by and (already_rejected or (verified and fact.get("verified") is True)):
            out["verifiedBy"] = verified_by
        # Also attach verifiedBy on rejects even when verified false
        if already_rejected and verified_by:
            out["verifiedBy"] = verified_by

        out_facts.append(out)

    if existing:
        snapshot_id = existing.get("snapshotId") or f"{school_id}-{SNAPSHOT_DAY}"
        verified_at = existing.get("verifiedAt") or FETCHED
        page_hashes = existing.get("pageHashes") or {}
        pages = existing.get("pages") or research.get("pages") or []
    else:
        snapshot_id = f"{school_id}-{SNAPSHOT_DAY}"
        verified_at = FETCHED
        page_hashes = {}
        pages = research.get("pages") or []

    return {
        "schoolId": research["schoolId"],
        "schoolName": research["schoolName"],
        "programName": research["programName"],
        "pages": pages,
        "snapshotId": snapshot_id,
        "verifiedAt": verified_at,
        "pageHashes": page_hashes,
        "facts": out_facts,
    }


def summarize(checked: dict) -> dict:
    facts = checked["facts"]
    return {
        "schoolId": checked["schoolId"],
        "total": len(facts),
        "verifiedTrue": sum(1 for f in facts if f.get("verified") is True),
        "held": [f["id"] for f in facts if f.get("holdReason")],
        "rejected": [f["id"] for f in facts if f.get("rejectedReason")],
        "manual": sum(1 for f in facts if f.get("quoteCheck") == "manual"),
        "quoteFound": sum(1 for f in facts if f.get("quoteFound")),
        "sqlEligible": sum(
            1
            for f in facts
            if (f.get("quoteFound") or f.get("quoteCheck") == "manual") and f.get("verified") is True
        ),
    }


def main(overlay: bool = False) -> None:
    summaries = []
    for sid in BATCH2_IDS:
        checked = build_or_overlay(sid, overlay_existing=overlay)
        path = RESEARCH / f"school-{sid}.checked.json"
        path.write_text(json.dumps(checked, indent=2) + "\n")
        # also keep a copy under batch2
        shutil.copy2(path, Path(__file__).resolve().parent / f"school-{sid}.checked.json")
        s = summarize(checked)
        summaries.append(s)
        print(
            f"school-{sid}: total={s['total']} verified={s['verifiedTrue']} "
            f"sql={s['sqlEligible']} held={s['held']} rejected={s['rejected']} manual={s['manual']}"
        )
    out = Path(__file__).resolve().parent / "checked-summary.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    import sys

    main(overlay="--overlay" in sys.argv)
