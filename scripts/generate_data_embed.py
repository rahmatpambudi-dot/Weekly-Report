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


def main():
    print("Fetching Productivity data...")
    prod = json.loads(fetch(PROD_JSON_URL))
    PROD_DATA = {"timestamp": prod["timestamp"], "monthly": prod["monthly"]}
    print(f"  PROD_DATA: {PROD_DATA['timestamp']}, {len(PROD_DATA['monthly'])} rows")

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
    SAVING_SCOPE = extract_js_object_literal(extract_const(fleet_html, "SAVING_SCOPE"))
    ext_agg = json.loads(extract_const(fleet_html, "EXT_AGG"))
    ext_jalur = json.loads(extract_const(fleet_html, "EXT_JALUR"))

    def scope_sites_for_area(area):
        # Retail-only, matching the SILK dashboard's default "Retail" segment
        # (siteSegment(): every site is Retail except 'IND Jababeka', which is Industrial).
        return [site for site, areas in SAVING_SCOPE.items() if area in areas and site != 'IND Jababeka']

    area_contrib = []
    for area in SCOPE_AREAS:
        sites = scope_sites_for_area(area)
        if area == 'Lampung':
            internal = sum(1 for r in raw if r[0] in sites and r[2] == 'Lampung')
            external = sum(e['trips'] for e in ext_jalur if e['site'] in sites and e.get('jalur') == 'Lampung')
        else:
            internal = sum(1 for r in raw if r[0] in sites and r[1] == area)
            external = sum(e['trips'] for e in ext_agg if e['site'] in sites and e.get('area') == area)
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
        "const FLEET_COST_DATA = " + json.dumps(FLEET_COST_DATA, separators=(', ', ': ')) + ";",
        "const SUPPORT_LK_DATA = " + json.dumps(SUPPORT_LK_DATA, separators=(', ', ': ')) + ";",
    ]

    with open("data_embed.js", "w") as f:
        f.write("\n".join(out) + "\n")
    print("\nWrote data_embed.js")


if __name__ == "__main__":
    main()
