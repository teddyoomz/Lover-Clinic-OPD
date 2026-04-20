# Aggregate ALL ProClinic scan data into one structured JSON
# for plan-writing. Reads every detailed-*.json and admin-*.json,
# extracts per-entity fields + AJAX endpoints.

import json, os, sys, re
from pathlib import Path

os.environ['PYTHONIOENCODING'] = 'utf-8'
sys.stdout.reconfigure(encoding='utf-8')

scan_dir = Path(__file__).parent
out = {}

def route_from_filename(name):
    # detailed-adminsalecreate.json -> /admin/sale/create
    # admin-sale-insurance-claim.json -> /admin/sale-insurance-claim
    n = name.replace('.json', '')
    if n.startswith('detailed-'):
        n = n[len('detailed-'):]
    n = n.replace('admin', '', 1).lstrip('-')
    # Handle common patterns
    if n.endswith('create'):
        n = n[:-6].rstrip('-') + '/create'
    return '/admin/' + n if n else '/admin'

def entity_from_route(route):
    # /admin/sale/create -> sale
    parts = route.replace('/admin/', '').split('/')
    return parts[0].replace('-', '_') if parts else 'unknown'

entities = {}

for fp in sorted(scan_dir.glob('*.json')):
    if fp.name.startswith('_'):
        continue
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        continue

    route = route_from_filename(fp.name)
    entity = entity_from_route(route)

    if entity not in entities:
        entities[entity] = {
            'routes': set(),
            'fields': {},  # fieldname -> {type, required, source_route}
            'ajax_endpoints': set(),
            'scan_files': [],
        }

    e = entities[entity]
    e['scan_files'].append(fp.name)
    e['routes'].add(route)

    # Forms (from `opd.js forms` / detailed-*)
    for form in data.get('forms', []):
        for fld in form.get('fields', []):
            name = fld.get('name') or f"_unnamed_{fld.get('type','?')}"
            if name and name not in e['fields']:
                e['fields'][name] = {
                    'type': fld.get('type', ''),
                    'required': fld.get('required', False),
                    'label': fld.get('label', ''),
                    'source': route,
                }

    # AJAX endpoints (from `opd.js network`)
    for req in data.get('requests', []):
        url = req.get('url', '')
        if url and '/admin/' in url:
            e['ajax_endpoints'].add(url)

# Convert sets to sorted lists for JSON serialization
for ent, val in entities.items():
    val['routes'] = sorted(val['routes'])
    val['ajax_endpoints'] = sorted(val['ajax_endpoints'])
    val['field_count'] = len(val['fields'])

# Sort entities by field count (richest first)
sorted_ents = sorted(entities.items(), key=lambda kv: -kv[1]['field_count'])

out['summary'] = {
    'total_entities': len(entities),
    'total_fields': sum(len(e['fields']) for e in entities.values()),
    'total_routes': sum(len(e['routes']) for e in entities.values()),
    'total_ajax': sum(len(e['ajax_endpoints']) for e in entities.values()),
}
out['by_entity'] = {k: v for k, v in sorted_ents}

with open(scan_dir / '_aggregate.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"=== AGGREGATE ===")
print(f"Entities: {out['summary']['total_entities']}")
print(f"Fields:   {out['summary']['total_fields']}")
print(f"Routes:   {out['summary']['total_routes']}")
print(f"AJAX:     {out['summary']['total_ajax']}")
print()
print("Top 30 entities by field count:")
for name, e in sorted_ents[:30]:
    print(f"  {e['field_count']:>4} fields  {len(e['routes'])} routes  {name}")
