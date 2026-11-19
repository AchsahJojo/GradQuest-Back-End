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
    # UNLV 700-level hold closed 2026-11-18 (f7/f16 rejected; subplan facts verified).
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

ENRICH_VERIFIED_BY = "user 2026-11-18"
USERSAVE_EVIDENCE = "user browser save 2026-11-18"


def check_passed(entry: dict) -> bool:
    if "pass" in entry:
        return bool(entry["pass"])
    if "ok" in entry:
        return bool(entry["ok"])
    return str(entry.get("status", "")).lower() in {"pass", "ok", "passed"}


def load_quote_entries(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    return data.get("results") or data.get("checks") or []


def load_quote_map(school_id: int) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for name in (
        f"school-{school_id}.quote-check.json",
        f"school-{school_id}-catalog.quote-check.json",
        f"school-{school_id}-enrich.quote-check.json",
        f"school-{school_id}-usersave.quote-check.json",
    ):
        path = CHECKS / name
        if not path.exists():
            continue
        for entry in load_quote_entries(path):
            fid = entry.get("id")
            if not fid:
                continue
            if "quoteFound" in entry:
                out[fid] = bool(entry["quoteFound"])
            else:
                out[fid] = check_passed(entry)
    return out


def load_enrich_usersave_meta(school_id: int) -> dict[str, dict]:
    """Map fact id → verified overlay metadata from Nov 18 enrich/usersave files."""
    meta: dict[str, dict] = {}
    research_dir = Path(__file__).resolve().parent / "research"
    for suffix in ("enrich", "usersave"):
        path = research_dir / f"school-{school_id}-{suffix}.json"
        if not path.exists():
            continue
        for fact in json.loads(path.read_text()).get("facts", []):
            fid = fact["id"]
            entry = {
                "verified": fact.get("verified"),
                "verifiedBy": fact.get("verifiedBy") or ENRICH_VERIFIED_BY,
            }
            if suffix == "usersave":
                entry["quoteCheck"] = fact.get("quoteCheck") or "manual"
                entry["evidence"] = fact.get("evidence") or USERSAVE_EVIDENCE
            meta[fid] = entry
    return meta


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
        enrich_meta = load_enrich_usersave_meta(sid)
        research_by_id = {f["id"]: f for f in research["facts"]}
        holds = dict(HOLDS.get(sid, {}))
        if sid == 7:
            holds.update(school7_holds(research["facts"]))

        out_facts = []
        for fact in checked["facts"]:
            fid = fact["id"]
            src = research_by_id.get(fid, {})
            overlay = enrich_meta.get(fid, {})
            quote_passed = quote_map.get(fid, False)
            # Prefer live verifyFacts quoteFound; fall back to offline quote-check.
            if fact.get("quoteFound"):
                quote_found = True
            elif fid in quote_map:
                quote_found = quote_passed
            else:
                quote_found = bool(fact.get("quoteFound"))

            catalog = is_catalog_url(fact["sourceUrl"])
            if overlay.get("quoteCheck") == "manual":
                quote_check = "manual"
                evidence = overlay.get("evidence") or fact.get("evidence") or USERSAVE_EVIDENCE
            elif catalog:
                quote_check = "manual"
                evidence = fact.get("evidence") or EVIDENCE
            else:
                quote_check = fact.get("quoteCheck") or "auto"
                if quote_check != "manual":
                    quote_check = "auto"
                evidence = fact.get("evidence") if quote_check == "manual" else None

            rejected_reason = src.get("rejectedReason") or fact.get("rejectedReason")
            already_rejected = (src.get("verified") is False and bool(rejected_reason)) or (
                fact.get("verified") is False and bool(rejected_reason)
            )
            hold_reason = holds.get(fid)
            verified_by = (
                overlay.get("verifiedBy")
                or src.get("verifiedBy")
                or fact.get("verifiedBy")
            )

            if already_rejected:
                verified = False
                verified_by = verified_by or VERIFIED_BY
                hold_reason = None
            elif hold_reason:
                verified = False
            elif overlay.get("verified") is True:
                verified = True
                verified_by = overlay.get("verifiedBy") or ENRICH_VERIFIED_BY
            elif quote_passed or quote_check == "manual":
                verified = True
                if src.get("verified") is True or overlay.get("verified") is True:
                    verified_by = verified_by or VERIFIED_BY
            else:
                verified = False

            if src.get("verified") is True and not hold_reason and not already_rejected:
                verified = True
                verified_by = src.get("verifiedBy") or verified_by or VERIFIED_BY

            # Keep Achsah Nov 18 enrich/usersave verified flags through live verify.
            if (
                overlay.get("verified") is True
                and not hold_reason
                and not already_rejected
            ):
                verified = True
                verified_by = overlay.get("verifiedBy") or ENRICH_VERIFIED_BY
                if overlay.get("quoteCheck") == "manual":
                    quote_found = True

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
            if verified and (
                src.get("verified") is True
                or overlay.get("verified") is True
                or verified_by
            ):
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
