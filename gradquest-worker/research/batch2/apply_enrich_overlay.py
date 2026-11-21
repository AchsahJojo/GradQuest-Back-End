#!/usr/bin/env python3
"""Merge Nov 18 enrich + usersave into research + checked JSON (Achsah-verified).

- Replacements keep the existing id; drop supersedes* fields.
- New e# / usersave ids are appended.
- alsoMatchesExistingIds duplicates are removed.
- UNLV rejections from research/school-23.json (VERIFIED) are applied.
- verified / verifiedBy / quoteCheck:"manual" / evidence are preserved.
- quoteFound for enrich comes from checks/*-enrich*.quote-check.json.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

BATCH2 = Path(__file__).resolve().parent
RESEARCH = BATCH2.parent
PKG_RESEARCH = BATCH2 / "research"
CHECKS = BATCH2 / "checks"

ENRICH_SCHOOLS = [1, 2, 4, 5, 8, 9, 13, 14, 23]
USERSAVE_SCHOOLS = [1, 23]
FETCHED = "2026-11-18T12:00:00.000Z"
VERIFIED_BY = "user 2026-11-18"


def load_quote_found(school_id: int, suffix: str) -> dict[str, bool]:
    path = CHECKS / f"school-{school_id}-{suffix}.quote-check.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    out: dict[str, bool] = {}
    for entry in data.get("results", data.get("checks", [])):
        fid = entry.get("id")
        if not fid:
            continue
        if "quoteFound" in entry:
            out[fid] = bool(entry["quoteFound"])
        elif "pass" in entry:
            out[fid] = bool(entry["pass"])
        elif "ok" in entry:
            out[fid] = bool(entry["ok"])
        else:
            out[fid] = str(entry.get("status", "")).lower() in {"pass", "ok", "passed"}
    return out


def core_fact(src: dict) -> dict:
    return {
        "id": src["id"],
        "kind": src["kind"],
        "name": src["name"],
        "detail": src["detail"],
        "sourceUrl": src["sourceUrl"],
        "quote": src["quote"],
    }


def research_extra(src: dict) -> dict:
    """Extra fields kept on research JSON for post_verify_overlay."""
    out = core_fact(src)
    if "verified" in src:
        out["verified"] = src["verified"]
    if src.get("verifiedBy"):
        out["verifiedBy"] = src["verifiedBy"]
    if src.get("rejectedReason"):
        out["rejectedReason"] = src["rejectedReason"]
    return out


def checked_from_enrich(src: dict, quote_found: bool) -> dict:
    out = {
        **core_fact(src),
        "quoteFound": quote_found,
        "quoteCheck": "auto",
        "verified": bool(src.get("verified", True)),
        "fetchedAt": src.get("retrievedAt") and f"{src['retrievedAt']}T12:00:00.000Z" or FETCHED,
        "verifiedBy": src.get("verifiedBy") or VERIFIED_BY,
    }
    return out


def checked_from_usersave(src: dict) -> dict:
    out = {
        **core_fact(src),
        "quoteFound": True,
        "quoteCheck": src.get("quoteCheck") or "manual",
        "verified": bool(src.get("verified", True)),
        "fetchedAt": FETCHED,
        "evidence": src.get("evidence") or "user browser save 2026-11-18",
        "verifiedBy": src.get("verifiedBy") or VERIFIED_BY,
    }
    return out


def apply_school(school_id: int) -> dict:
    research_path = RESEARCH / f"school-{school_id}.json"
    checked_path = RESEARCH / f"school-{school_id}.checked.json"
    research = json.loads(research_path.read_text())
    checked = json.loads(checked_path.read_text())

    research_by = {f["id"]: f for f in research["facts"]}
    checked_by = {f["id"]: f for f in checked["facts"]}
    remove_ids: set[str] = set()
    stats = {
        "schoolId": school_id,
        "replaced": 0,
        "added": 0,
        "usersave": 0,
        "removedDups": 0,
        "rejected": [],
    }

    enrich_path = PKG_RESEARCH / f"school-{school_id}-enrich.json"
    if enrich_path.exists():
        enrich = json.loads(enrich_path.read_text())
        quote_map = load_quote_found(school_id, "enrich")
        for src in enrich["facts"]:
            fid = src["id"]
            for dup in src.get("alsoMatchesExistingIds") or []:
                remove_ids.add(dup)
            qf = quote_map.get(fid, True)
            if fid in research_by:
                research_by[fid] = {**research_by[fid], **research_extra(src)}
                prev = checked_by.get(fid, {})
                merged = checked_from_enrich(src, qf)
                # Keep holdReason if a Nov 13 hold still applies to this id.
                if prev.get("holdReason") and merged.get("verified") is not False:
                    # Enrich facts are faculty/course text; holds are deadline/curriculum.
                    # Only preserve hold when previous was held and enrich did not verify.
                    pass
                if prev.get("holdReason") and prev.get("verified") is False:
                    merged["verified"] = False
                    merged["holdReason"] = prev["holdReason"]
                    merged.pop("verifiedBy", None)
                checked_by[fid] = merged
                stats["replaced"] += 1
            else:
                research_by[fid] = research_extra(src)
                checked_by[fid] = checked_from_enrich(src, qf)
                stats["added"] += 1

    usersave_path = PKG_RESEARCH / f"school-{school_id}-usersave.json"
    if usersave_path.exists():
        usersave = json.loads(usersave_path.read_text())
        for src in usersave["facts"]:
            fid = src["id"]
            research_by[fid] = research_extra(src)
            checked_by[fid] = checked_from_usersave(src)
            stats["usersave"] += 1

    # UNLV VERIFIED school-23.json carries explicit rejections.
    if school_id == 23:
        verified_src = json.loads((PKG_RESEARCH / "school-23.json").read_text())
        for src in verified_src["facts"]:
            if src.get("verified") is False and src.get("rejectedReason"):
                fid = src["id"]
                if fid in research_by:
                    research_by[fid] = {
                        **research_by[fid],
                        "verified": False,
                        "rejectedReason": src["rejectedReason"],
                        "verifiedBy": src.get("verifiedBy") or VERIFIED_BY,
                    }
                if fid in checked_by:
                    checked_by[fid] = {
                        **checked_by[fid],
                        "verified": False,
                        "rejectedReason": src["rejectedReason"],
                        "verifiedBy": src.get("verifiedBy") or VERIFIED_BY,
                    }
                    checked_by[fid].pop("holdReason", None)
                stats["rejected"].append(fid)

    for dup in sorted(remove_ids):
        if dup in research_by:
            del research_by[dup]
            stats["removedDups"] += 1
        if dup in checked_by:
            del checked_by[dup]

    # Preserve original order, then append new ids in enrich/usersave order.
    ordered_ids: list[str] = []
    seen: set[str] = set()
    for f in research["facts"]:
        if f["id"] in research_by and f["id"] not in seen:
            ordered_ids.append(f["id"])
            seen.add(f["id"])
    for sid in ENRICH_SCHOOLS:
        if sid != school_id:
            continue
        if enrich_path.exists():
            for src in json.loads(enrich_path.read_text())["facts"]:
                if src["id"] in research_by and src["id"] not in seen:
                    ordered_ids.append(src["id"])
                    seen.add(src["id"])
    if usersave_path.exists():
        for src in json.loads(usersave_path.read_text())["facts"]:
            if src["id"] in research_by and src["id"] not in seen:
                ordered_ids.append(src["id"])
                seen.add(src["id"])
    for fid in research_by:
        if fid not in seen:
            ordered_ids.append(fid)

    research["facts"] = [research_by[fid] for fid in ordered_ids]
    checked["facts"] = [checked_by[fid] for fid in ordered_ids if fid in checked_by]
    # Any research-only id without checked entry (shouldn't happen) skipped.
    for fid in ordered_ids:
        if fid not in checked_by and fid in research_by:
            checked["facts"].append(
                {
                    **core_fact(research_by[fid]),
                    "quoteFound": True,
                    "quoteCheck": "auto",
                    "verified": bool(research_by[fid].get("verified", False)),
                    "fetchedAt": FETCHED,
                }
            )

    research_path.write_text(json.dumps(research, indent=2) + "\n")
    checked_path.write_text(json.dumps(checked, indent=2) + "\n")
    shutil.copy2(checked_path, BATCH2 / f"school-{school_id}.checked.json")
    # Keep package research school-23.json mirrored into research/ when applied.
    if school_id == 23:
        shutil.copy2(PKG_RESEARCH / "school-23.json", BATCH2 / "research" / "school-23.applied-source.json")

    stats["totalResearch"] = len(research["facts"])
    stats["totalChecked"] = len(checked["facts"])
    stats["verifiedTrue"] = sum(1 for f in checked["facts"] if f.get("verified") is True)
    return stats


def main() -> None:
    schools = sorted(set(ENRICH_SCHOOLS) | set(USERSAVE_SCHOOLS))
    summaries = []
    for sid in schools:
        s = apply_school(sid)
        summaries.append(s)
        print(
            f"school-{sid}: replaced={s['replaced']} added={s['added']} usersave={s['usersave']} "
            f"dupsRemoved={s['removedDups']} rejected={s['rejected']} "
            f"checked={s['totalChecked']} verified={s['verifiedTrue']}"
        )
    out = BATCH2 / "enrich-overlay-summary.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
