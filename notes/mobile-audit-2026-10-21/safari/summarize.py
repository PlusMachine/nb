import json
from pathlib import Path
root = Path(__file__).parent
names = ['results.json', 'interactions-final-results.json', 'verification-final-results.json', 'table-final-results.json']
final = {}
runs = []
def cases(suite, parents=()):
    path = parents + (suite['title'],)
    for spec in suite.get('specs', []):
        for test in spec['tests']:
            yield {
                'key': '|'.join((test['projectName'], spec['file'], *path, spec['title'])),
                'project': test['projectName'], 'file': spec['file'],
                'title': ' › '.join((*path, spec['title'])),
                'status': test['results'][-1]['status'],
                'error': test['results'][-1].get('error', {}).get('message'),
            }
    for child in suite.get('suites', []):
        yield from cases(child, path)
for name in names:
    data = json.loads((root / name).read_text())
    rows = [row for suite in data['suites'] for row in cases(suite)]
    runs.append({'file': name, 'stats': data['stats'], 'failed': [row for row in rows if row['status'] not in ('passed', 'skipped')]})
    for row in rows:
        final[row['key']] = {**row, 'verifiedBy': name}
counts = {status: sum(row['status'] == status for row in final.values()) for status in ('passed', 'skipped', 'failed', 'timedOut', 'interrupted')}
report = {'method': 'Latest explicit verification for each profile, file and full test title. Original failures remain in raw runs; counts are unique cases, not the sum of executions.', 'total': len(final), 'counts': counts, 'rawRuns': runs, 'cases': list(final.values())}
(root / 'verification-summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'total': report['total'], 'counts': counts}, ensure_ascii=False))
assert report['total'] == 273
assert counts['passed'] == 266 and counts['skipped'] == 7
