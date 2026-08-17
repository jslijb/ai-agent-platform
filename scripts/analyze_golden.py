import json

data = json.load(open(r'D:\Python\ai-agent-platform\scripts\qa-golden.json', 'r', encoding='utf-8'))

print(f"Total: {len(data)}")
can_true = sum(1 for d in data if d.get('canAnswer', True))
can_false = sum(1 for d in data if not d.get('canAnswer', True))
print(f"canAnswer=True: {can_true}, canAnswer=False: {can_false}")

cats = {}
for d in data:
    cat = d['category']
    cats[cat] = cats.get(cat, 0) + 1
print("Categories:")
for k, v in sorted(cats.items()):
    print(f"  {k}: {v}")

# L1 queries
print("\nL1-事实提取 queries:")
l1 = [d for d in data if d['category'] == 'L1-事实提取']
for d in l1:
    ca = d.get('canAnswer', True)
    print(f"  ID={d['id']}: {d['query'][:50]} | canAnswer={ca}")

# L5-L9 queries
for cat in ['L5-交易规则', 'L6-技术指标', 'L7-合规风控', 'L8-对抗性', 'L9-无法回答']:
    print(f"\n{cat} queries:")
    items = [d for d in data if d['category'] == cat]
    for d in items:
        ca = d.get('canAnswer', True)
        print(f"  ID={d['id']}: {d['query'][:50]} | canAnswer={ca}")