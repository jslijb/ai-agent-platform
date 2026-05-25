import requests
import re

url = "http://www.cninfo.com.cn/new/hisAnnouncement/query"
headers = {
    "Accept": "application/json",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "http://www.cninfo.com.cn/new/disclosure",
}

# Collect all SH main board annual report titles
sh_titles = []
sz_titles = []
star_titles = []

for page in range(1, 50):
    body = {
        "pageNum": str(page),
        "pageSize": "30",
        "column": "szse",
        "tabName": "fulltext",
        "stock": "",
        "searchkey": "",
        "secid": "",
        "category": "category_ndbg_szsh",
        "trade": "",
        "seDate": "2026-01-01~2026-06-30",
        "sortName": "",
        "sortType": "",
        "isHLtitle": "true",
    }
    try:
        resp = requests.post(url, headers=headers, data=body, timeout=30)
        data = resp.json()
        anns = data.get("announcements") or []
        if not anns:
            break
        for a in anns:
            code = a.get("secCode", "")
            title = a.get("announcementTitle", "")
            clean_title = re.sub(r"</?em>", "", title)

            is_sh = code.startswith("600") or code.startswith("601") or code.startswith("603") or code.startswith("605")
            is_star = code.startswith("688")
            is_sz = code.startswith("000") or code.startswith("001") or code.startswith("002")

            # Check if it would pass the current filter
            passes_filter = "年度报告" in clean_title and "摘要" not in clean_title and "更正" not in clean_title

            if is_sh and not passes_filter and ("年报" in clean_title or "年度" in clean_title or "annual" in clean_title.lower()):
                sh_titles.append(f"{code} | {clean_title} | FAILS_FILTER")
            elif is_sh and passes_filter:
                sh_titles.append(f"{code} | {clean_title} | PASSES")

    except Exception as e:
        print(f"Page {page}: Error {e}")
        break

print(f"SH main board titles found: {len(sh_titles)}")
print("\nTitles that FAIL the filter:")
fails = [t for t in sh_titles if "FAILS_FILTER" in t]
for t in fails[:20]:
    print(f"  {t}")

print(f"\nTotal fails: {len(fails)} out of {len(sh_titles)}")
