#!/usr/bin/env python3
"""
Builds the app's address search files (data/addresses/*.json) from G-NAF, Australia's official list of addresses.

    python3 tools/build-addresses.py /path/to/folder-with-the-QLD-psv-files

The folder needs these files from the G-NAF download (data.gov.au, "Geoscape G-NAF - GDA2020"):
    QLD_ADDRESS_DETAIL_psv.psv, QLD_ADDRESS_DEFAULT_GEOCODE_psv.psv, QLD_STREET_LOCALITY_psv.psv,
    QLD_LOCALITY_psv.psv, Authority_Code_STREET_SUFFIX_AUT_psv.psv
Run it again each year with the newest G-NAF release.

G-NAF © Geoscape Australia, licensed by the Commonwealth of Australia under CC BY 4.0.
"""
import csv, json, os, re, sys
from collections import defaultdict

# The Toowoomba region: Toowoomba, Highfields, Gowrie Junction, Westbrook, Oakey, Crows Nest, Pittsworth,
# Cambooya and everything in between (a box around the Toowoomba Regional Council area's main towns).
WEST, EAST, SOUTH, NORTH = 151.55, 152.15, -27.95, -27.20
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'addresses')
BASE_LAT, BASE_LNG = -27.0, 151.0  # positions are stored as whole numbers of 1/100000 of a degree from here (~1 m)

csv.field_size_limit(10 ** 7)
def rows(folder, name):
    with open(os.path.join(folder, name), newline='', encoding='utf-8') as f:
        yield from csv.DictReader(f, delimiter='|')

