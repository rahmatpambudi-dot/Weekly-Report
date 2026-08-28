"""
Regenerate data_embed.js from the 3 source dashboards:
  - Productivity NDC-RDC   (rahmatpambudi-dot/Productivity)
  - Insentif 2026          (rahmatpambudi-dot/Insentif)
  - LK Internal Fleet      (heylilyloops/lk-internal-fleet-dashboard)

Run with: python3 scripts/generate_data_embed.py
Writes data_embed.js in the repo root.
"""
import re
import json
import urllib.request
from collections import defaultdict

# ---- source URLs ----
PROD_JSON_URL = "https://raw.githubusercontent.com/rahmatpambudi-dot/Productivity/main/data_monthly.json"
INSENTIF_HTML_URL = "https://raw.githubusercontent.com/rahmatpambudi-dot/Insentif/main/dashboard_insentif_2026.html"
FLEET_HTML_URL = "https://raw.githubusercontent.com/heylilyloops/lk-internal-fleet-dashboard/main/index.html"
PROD_RAW_SITE_URLS = {
    "JABABEKA": "https://raw.githubusercontent.com/rahmatpambudi-dot/Productivity/main/data_JABABEKA.json",
    "CIKUPA":   "https://raw.githubusercontent.com/rahmatpambudi-dot/Productivity/main/data_CIKUPA.json",
    "SDA":      "https://raw.githubusercontent.com/rahmatpambudi-dot/Productivity/main/data_SDA.json",
    "TALLO":    "https://raw.githubusercontent.com/rahmatpambudi-dot/Productivity/main/data_TALLO.json",
    "TAMORA":   "https://raw.githubusercontent.com/rahmatpambudi-dot/Productivity/main/data_TAMORA.json",
}

KEEP_INSENTIF_SITES = {"JBBK", "CKP", "SDA"}
MONTH_SHORT_ID = {'01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'Mei', '06': 'Jun',
                  '07': 'Jul', '08': 'Agu', '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Des'}
SCOPE_AREAS = ['Jawa Barat', 'Lampung', 'Jawa Timur']


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "data-embed-generator"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def extract_const(content, name):
    """Extract a JS const array/object literal by name using bracket counting
    (handles nested brackets/strings that regex can't reliably match)."""
    marker = f"const {name}"
    idx = content.index(marker)
    eq_idx = content.index('=', idx)
    start = eq_idx + 1
    while content[start] in ' \n\t':
        start += 1
    open_ch = content[start]
    close_ch = ']' if open_ch == '[' else '}'
    depth = 0
    i = start
    in_str = False
    str_ch = ''
    escape = False
    while i < len(content):
        ch = content[i]
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == str_ch:
                in_str = False
        else:
            if ch in ('"', "'"):
                in_str = True
                str_ch = ch
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return content[start:i + 1]
        i += 1
    raise ValueError(f"Unbalanced brackets for {name}")


def extract_js_object_literal(raw):
    """Convert a JS object literal with single-quoted keys/values into valid JSON."""
    fixed = re.sub(r"'([^']*)'", r'"\1"', raw)
    fixed = re.sub(r',\s*\}', '}', fixed)
    return json.loads(fixed)


