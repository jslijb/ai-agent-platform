import subprocess
import sys

def run_in_container(container, sql):
    result = subprocess.run(
        ['docker', 'exec', container, 'psql', '-U', 'aiagent', '-d', 'agentdb', '-t', '-A', '-c', sql],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def get_tables(container):
    output = run_in_container(container, 
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
    return [line.strip() for line in output.split('\n') if line.strip()]

def get_count(container, table):
    output = run_in_container(container, f'SELECT COUNT(*) FROM "{table}";')
    try:
        return int(output)
    except:
        return -1

print("=== aiagent_postgres 数据量 ===")
src_tables = get_tables('aiagent_postgres')
src_counts = {}
for t in src_tables:
    c = get_count('aiagent_postgres', t)
    src_counts[t] = c
    print(f"  {t}: {c}")

print()
print("=== ai_novel_postgres 数据量 ===")
dst_tables = get_tables('ai_novel_postgres')
dst_counts = {}
for t in dst_tables:
    c = get_count('ai_novel_postgres', t)
    dst_counts[t] = c
    print(f"  {t}: {c}")

print()
print("=== 差异对比 ===")
all_tables = sorted(set(src_tables + dst_tables))
for t in all_tables:
    sc = src_counts.get(t, 'N/A')
    dc = dst_counts.get(t, 'N/A')
    if sc != dc:
        print(f"  {t}: aiagent={sc}, ai_novel={dc} <<< DIFF")
    else:
        print(f"  {t}: aiagent={sc}, ai_novel={dc}")

print()
print("=== 需要迁移的表 (aiagent有数据但ai_novel没有或更少) ===")
for t in all_tables:
    sc = src_counts.get(t, 0)
    dc = dst_counts.get(t, 0)
    if sc > 0 and sc > dc:
        print(f"  {t}: aiagent={sc} -> ai_novel={dc} (需迁移 {sc - dc} 条)")