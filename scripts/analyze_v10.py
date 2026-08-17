import json

r = json.load(open('tests/reports/evaluation/eval-report-standard-2026-06-28T02-14-22-271Z.json', 'r', encoding='utf-8'))
results = r['results']

cats = {}
for x in results:
    c = x['category']
    if c not in cats:
        cats[c] = {'c': 0, 'h': 0, 'f': 0, 'a': 0, 'cr': 0, 'dur': 0}
    cats[c]['c'] += 1
    cats[c]['h'] += x['retrieval']['hitsAtK']
    cats[c]['f'] += x['answer']['faithfulness']
    cats[c]['a'] += x['answer']['answerRelevance']
    cats[c]['cr'] += x['retrieval']['contextRecall']
    cats[c]['dur'] += x['durationMs']

print("=== V10 Standard Evaluation (130 queries) ===")
print(f"Hits@K: {r['avgHitsAtK']:.4f}")
print(f"ContextRelevance: {r['avgContextRelevance']:.4f}")
print(f"ContextRecall: {r['avgContextRecall']:.4f}")
print(f"Faithfulness: {r['avgFaithfulness']:.4f}")
print(f"AnswerRelevance: {r['avgAnswerRelevance']:.4f}")
print(f"OverallScore: {r['overallScore']:.4f}")
print()
print("=== By Category ===")
for c, v in sorted(cats.items()):
    n = v['c']
    print(f"  {c}: n={n}, Hits@K={v['h']/n:.2f}, Faith={v['f']/n:.2f}, AR={v['a']/n:.2f}, CR={v['cr']/n:.2f}, AvgDur={v['dur']/n/1000:.0f}s")

print()
print("=== V8 vs V10 Comparison ===")
v8 = {
    'avgHitsAtK': 0.8077, 'avgContextRelevance': 0.8742, 'avgContextRecall': 0.532,
    'avgFaithfulness': 0.8189, 'avgAnswerRelevance': 0.4339
}
for k, v8v in v8.items():
    v10v = r.get(k, 0)
    diff = v10v - v8v
    arrow = "↑" if diff > 0 else "↓"
    print(f"  {k}: V8={v8v:.4f} → V10={v10v:.4f} ({arrow}{abs(diff):.4f})")