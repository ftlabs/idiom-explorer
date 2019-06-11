// scan assorted news sites for idioms

const directly = require('./directly'); // trying Rhys' https://github.com/wheresrhys/directly.
                                                // You pass 'directly' a list of fns, each of which generates a promise.
                                                // The fn calls are throttled.

const SITE_FETCH_CONCURRENCE  = (process.env.hasOwnProperty('SITE_FETCH_CONCURRENCE' ))? process.env.SITE_FETCH_CONCURRENCE  : 2;
const SITE_FETCH_DELAY_MILLIS = (process.env.hasOwnProperty('SITE_FETCH_DELAY_MILLIS'))? process.env.SITE_FETCH_DELAY_MILLIS : 500;

const fetch = require('node-fetch');

const typos = [
  'the the',
  'the there',
  'the their',
  'a the',
  'an the',
  'the a',
  'the an',
  'a an',
  'a a',
  'their their',
  'with with',
];

const standardCandles = [
  'trump',
  'business',
];

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
    baseQuery         : 'https://www.ft.com/search?dateRange=now-7d&q=',
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
  const query = phraseObj.query;
  const regExForCount      = new RegExp( site.regExForCount      );
  const regExForNoResults  = new RegExp( site.regExForNoResults  );
  const regExForEachResult = new RegExp( site.regExForEachResult, ['g']);

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
        // console.log( `resultMatches: ${JSON.stringify(resultMatches, null, 2)}`);
        phraseObj.results.push({
          section    : resultMatches[1],
          path       : resultMatches[2],
          heading    : resultMatches[3],
          standfirst : resultMatches[4],
          date       : resultMatches[5],
        });
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
    // console.log( `sitesResults: ${JSON.stringify(sitesResults, null, 2)}`);
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
        phrases : typos,
};
