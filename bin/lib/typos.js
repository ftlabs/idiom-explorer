// scan assorted news sites for idioms

const directly = require('./directly'); // trying Rhys' https://github.com/wheresrhys/directly.
                                                // You pass 'directly' a list of fns, each of which generates a promise.
                                                // The fn calls are throttled.

const SITE_FETCH_CONCURRENCE  = (process.env.hasOwnProperty('SITE_FETCH_CONCURRENCE' ))? process.env.SITE_FETCH_CONCURRENCE  : 2;
const SITE_FETCH_DELAY_MILLIS = (process.env.hasOwnProperty('SITE_FETCH_DELAY_MILLIS'))? process.env.SITE_FETCH_DELAY_MILLIS : 500;

const fetch = require('node-fetch');

let typos = [ 'the the' ]; // default

if (process.env.hasOwnProperty('PHRASES' )) {
  try {
    const phrases = JSON.parse( process.env.PHRASES )
    typos = phrases;
    console.log( `INFO: PHRASES specified in env: ${JSON.stringify(typos)}`);
  }
  catch( err ){
    console.log( `WARNING: parsing PHRASES: err=${err}. Defaulting to ${JSON.stringify(typos)}`);
  }
} else {
  console.log( `WARNING: PHRASES not specified in env. Defaulting to ${JSON.stringify(typos)}`);
}

// const notTypos = {
//   'a a'   : '(&amp;<mark|>A<\\/mark>\\$)',
//   'a the' : '(-<mark[^>]+>[aA]<|>[aA]<\\/mark>\\))',
//   'the a' : '(>A<\\/mark>|“<mark[^>]+>a<\\/mark>”)', // NB the details of the speech marks
// }

// for clarity, break out the regex for a phrase into a list of individual fragments,
// each of which is a not typo, then concat them with pipes into one regex for each phrase.
let notTyposFragments = { // default
  'a a'   : [
    '&amp;<mark',
    '>A<\\/mark>\\$'
  ],
  'a the' : [
    '-<mark[^>]+>[aA]<',
    '>[aA]<\\/mark>\\)',
    '&amp;<mark[^>]+>A<'
  ],
  'an the' : [
    'Ping <mark[^>]+>An<'
  ],
  'the a' : [
    '>A<\\/mark>',
    '“<mark[^>]+>a<\\/mark>”' // NB the details of the speech marks
  ],
}

if (process.env.hasOwnProperty('NOTTYPOSFRAGMENTS' )) {
  try {
    const parsed = JSON.parse( process.env.NOTTYPOSFRAGMENTS );
    notTyposFragments = parsed;
    console.log( `INFO: NOTTYPOSFRAGMENTS specified in env: ${JSON.stringify(notTyposFragments)}`);
  }
  catch( err ){
    console.log( `WARNING: parsing NOTTYPOSFRAGMENTS: err=${err}. Defaulting to ${JSON.stringify(notTyposFragments)}`);
  }
} else {
  console.log( `WARNING: NOTTYPOSFRAGMENTS not specified in env. Defaulting to ${JSON.stringify(notTyposFragments)}`);
}

// construct regex pattern from fragment list for each notTypo phrase
const notTypos = {};
Object.keys(notTyposFragments).map( phrase => {
  const fragments = notTyposFragments[phrase];
  notTypos[phrase] = fragments.join('|');
});

const standardCandles = [
  'trump',
  'business',
];

let maxDays = 7;
if (process.env.hasOwnProperty('MAXDAYS' )) {
  const numDays = parseInt( process.env.MAXDAYS );
  if (numDays > 0) {
    maxDays = numDays;
    console.log( `INFO: MAXDAYS specified in env: ${maxDays}`);
  } else {
    console.log( `WARNING: MAXDAYS specified in env, but failed to parse as a +ve int: defaulting to ${maxDays}`);
  }
} else  {
  console.log( `INFO: MAXDAYS not specified in env: defaulting to ${maxDays}`);
}


