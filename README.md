# idiom-explorer
whimsical investigation into use of idioms in news articles


## Setup

- Run `npm install`

### .env 

- Run `touch .env` to create the required **.env** file
- Open your new **.env** file and add the following variables:

PORT=3006
BASE_URL=http://localhost:3006
OKTA_CLIENT=
OKTA_ISSUER=
OKTA_SECRET=
SESSION_TOKEN=

#### Where to find OKTA .env vars

- Get `SESSION_TOKEN` from LastPass
- Get details for finding `OKTA_ISSUER`, `OKTA_CLIENT` & `OKTA_SECRET` in LastPass


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
