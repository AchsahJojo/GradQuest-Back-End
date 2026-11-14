#!/usr/bin/env python3
"""After verifyFacts, restore batch2 quoteFound + holds/rejects/manual catalog evidence."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[1]
CHECKS = Path(__file__).resolve().parent / "checks"
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

HOLDS: dict[int, dict[str, str]] = {
    # UNLV f7 kept (verified true elsewhere); f16 rejected elsewhere — not held.
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
    return str(entry.get("status", "")).lower() in {"pass", "ok", "passed"}


def load_quote_map(school_id: int) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for name in (f"school-{school_id}.quote-check.json", f"school-{school_id}-catalog.quote-check.json"):
        path = CHECKS / name
        if not path.exists():
            continue
        for entry in json.loads(path.read_text()).get("checks", []):
            fid = entry.get("id")
            if fid:
                out[fid] = check_passed(entry)
    return out


def is_catalog_url(url: str) -> bool:
    return any(url.startswith(p) for p in CATALOG_URL_PREFIXES) or "preview_program.php" in url


def school7_holds(facts: list[dict]) -> dict[str, str]:
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


def main() -> None:
    summaries = []
    for sid in BATCH2_IDS:
        research = json.loads((RESEARCH / f"school-{sid}.json").read_text())
        checked_path = RESEARCH / f"school-{sid}.checked.json"
        checked = json.loads(checked_path.read_text())
        quote_map = load_quote_map(sid)
        research_by_id = {f["id"]: f for f in research["facts"]}
        holds = dict(HOLDS.get(sid, {}))
        if sid == 7:
            holds.update(school7_holds(research["facts"]))

        out_facts = []
        for fact in checked["facts"]:
            fid = fact["id"]
            src = research_by_id.get(fid, {})
            quote_passed = quote_map.get(fid, False)
            # Plan: map batch2 quote-check pass/ok → quoteFound
            quote_found = quote_passed

            catalog = is_catalog_url(fact["sourceUrl"])
            if catalog:
                quote_check = "manual"
                evidence = EVIDENCE
            else:
                quote_check = fact.get("quoteCheck") or "auto"
                if quote_check != "manual":
                    quote_check = "auto"
                evidence = fact.get("evidence") if quote_check == "manual" else None

            rejected_reason = src.get("rejectedReason") or fact.get("rejectedReason")
            already_rejected = src.get("verified") is False and bool(rejected_reason)
            hold_reason = holds.get(fid)
            verified_by = src.get("verifiedBy") or fact.get("verifiedBy")

            if already_rejected:
                verified = False
                verified_by = verified_by or VERIFIED_BY
                hold_reason = None
            elif hold_reason:
                verified = False
            elif quote_passed:
                verified = True
                if src.get("verified") is True:
                    verified_by = src.get("verifiedBy") or VERIFIED_BY
            else:
                verified = False

            if src.get("verified") is True and not hold_reason and not already_rejected:
                verified = True
                verified_by = src.get("verifiedBy") or VERIFIED_BY

            out = {
                "id": fact["id"],
                "kind": fact["kind"],
                "name": fact["name"],
                "detail": fact["detail"],
                "sourceUrl": fact["sourceUrl"],
                "quote": fact["quote"],
                "quoteFound": quote_found,
                "quoteCheck": quote_check,
                "verified": verified,
                "fetchedAt": fact.get("fetchedAt"),
            }
            if evidence:
                out["evidence"] = evidence
            if already_rejected and rejected_reason:
                out["rejectedReason"] = rejected_reason
                out["verifiedBy"] = verified_by or VERIFIED_BY
            if hold_reason and not already_rejected:
                out["holdReason"] = hold_reason
            if verified and src.get("verified") is True:
                out["verifiedBy"] = verified_by or VERIFIED_BY
            out_facts.append(out)

        checked["facts"] = out_facts
        checked_path.write_text(json.dumps(checked, indent=2) + "\n")
        shutil.copy2(checked_path, Path(__file__).resolve().parent / f"school-{sid}.checked.json")

        sql = sum(1 for f in out_facts if (f.get("quoteFound") or f.get("quoteCheck") == "manual") and f.get("verified") is True)
        summary = {
            "schoolId": sid,
            "total": len(out_facts),
            "verifiedTrue": sum(1 for f in out_facts if f.get("verified") is True),
            "sqlEligible": sql,
            "held": [f["id"] for f in out_facts if f.get("holdReason")],
            "rejected": [f["id"] for f in out_facts if f.get("rejectedReason")],
            "manual": sum(1 for f in out_facts if f.get("quoteCheck") == "manual"),
        }
        summaries.append(summary)
        print(
            f"school-{sid}: verified={summary['verifiedTrue']} sql={summary['sqlEligible']} "
            f"held={summary['held']} rejected={summary['rejected']} manual={summary['manual']}"
        )

    out = Path(__file__).resolve().parent / "checked-summary.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