// <div class="search-item">
//  <div class="search-item__teaser">
//   <div class="o-teaser o-teaser--article o-teaser--small o-teaser--has-image js-teaser" data-id="21281750-87e6-11e9-a028-86cea8523dc2">
//    <div class="o-teaser__content">
//     <div class="o-teaser__meta">
//      <div class="o-teaser__meta-tag">
//       <a class="o-teaser__tag" data-trackable="teaser-tag" href="/global-economy">Global Economy</a>
//      </div>
//     </div>
//     <div class="o-teaser__heading">
//      <a href="/content/21281750-87e6-11e9-a028-86cea8523dc2" data-trackable="heading-link" class="js-teaser-heading-link">Australia trade surplus misses estimates in April</a>
//     </div>
//     <p class="o-teaser__standfirst">
//      <a href="/content/21281750-87e6-11e9-a028-86cea8523dc2" data-trackable="standfirst-link" tabindex="-1" class="js-teaser-standfirst-link">
//       <span>....87bn ($3.4bn), according to the Australian Bureau Statistics published on Thursday. That was down from the $4.95bn surplus recorded in March and below <mark class="search-item__highlight">the</mark> <mark class="search-item__highlight">A</mark>$5.1bn forecast in a Reuters poll.
//
// Exports...</span>
//      </a>
//     </p>
//     <div class="o-teaser__timestamp">
//      <time class="o-teaser__timestamp-date" datetime="2019-06-06T02:17:11+0000">June 6, 2019</time>
//     </div>

const sites = [
  {
    name              : 'ft.com',
    baseQuery         : `https://www.ft.com/search?dateRange=now-${maxDays}d&q=`,
    maxDays,
    regExForCount     : 'Viewing results? \\d+‒\\d+ of (\\d+)', // Viewing results 1‒25 of 2578
    regExForNoResults : 'No results found',
    regExForEachResult : [
      'class=\"search-item\"',
      'class=\"o-teaser__tag\"[^>]+>([^<]+)<', // section
      'class=\"o-teaser__heading\"',
      '<a href=\"([^\"]+)\"[^>]+>([^<]+)<', // path, heading
      'class=\"o-teaser__standfirst\"',
      '<a.*?<span>(', // standfirst
      ')</span></a>',
      'class=\"o-teaser__timestamp-date\"[^>]+>([^<]+)<', // date
    ].join('(?:.|\\n)*?'), // match any char incl newline. Should be via flag 's' and dotAll '.' for later node versions
    alignApp          : 'http://ftlabs-alignment.herokuapp.com/align?text=', 
  },
  // {
  //   name              : 'www.nytimes.com',
  //   baseQuery         : 'https://www.nytimes.com/search?query=',
  //   regExForCount     : 'Showing ([\\d,]+) results? for:', // Showing 493,595 results for:
  //   regExForNoResults : 'Showing 0 results for:',
  // },
  // {
  //   name              : 'www.telegraph.co.uk',
  //   baseQuery         : 'https://www.telegraph.co.uk/search.html?q=',
  //   regExForCount     : 'About ([\\d,]+) results', // About 5,460,000 results
  //   regExForNoResults : 'No Results',
  // },

];

const FAILED_SEARCH = '-1'; // to differentiate from actually finding a result of 0

function generateSiteQuery( site, phrase ){
  return `${site.baseQuery}"${phrase}"`;
}

function generateSiteQueriesForAllPhrases( site, phrases ){
  site.byPhrase = {};
  phrases.map( phrase => {
    site.byPhrase[phrase] = {
      phrase,
      query : generateSiteQuery( site, phrase ),
    };
  });
}

function primeAllSites( sites, phrases ){
   sites.map( site => {
     generateSiteQueriesForAllPhrases( site, phrases );
   });
   return sites;
}

