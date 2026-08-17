import sys
sys.path.insert(0, r'D:\Python\ai-agent-platform\vendor\py')
import markdown

with open(r'D:\Python\ai-agent-platform\李江波-AI应用开发工程师-调整版.md', 'r', encoding='utf-8') as f:
    md_text = f.read()

html_body = markdown.markdown(md_text, extensions=['tables', 'fenced_code'])

CSS = """
body { font-family: "Microsoft YaHei", "SimHei", sans-serif; font-size: 11pt; line-height: 1.6; margin: 40px; color: #333; }
h1 { font-size: 18pt; border-bottom: 2px solid #333; padding-bottom: 6px; }
h2 { font-size: 14pt; color: #1a1a1a; margin-top: 20px; border-bottom: 1px solid #999; padding-bottom: 4px; }
h3 { font-size: 12pt; color: #333; margin-top: 16px; }
strong { color: #1a1a1a; }
ul { margin: 4px 0; padding-left: 20px; }
li { margin: 2px 0; }
table { border-collapse: collapse; margin: 8px 0; }
th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 10pt; }
th { background: #f0f0f0; }
code { background: #f5f5f5; padding: 1px 4px; font-size: 10pt; }
hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
"""

html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body>{html_body}</body></html>"""

with open(r'D:\Python\ai-agent-platform\李江波-AI应用开发工程师-调整版.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('HTML generated OK')