SMALL = {'of', 'the', 'and'}
def nice(s):
    """'RUTHVEN' -> 'Ruthven', "O'BRIEN" -> "O'Brien", 'MCDOUGALL' -> 'McDougall'."""
    words = []
    for i, w in enumerate(s.lower().split()):
        if i and w in SMALL: words.append(w); continue
        w = re.sub(r"(^|['\-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w)
        w = re.sub(r'^Mc([a-z])', lambda m: 'Mc' + m.group(1).upper(), w)
        words.append(w)
    return ' '.join(words)

def main(folder):
    # 1. Addresses whose map position is inside the region
    spot = {}
    for r in rows(folder, 'QLD_ADDRESS_DEFAULT_GEOCODE_psv.psv'):
        if r['DATE_RETIRED']: continue
        lat, lng = float(r['LATITUDE']), float(r['LONGITUDE'])
        if WEST <= lng <= EAST and SOUTH <= lat <= NORTH:
            spot[r['ADDRESS_DETAIL_PID']] = (lat, lng)
    print(f'{len(spot):,} address positions in the region')

    suffix = {r['CODE']: r['NAME'] for r in rows(folder, 'Authority_Code_STREET_SUFFIX_AUT_psv.psv')}
    locality = {r['LOCALITY_PID']: nice(r['LOCALITY_NAME']) for r in rows(folder, 'QLD_LOCALITY_psv.psv')}
    street = {}
    for r in rows(folder, 'QLD_STREET_LOCALITY_psv.psv'):
        parts = [r['STREET_NAME'], r['STREET_TYPE_CODE'], suffix.get(r['STREET_SUFFIX_CODE'], r['STREET_SUFFIX_CODE'])]
        street[r['STREET_LOCALITY_PID']] = nice(' '.join(p for p in parts if p))

    # 2. Each address's house number (and unit), grouped by street and suburb
    by_street = defaultdict(dict)
    skipped = 0
    for r in rows(folder, 'QLD_ADDRESS_DETAIL_psv.psv'):
        pid = r['ADDRESS_DETAIL_PID']
        if pid not in spot or r['DATE_RETIRED'] or r['ALIAS_PRINCIPAL'] != 'P': continue
        if not r['NUMBER_FIRST'] or r['STREET_LOCALITY_PID'] not in street: skipped += 1; continue
        num = f"{r['NUMBER_FIRST_PREFIX']}{r['NUMBER_FIRST']}{r['NUMBER_FIRST_SUFFIX']}"
        if r['NUMBER_LAST']: num += f"-{r['NUMBER_LAST_PREFIX']}{r['NUMBER_LAST']}{r['NUMBER_LAST_SUFFIX']}"
        if r['FLAT_NUMBER']: num = f"{r['FLAT_NUMBER_PREFIX']}{r['FLAT_NUMBER']}{r['FLAT_NUMBER_SUFFIX']}/{num}"
        lat, lng = spot[pid]
        key = (street[r['STREET_LOCALITY_PID']], locality.get(r['LOCALITY_PID'], ''), r['POSTCODE'])
        by_street[key][num.upper()] = [round((BASE_LAT - lat) * 1e5), round((lng - BASE_LNG) * 1e5)]
    total = sum(len(v) for v in by_street.values())
    print(f'{total:,} addresses on {len(by_street):,} streets ({skipped:,} without a house number left out)')

    # 3. One small file per first letter of the street name, so the app only downloads what it needs
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.endswith('.json'): os.remove(os.path.join(OUT, old))
    chunks = defaultdict(list)
    for (name, loc, pc), nums in sorted(by_street.items()):
        first = name[:1].lower()
        letter = first if 'a' <= first <= 'z' else '0'
        numsort = sorted(nums.items(), key=lambda kv: [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', kv[0])])
        chunks[letter].append([name, loc, pc, [[n, la, ln] for n, (la, ln) in numsort]])
    for letter, streets in chunks.items():
        with open(os.path.join(OUT, f'{letter}.json'), 'w') as f:
            json.dump({'base': [BASE_LAT, BASE_LNG], 'streets': streets}, f, separators=(',', ':'))
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'source': 'G-NAF © Geoscape Australia, licensed by the Commonwealth of Australia under CC BY 4.0',
                   'region': [WEST, SOUTH, EAST, NORTH], 'letters': sorted(chunks), 'addresses': total}, f, indent=1)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'{len(chunks)} files, {size / 1e6:.1f} MB in all, written to data/addresses/')

    # 4. The same addresses grouped by area (about 1 km squares), for "what's the nearest address to me?".
    #    Units (3/45) are left out so a spot is named by its street address. File near/<row>_<col>.json, where
    #    row = whole 1/100ths of a degree south of -27, col = whole 1/100ths of a degree east of 151.
    near_dir = os.path.join(OUT, 'near'); os.makedirs(near_dir, exist_ok=True)
    for old in os.listdir(near_dir):
        if old.endswith('.json'): os.remove(os.path.join(near_dir, old))
    cells = defaultdict(lambda: {'s': [], 'si': {}, 'a': []})
    for (name, loc, pc), nums in sorted(by_street.items()):
        for n, (la, ln) in nums.items():
            if '/' in n: continue
            c = cells[(la // 1000, ln // 1000)]
            k = (name, loc, pc)
            if k not in c['si']: c['si'][k] = len(c['s']); c['s'].append([name, loc, pc])
            c['a'].append([c['si'][k], n, la, ln])
    for (r, col), c in cells.items():
        with open(os.path.join(near_dir, f'{r}_{col}.json'), 'w') as f:
            json.dump({'base': [BASE_LAT, BASE_LNG], 'cell': [r, col], 's': c['s'], 'a': c['a']}, f, separators=(',', ':'))
    sizes = [os.path.getsize(os.path.join(near_dir, f)) for f in os.listdir(near_dir)]
    print(f'{len(sizes)} area files, largest {max(sizes) / 1e3:.0f} KB, {sum(sizes) / 1e6:.1f} MB in all, written to data/addresses/near/')

    # A look at the suburbs covered, to check the region is right
    per_loc = defaultdict(int)
    for (name, loc, pc), nums in by_street.items(): per_loc[loc] += len(nums)
    print('Suburbs and towns (addresses):')
    print(', '.join(f'{l} {n:,}' for l, n in sorted(per_loc.items(), key=lambda x: -x[1])))

if __name__ == '__main__':
    main(sys.argv[1])
