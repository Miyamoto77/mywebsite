# Property area research

`areas.json` is a versioned snapshot generated directly from the original HM Land
Registry UK HPI CSV and ONS PIPR workbook. Source URLs, SHA-256 hashes, reference
months and generation time are retained in the JSON. This is a published snapshot,
not a live API feed. The page displays the snapshot date and flags snapshots older
than 45 days.

## Automatic refresh

The enabled ChatGPT task **Kestrel data refresh** checks for official releases on
the 28th of every month, around 08:00 Europe/London time, starting 28 November
2026. Its stable task reference is `Automation_74833f169ca881918754778467e01a3e`.
Reuse that task when changing this schedule; do not create a duplicate.

Each run fetches a fresh `Miyamoto77/mywebsite` main-branch checkout and runs the
current script, including its default discovery of the latest official download
links. Use the bundled Python runtime with openpyxl where available. Run the
refresh checks with `python -m unittest discover -s tests -p 'test_area_refresh.py'`.
The task commits only a changed `data/areas.json`, checks the current branch head
to preserve concurrent edits, waits for GitHub Pages deployment, and verifies the
live snapshot's months and source hashes. It reports the result in ChatGPT.

Unchanged releases do not reset the snapshot date or create a commit. Same-month
source revisions are allowed. Older reference months, malformed values,
incomplete histories and duplicate council codes are rejected before replacing
the last successful file. Download, authorization, validation or deployment
failures must be reported and must not be treated as a successful refresh.

To refresh after an official release, use Python 3 with `openpyxl` installed:

```sh
python scripts/update-area-data.py
```

Review the reported coverage/reference months, then commit the generated JSON to
the existing GitHub Pages branch. Optional `--hpi-csv`, `--rent-xlsx`, `--hpi-url`,
`--rent-url` and `--hpi-page` inputs allow exact release reproduction. The script
validates coverage and numeric JSON before replacing the last successful file.
Downloads and intermediate original files are not committed.

Coverage is the latest HPI observation for each England/Wales local authority.
Rent records join on exact ONS area code and the latest rent month. Missing values
remain null, including the suppressed City of London rent series. City of London
is assigned to London using its E09 London borough geography code. Published
annual changes are used directly; five-year price growth uses the index ratio for
the same month five years earlier. Gross yield is rent * 12 / price * 100. Type
yields use the corresponding property type in each dataset. These are area
screening measures, not matched-property investment returns.

`area-boundaries.json` contains simplified map paths from the ONS May 2025 UK BUC
local authority boundaries, projected in British National Grid. Exact local
authority code joins restrict the map to the research dataset. The original
query, dataset page and attribution are retained in the file. Map statistics come
from `areas.json`, not from the geometry file.

Contains HM Land Registry and ONS data © Crown copyright and database right 2026,
licensed under the Open Government Licence v3.0. Map geometry contains OS data
© Crown copyright and database right 2025. Full source attribution is also on the
public page.
