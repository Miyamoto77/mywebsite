#!/usr/bin/env python3
"""Build the public area research snapshot from HMLR and ONS original downloads.

Requires openpyxl (read-only). Run from any directory. Optional local inputs make
an exact release reproducible without redownloading the source files.
"""
import argparse
import csv
import hashlib
import html
import io
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HPI_COLLECTION = 'https://www.gov.uk/government/collections/uk-house-price-index-reports'
ONS_PAGE = 'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics'
TYPES = [('detached', 'Detached'), ('semidetached', 'SemiDetached'), ('terraced', 'Terraced'), ('flat maisonette', 'Flat')]


def download(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'KestrelSourcingAreaResearch/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def number(value):
    try:
        result = float(value)
        return (int(result) if result.is_integer() else round(result, 6)) if result == result else None
    except (ValueError, TypeError):
        return None


def is_local(code):
    return bool(re.fullmatch(r'(E0[6-9]|W06)\d{6}', code))


def build(hpi_bytes, rent_bytes, hpi_url, rent_url, hpi_page):
    import openpyxl
    hpi = {}
    for row in csv.DictReader(io.StringIO(hpi_bytes.decode('utf-8-sig'))):
        code = row['AreaCode']
        if not is_local(code):
            continue
        month = datetime.strptime(row['Date'], '%d/%m/%Y').strftime('%Y-%m')
        hpi.setdefault(code, {})[month] = row
    workbook = openpyxl.load_workbook(io.BytesIO(rent_bytes), read_only=True, data_only=True)
    table = workbook['Table 1'].iter_rows(min_row=3, values_only=True)
    headers = next(table)
    rents = {}
    for values in table:
        row = dict(zip(headers, values))
        code = row.get('Area code')
        month = row.get('Time period')
        if code in hpi and isinstance(month, datetime):
            rents.setdefault(code, {})[month.strftime('%Y-%m')] = row
    publication_text = ' '.join(str(v) for row in workbook['Cover sheet'].values for v in row if v)
    release = re.search(r'published.*?on (\d{1,2} [A-Z][a-z]+ \d{4})', publication_text)
    rent_release = datetime.strptime(release.group(1), '%d %B %Y').date().isoformat() if release else None
    workbook.close()
    price_month = max(month for series in hpi.values() for month in series)
    rent_month = max(month for series in rents.values() for month in series)
    first_month = f'{int(price_month[:4]) - 10}{price_month[4:]}'
    areas = []
    for code, prices in sorted(hpi.items()):
        # Do not mix abolished geographies or carry old area observations forward.
        if price_month not in prices:
            continue
        latest = prices[price_month]
        rent_series = rents.get(code, {})
        rent = rent_series.get(rent_month, {})
        price = number(latest['AveragePrice'])
        monthly_rent = number(rent.get('Rental price'))
        old = prices.get(f'{int(price_month[:4]) - 5}{price_month[4:]}', {})
        old_index = number(old.get('Index'))
        current_index = number(latest.get('Index'))
        region = rent.get('Region or country name')
        if not region and rent_series:
            region = rent_series[max(rent_series)].get('Region or country name')
        if not region and code.startswith('W'):
            region = 'Wales'
        if not region and code.startswith('E09'):
            region = 'London'
        if region == 'Yorkshire and The Humber':
            region = 'Yorkshire and the Humber'
        types = []
        for ons_type, hpi_type in TYPES:
            p = number(latest.get(hpi_type + 'Price'))
            r = number(rent.get('Rental price ' + ons_type))
            types.append({'name': {'SemiDetached': 'Semi-detached', 'Flat': 'Flats & maisonettes'}.get(hpi_type, hpi_type),
                          'price': p, 'rent': r, 'yield': 1200 * r / p if r and p else None})
        areas.append({
            'code': code, 'name': latest['RegionName'], 'region': region or 'Region unavailable',
            'price': price, 'rent': monthly_rent,
            'yield': round(1200 * monthly_rent / price, 4) if price and monthly_rent else None,
            'priceGrowth': number(latest.get('12m%Change')),
            'priceGrowth5': round(100 * (current_index / old_index - 1), 4) if current_index and old_index else None,
            'rentGrowth': number(rent.get('Annual change')),
            'types': types,
            'bedrooms': [{'name': label, 'rent': number(rent.get('Rental price ' + key))} for key, label in
                         [('one bed', '1 bedroom'), ('two bed', '2 bedrooms'), ('three bed', '3 bedrooms'), ('four or more bed', '4+ bedrooms')]],
            'history': {'price': [[m, number(r['AveragePrice'])] for m, r in sorted(prices.items()) if m >= first_month],
                        'rent': [[m, number(r.get('Rental price'))] for m, r in sorted(rent_series.items()) if m >= first_month]}
        })
    assert len(areas) >= 300, f'Unexpected coverage: {len(areas)}'
    assert len({a['code'] for a in areas}) == len(areas)
    assert sum(a['rent'] is not None for a in areas) >= 290, 'Rental coverage fell unexpectedly'
    assert price_month <= datetime.now(timezone.utc).strftime('%Y-%m')
    months = {kind: sorted({m for a in areas for m, value in a['history'][kind]}) for kind in ['price', 'rent']}
    for area in areas:
        for kind in ['price', 'rent']:
            observations = dict(area['history'][kind])
            area['history'][kind] = [observations.get(m) for m in months[kind]]
    result = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'months': months,
              'priceMonth': price_month, 'rentMonth': rent_month, 'rentReleaseDate': rent_release,
              'coverage': 'England and Wales local authorities',
              'sources': {'hpi': {'publisher': 'HM Land Registry / Office for National Statistics', 'page': hpi_page,
                                  'download': hpi_url, 'sha256': hashlib.sha256(hpi_bytes).hexdigest()},
                          'rents': {'publisher': 'Office for National Statistics', 'page': ONS_PAGE,
                                    'download': rent_url, 'sha256': hashlib.sha256(rent_bytes).hexdigest()}},
              'areas': areas}
    target = ROOT / 'data' / 'areas.json'
    target.parent.mkdir(exist_ok=True)
    # Validate fully before replacing the last successful public snapshot.
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(target)
    print(json.dumps({'areas': len(areas), 'withRents': sum(a['rent'] is not None for a in areas),
                      'priceMonth': price_month, 'rentMonth': rent_month, 'rentReleaseDate': rent_release}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hpi-csv', type=Path)
    parser.add_argument('--rent-xlsx', type=Path)
    parser.add_argument('--hpi-url')
    parser.add_argument('--rent-url')
    parser.add_argument('--hpi-page')
    args = parser.parse_args()
    hpi_page = args.hpi_page
    hpi_url = args.hpi_url
    if not hpi_url:
        listing = download(HPI_COLLECTION).decode()
        paths = re.findall(r'href="([^"]*statistical-data-sets/uk-house-price-index-data-downloads-[^"]+)"', listing)
        if not paths:
            raise RuntimeError('Cannot resolve the current HMLR release; existing snapshot preserved')
        hpi_page = urllib.parse.urljoin(HPI_COLLECTION, html.unescape(paths[0]))
        release_html = download(hpi_page).decode()
        match = re.search(r'href="(https://publicdata.landregistry.gov.uk/[^\"]*UK-HPI-full-file[^\"]*\.csv[^\"]*)"', release_html)
        if not match:
            raise RuntimeError('Cannot resolve the HMLR CSV; existing snapshot preserved')
        hpi_url = html.unescape(match.group(1))
    rent_url = args.rent_url
    if not rent_url:
        ons_html = download(ONS_PAGE).decode()
        match = re.search(r'href="(/file\?uri=[^\"]+/\d{1,2}[a-z]+\d{4}/[^\"]+\.xlsx)"', ons_html)
        if not match:
            raise RuntimeError('Cannot resolve the ONS workbook; existing snapshot preserved')
        rent_url = urllib.parse.urljoin(ONS_PAGE, html.unescape(match.group(1)))
    build(args.hpi_csv.read_bytes() if args.hpi_csv else download(hpi_url),
          args.rent_xlsx.read_bytes() if args.rent_xlsx else download(rent_url), hpi_url, rent_url, hpi_page or HPI_COLLECTION)


if __name__ == '__main__':
    main()
