import json

with open(r'd:\Python\ai-agent-platform\scripts\qa-golden.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total test cases: {len(data)}')
print(f'ID range: {data[0]["id"]} - {data[-1]["id"]}')

categories = {}
diff_count = {'easy': 0, 'medium': 0, 'hard': 0}
for d in data:
    categories[d['category']] = categories.get(d['category'], 0) + 1
    diff_count[d['difficulty']] = diff_count.get(d['difficulty'], 0) + 1

print('\nCategory distribution:')
for k, v in sorted(categories.items()):
    print(f'  {k}: {v}')

print(f'\nDifficulty distribution:')
for k, v in sorted(diff_count.items()):
    print(f'  {k}: {v}')

ids = [d['id'] for d in data]
print(f'\nIDs continuous: {ids == list(range(1, len(data) + 1))}')

required_fields = ['id', 'query', 'expectedAnswer', 'category', 'difficulty']
all_valid = all(all(k in d for k in required_fields) for d in data)
print(f'All have required fields: {all_valid}')

original_25 = all(d['id'] <= 25 for d in data[:25])
print(f'Original 25 cases preserved: {original_25}')

new_78 = all(d['id'] >= 26 for d in data[25:])
print(f'New 78 cases start from id 26: {new_78}')
