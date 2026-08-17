import json
d = json.load(open(r'D:\Python\ai-agent-platform\tests\reports\evaluation\eval-report-daily-2026-06-22T14-50-02-276Z.json', 'r', encoding='utf-8'))
print(f"TotalTests: {d['totalTests']}")
print(f"Hits@K: {d['avgHitsAtK']}")
print(f"ContextRelevance: {d['avgContextRelevance']}")
print(f"ContextRecall: {d['avgContextRecall']}")
print(f"Faithfulness: {d['avgFaithfulness']}")
print(f"AnswerRelevance: {d['avgAnswerRelevance']}")
print(f"OverallScore: {d['overallScore']}")

if 'avgNumericalAccuracy' in d:
    print(f"NumericalAccuracy: {d['avgNumericalAccuracy']}")
    print(f"ComplianceScore: {d['avgComplianceScore']}")
    print(f"HallucinationRate: {d['avgHallucinationRate']}")
    print(f"RiskDisclosure: {d['avgRiskDisclosureScore']}")
    print(f"Timeliness: {d['avgTimelinessScore']}")
    print(f"FinancialOverall: {d['financialOverallScore']}")

print("\nBy Category:")
for cat, stats in d.get('resultsByCategory', {}).items():
    print(f"  {cat}: count={stats['count']}, Hits@K={stats['avgHitsAtK']}, Faith={stats['avgFaithfulness']}, AR={stats['avgAnswerRelevance']}")