function searchForSitePhrase( site, phraseObj ){
  const phrase = phraseObj.phrase;
  const query = phraseObj.query;
  const regExForCount      = new RegExp( site.regExForCount      );
  const regExForNoResults  = new RegExp( site.regExForNoResults  );
  const regExForEachResult = new RegExp( site.regExForEachResult, ['g']);
  const regExForNotTypo    = notTypos.hasOwnProperty(phrase)? new RegExp(notTypos[phrase]) : null;

  const startMillis = Date.now();
  return fetch( query )
  .then( res => {
    console.log( `fetch: query: (${res.status}) ${query}` );
    phraseObj.status = res.status;
    phraseObj.durationMillis = Date.now() - startMillis;
    return res;
  })
  .then( res => res.text() )
  .then( text => {
    phraseObj.results = [];
    let result = FAILED_SEARCH;
    const mCount = text.match( regExForCount );
    if (mCount !== null) {
      result = mCount[1].replace(/,/g, "");

      // look up each result
      let resultMatches;
      while ((resultMatches = regExForEachResult.exec(text)) !== null) {
        const standfirst = resultMatches[4];

        if (regExForNotTypo !== null
          && standfirst.match(regExForNotTypo) !== null) {
          // skip this result
        } else {
          const path = resultMatches[2];
          const fullPath = path.startsWith('/') ? `https://www.ft.com${path}` : path;

          phraseObj.results.push({
            section    : resultMatches[1],
            path,
            fullPath,
            heading    : resultMatches[3],
            standfirst,
            date       : resultMatches[5],
          });
        }
      }
    } else {
      const mNoResults = text.match( regExForNoResults );
      if (mNoResults !== null) {
        result = '0';
      }
    }

    phraseObj.result = result;

    return phraseObj.result;
  });
}

function searchSite( site ){
  site.SITE_FETCH_CONCURRENCE = SITE_FETCH_CONCURRENCE;
  site.SITE_FETCH_DELAY_MILLIS = SITE_FETCH_DELAY_MILLIS;
  const phrases = Object.keys( site.byPhrase );
  // create array of funcs which return search promises, to pass to directly() to throttle the searches
  const promisers = phrases.map( phrase => {
    const phraseObj = site.byPhrase[phrase];
    return function() {
      return searchForSitePhrase( site, phraseObj )
        .catch( err => {
          console.log( `ERROR: getAllEntityFacets: promise for entity=${entity}, err=${err}`);
        return;
      });
    };
  });

  const startMillis = Date.now();
  return directly( SITE_FETCH_CONCURRENCE, promisers, SITE_FETCH_DELAY_MILLIS )
  .then( results => {
    site.searchDurationMillis = Date.now() - startMillis;
    return {
      site,
      results
    };
  })
}

function searchSites( sites ){
  const promises = sites.map( site => {
    return searchSite( site );
  })

  return Promise.all( promises )
  .then( sitesResults => {
    return sites;
  })
  .catch(error => {
    console.log(error.message)
  });
}

function formatStats( sites ){
  const phraseCountsPerSite = [];
  const phrases = Object.keys( sites[0].byPhrase ); // read common list of phrases from 1st site

  // set column names
  const columnNamesRow = ['phrase'];
  sites.map( site => { columnNamesRow.push(site.name); });
  phraseCountsPerSite.push( columnNamesRow );

  // fill in copunts per phrase per site
  phrases.map( phrase => {
    const row = [ phrase ];
    sites.map( site => { row.push(site.byPhrase[phrase].result); });
    phraseCountsPerSite.push( row );
  });

  return {
    sites,
    phraseCountsPerSiteCsv : phraseCountsPerSite.map( row => { return row.join(','); } ),
  };
}

function scanRaw() {
  const startMillis = Date.now();
  const phrases = typos;
  // const phrases = typos.concat(standardCandles);
  // const phrases = standardCandles;

  primeAllSites( sites, phrases );

  return searchSites( sites )
  .then( sites => {
    const formattedResults = formatStats( sites );
    formattedResults.durationMillis = Date.now() - startMillis;
    console.log( `formattedResults: ${JSON.stringify(formattedResults, null, 2)}`);
    return sites;
  })
  .catch( error => {
    console.log(error.message);
  });
}

module.exports = {
  scanRaw,
  config : {
    typos,
    notTypos,
    notTyposFragments,
    maxDays,
    sites,
  }
};
