import json
d = json.load(open('tests/reports/evaluation/eval-progress.json', 'r', encoding='utf-8'))
completed = len(d['completedQueries'])
total = d['totalQueries']
print(f'Progress: {completed}/{total} queries completed ({completed/total*100:.1f}%)')
