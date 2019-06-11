# idiom-explorer
whimsical investigation into use of idioms in news articles

## version 1

> node scanForIdioms.js

Scans the named `sites` for counts of each idiom.

Writes output to console.

Caveats:
* output is messy
* fetch blasts off oodles of concurrent requests. Not being a good citizen.

## version 2

The prev call should still work
> node scanForIdioms.js

But now, specify a JSON list of candidate typos as PHRASES in the env, and invoke

> node index.js

Calls ft.com for each phrase, filtered by last 7 days, and further filters out any results which match the notTypos regexes.