def safe_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def main():
    print("Fetching Productivity data...")
    prod = json.loads(fetch(PROD_JSON_URL))
    PROD_DATA = {"timestamp": prod["timestamp"], "monthly": prod["monthly"]}
    print(f"  PROD_DATA: {PROD_DATA['timestamp']}, {len(PROD_DATA['monthly'])} rows")

    # ---- per-jalur breakdown by delivery type (td): Demand DO Customer, Store CBM,
    # Trip Customer/Store/Satelite/Hub. Pulled from the per-site raw trip-level JSON
    # files (data_<SITE>.json), not the pre-aggregated data_monthly.json, since only
    # the raw files carry the per-trip 'td' (delivery type) classification.
    # NOTE: "Demand DO Customer" combines td 'customer' + 'customer via hub' (per
    # user confirmation). The 4 Trip-count metrics use a straight 1:1 td match
    # (Trip Hub = td=='hub' only, does NOT include 'customer via hub').
    print("Fetching Productivity per-site raw data (for Demand/Trip breakdown)...")
    td_agg = defaultdict(lambda: {"doCustomer": 0.0, "storeCbm": 0.0, "tripCustomer": 0,
                                   "tripStore": 0, "tripSatelite": 0, "tripHub": 0})
    for site_key, url in PROD_RAW_SITE_URLS.items():
        site_raw = json.loads(fetch(url))
        site_map = site_raw["maps"]["site"]
        td_map = site_raw["maps"]["td"]
        for r in site_raw["rows"]:
            site_name = site_map[r["site"]]
            month = r["date"][:7]
            td = td_map[r["td"]]
            key = (site_name, month)
            if td in ("customer", "customer via hub"):
                td_agg[key]["doCustomer"] += safe_float(r["do"])
            if td == "store":
                td_agg[key]["storeCbm"] += safe_float(r["cbm"])
                td_agg[key]["tripStore"] += 1
            if td == "customer":
                td_agg[key]["tripCustomer"] += 1
            if td == "satelite":
                td_agg[key]["tripSatelite"] += 1
            if td == "hub":
                td_agg[key]["tripHub"] += 1
        print(f"  {site_key}: {len(site_raw['rows'])} raw rows")

    merged = 0
    for row in PROD_DATA["monthly"]:
        key = (row["site"], row["month"])
        extra = td_agg.get(key)
        if extra:
            row["doCustomer"] = round(extra["doCustomer"])
            row["storeCbm"] = round(extra["storeCbm"], 1)
            row["tripCustomer"] = extra["tripCustomer"]
            row["tripStore"] = extra["tripStore"]
            row["tripSatelite"] = extra["tripSatelite"]
            row["tripHub"] = extra["tripHub"]
            merged += 1
        else:
            row["doCustomer"] = row["storeCbm"] = 0
            row["tripCustomer"] = row["tripStore"] = row["tripSatelite"] = row["tripHub"] = 0
    print(f"  merged Demand/Trip breakdown into {merged}/{len(PROD_DATA['monthly'])} monthly rows")

    print("Fetching Insentif data...")
    ins_html = fetch(INSENTIF_HTML_URL)
    all_mpp_raw = json.loads(extract_const(ins_html, "ALL_MPP"))
    ins_month_keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug"]
    INS_DATA = []
    for r in all_mpp_raw:
        if r.get("site") not in KEEP_INSENTIF_SITES:
            continue
        row = {"nik": r["nik"], "name": r["name"], "site": r["site"], "role": r["role"], "total": r["total"]}
        for m in ins_month_keys:
            row[m] = r.get(m, 0)
        INS_DATA.append(row)
    print(f"  INS_DATA: {len(INS_DATA)} rows (JBBK/CKP/SDA)")

    # INSIGHT_DATA: monthly MoM/YoY efficiency comparison, used by the Efisiensi MoM/YoY section
    INSIGHT_DATA = json.loads(extract_const(ins_html, "INSIGHT_DATA"))
    print(f"  INSIGHT_DATA: {len(INSIGHT_DATA)} months")

    # DAILY_INS_DATA: per-day insentif/trip/DO/DP for JBBK/CKP/SDA, used for the adaptive
    # (daily vs monthly) Trend Insentif chart when a short date range is selected.
    daily_raw = json.loads(extract_const(ins_html, "DAILY"))
    DAILY_INS_DATA = []
    for site in KEEP_INSENTIF_SITES:
        for date, v in daily_raw.get(site, {}).items():
            DAILY_INS_DATA.append({
                "site": site, "date": date, "trips": v["trips"], "do": v["do_"],
                "dp": v["dp"], "ujp": v["ujp"], "ins": v["ins"], "cbm": v["cbm"],
            })
    DAILY_INS_DATA.sort(key=lambda r: (r["site"], r["date"]))
    print(f"  DAILY_INS_DATA: {len(DAILY_INS_DATA)} rows")

    print("Fetching Fleet data...")
    fleet_html = fetch(FLEET_HTML_URL)
    raw = json.loads(extract_const(fleet_html, "RAW"))
    # RAW columns: [site,area,jalur,ci,ce,armada,del_type,del_date,do,cbm,lt_ow,ujp,mpp,sewa,kap,owner]
    # RAW = trips fulfilled by internal (company-owned) fleet.
    ext_agg = json.loads(extract_const(fleet_html, "EXT_AGG"))
    ext_jalur = json.loads(extract_const(fleet_html, "EXT_JALUR"))
    # EXT_AGG = trips fulfilled by external (rented) fleet, already aggregated per site/date/area.

    fleet_agg = defaultdict(lambda: [0, 0.0])
    cost_agg = defaultdict(lambda: [0, 0.0, 0.0])
    for r in raw:
        site, date, cbm, ci, ce = r[0], r[7], r[9] or 0, r[3] or 0, r[4] or 0
        key = (site, date)
        fleet_agg[key][0] += 1
        fleet_agg[key][1] += cbm
        cost_agg[key][0] += 1
        cost_agg[key][1] += ci
        cost_agg[key][2] += ce

    FLEET_DATA = sorted(
        [{"site": k[0], "date": k[1], "trips": v[0], "cbm": round(v[1], 1)} for k, v in fleet_agg.items()],
        key=lambda x: (x["site"], x["date"])
    )
    FLEET_COST_DATA = sorted(
        [{"site": k[0], "date": k[1], "trips": v[0], "costInt": round(v[1]), "costExt": round(v[2])}
         for k, v in cost_agg.items()],
        key=lambda x: (x["site"], x["date"])
    )
    print(f"  FLEET_DATA: {len(FLEET_DATA)} rows, up to {max(r['date'] for r in FLEET_DATA)}")

    # EXT_FLEET_DATA: external-fleet trips per site/date, summed across ALL destination areas
    # (no area filter needed here since this is a per-site total, not per-area like area_contrib).
    ext_fleet_agg = defaultdict(lambda: [0, 0.0])
    for e in ext_agg:
        key = (e['site'], e['date'])
        ext_fleet_agg[key][0] += e.get('trips', 0) or 0
        ext_fleet_agg[key][1] += e.get('cbm', 0) or 0

    EXT_FLEET_DATA = sorted(
        [{"site": k[0], "date": k[1], "trips": v[0], "cbm": round(v[1], 1)} for k, v in ext_fleet_agg.items()],
        key=lambda x: (x["site"], x["date"])
    )
    print(f"  EXT_FLEET_DATA: {len(EXT_FLEET_DATA)} rows")

    # ---- trend: 2025 vs 2026 monthly trip totals ----
    trip2025 = json.loads(extract_const(fleet_html, "TRIP2025"))
    m2025 = defaultdict(int)
    for r in trip2025:
        m2025[r["date"][:7]] += r["trips"]
    m2026 = defaultdict(int)
    for r in raw:
        m2026[r[7][:7]] += 1
    months_2026 = sorted(m2026.keys())
    labels = [MONTH_SHORT_ID[m[5:7]] for m in months_2026]
    data2026 = [m2026[m] for m in months_2026]
    data2025 = [m2025.get(f"2025-{m[5:7]}", 0) for m in months_2026]

    # ---- area_contrib: internal vs external per area, scoped per site (matches dashboard's own logic) ----
    # NOTE: pinned to a fixed date window (AREA_CONTRIB_DATE_FROM..TO) so it matches the SILK
    # dashboard's "Kontribusi Internal per Area" snapshot exactly. SILK computes this section using
    # whatever date filter is active on its page, not a full-year cumulative — so to stay in sync this
    # is pinned rather than rolling. Update these two dates manually if the SILK comparison window moves.
    AREA_CONTRIB_DATE_FROM = "2026-08-01"
    AREA_CONTRIB_DATE_TO = "2026-08-14"

    ALL_FLEET_SITES = ['AHI Jababeka', 'HCI Jababeka', 'HCI Cikupa', 'Corp Sidoarjo',
                        'IND Jababeka', 'Corp Tamora', 'Corp Tallo']

    def in_window(date_str):
        return AREA_CONTRIB_DATE_FROM <= date_str <= AREA_CONTRIB_DATE_TO

    def scope_sites_for_area(area):
        # SILK's scopeSitesForArea() no longer gates by SAVING_SCOPE (see its own comment:
        # "nggak di-gate ke SAVING_SCOPE lagi") — it uses ALL_SITES regardless of area, and lets the
        # row/entry's own area/jalur field do the area filtering. We mirror that here, keeping only
        # the Retail-segment filter (exclude 'IND Jababeka').
        return [site for site in ALL_FLEET_SITES if site != 'IND Jababeka']

    area_contrib = []
    for area in SCOPE_AREAS:
        sites = scope_sites_for_area(area)
        if area == 'Lampung':
            internal = sum(1 for r in raw if r[0] in sites and r[2] == 'Lampung' and in_window(r[7]))
            external = sum(e['trips'] for e in ext_jalur if e['site'] in sites and e.get('jalur') == 'Lampung' and in_window(e.get('date', '')))
        else:
            internal = sum(1 for r in raw if r[0] in sites and r[1] == area and in_window(r[7]))
            external = sum(e['trips'] for e in ext_agg if e['site'] in sites and e.get('area') == area and in_window(e.get('date', '')))
        area_contrib.append({"area": area, "internal": internal, "external": external})

    SUPPORT_LK_DATA = {
        "trend": {"labels": labels, "data2025": data2025, "data2026": data2026,
                  "total2025": sum(data2025), "total2026": sum(data2026)},
        "area_contrib": area_contrib
    }
    print("  SUPPORT_LK_DATA area_contrib:", area_contrib)

    out = [
        "const PROD_DATA = " + json.dumps(PROD_DATA, separators=(', ', ': ')) + ";",
        "const INS_DATA = " + json.dumps(INS_DATA, separators=(', ', ': ')) + ";",
        "const INSIGHT_DATA = " + json.dumps(INSIGHT_DATA, separators=(', ', ': ')) + ";",
        "const DAILY_INS_DATA = " + json.dumps(DAILY_INS_DATA, separators=(', ', ': ')) + ";",
        "const FLEET_DATA = " + json.dumps(FLEET_DATA, separators=(', ', ': ')) + ";",
        "const EXT_FLEET_DATA = " + json.dumps(EXT_FLEET_DATA, separators=(', ', ': ')) + ";",
        "const FLEET_COST_DATA = " + json.dumps(FLEET_COST_DATA, separators=(', ', ': ')) + ";",
        "const SUPPORT_LK_DATA = " + json.dumps(SUPPORT_LK_DATA, separators=(', ', ': ')) + ";",
    ]

    with open("data_embed.js", "w") as f:
        f.write("\n".join(out) + "\n")
    print("\nWrote data_embed.js")


if __name__ == "__main__":
    main()
