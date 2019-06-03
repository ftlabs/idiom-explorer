// scan assorted news sites for idioms

const directly = require('./bin/lib/directly'); // trying Rhys' https://github.com/wheresrhys/directly.
                                                // You pass 'directly' a list of fns, each of which generates a promise.
                                                // The fn calls are throttled.

const SITE_FETCH_CONCURRENCE  = (process.env.hasOwnProperty('SITE_FETCH_CONCURRENCE' ))? process.env.SITE_FETCH_CONCURRENCE  : 2;
const SITE_FETCH_DELAY_MILLIS = (process.env.hasOwnProperty('SITE_FETCH_DELAY_MILLIS'))? process.env.SITE_FETCH_DELAY_MILLIS : 300;

const fetch = require('node-fetch');

const pluralNumbers   = [ 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const singularNumbers = [ 'a', 'an', 'one' ];
const pluralAmounts   = [ 'many', 'some', 'a few', 'dozens of', 'half a dozen', 'more than half a dozen' ];

const idiomsWithPlurals = [
  {
    basePhrase   : 'according to',
    singularNoun : 'person',
    pluralNoun   : 'people',
  },
  {
    basePhrase   : 'according to',
    singularNoun : 'source',
    pluralNoun   : 'sources',
  },
  {
    basePhrase   : 'according to',
    singularNoun : 'official',
    pluralNoun   : 'officials',
  },
  {
    basePhrase   : 'according to',
    singularNoun : 'economist',
    pluralNoun   : 'economists',
  },
  {
    basePhrase   : 'according to',
    singularNoun : 'expert',
    pluralNoun   : 'experts',
  },
  {
    basePhrase   : 'according to',
    singularNoun : 'poll',
    pluralNoun   : 'polls',
  },
  {
    basePhrase   : 'according to',
    singularNoun : 'analyst',
    pluralNoun   : 'analysts',
  },
];

const standardCandles = [ 'the', 'finance', 'abc', 'news', 'political', ];

const sites = [
  {
    name              : 'ft.com',
    baseQuery         : 'https://www.ft.com/search?q=',
    regExForCount     : 'Viewing results? \\d+‒\\d+ of (\\d+)', // Viewing results 1‒25 of 2578
    regExForNoResults : 'No results found',
  },
  {
    name              : 'www.nytimes.com',
    baseQuery         : 'https://www.nytimes.com/search?query=',
    regExForCount     : 'Showing ([\\d,]+) results? for:', // Showing 493,595 results for:
    regExForNoResults : 'Showing 0 results for:',
  },
  // {
  //   name              : 'www.telegraph.co.uk',
  //   baseQuery         : 'https://www.telegraph.co.uk/search.html?q=',
  //   regExForCount     : 'About ([\\d,]+) results', // About 5,460,000 results
  //   regExForNoResults : 'No Results',
  // },

];

const FAILED_SEARCH = '-1'; // to differentiate from actually finding a result of 0

function generatePhrases() {
  const phrases = [];

  idiomsWithPlurals.map( idiom => {
    singularNumbers.map( singularNumber => {
      phrases.push( `${idiom.basePhrase} ${singularNumber} ${idiom.singularNoun}` );
    });

    pluralNumbers.map( pluralNumber => {
      phrases.push( `${idiom.basePhrase} ${pluralNumber} ${idiom.pluralNoun}` );
    });

    pluralAmounts.map( pluralAmount => {
      phrases.push( `${idiom.basePhrase} ${pluralAmount} ${idiom.pluralNoun}` );
    });
  });

  standardCandles.map( candle => {
    phrases.push( candle );
  });

  return phrases;
}

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

function searchForSitesPhrase( site, phraseObj ){
  const query = phraseObj.query;
  const regExForCount = new RegExp( site.regExForCount );
  const regExForNoResults = new RegExp( site.regExForNoResults );

  const startMillis = Date.now();
  return fetch( query )
  .then( res => {
    phraseObj.status = res.status;
    phraseObj.durationMillis = Date.now() - startMillis;
    return res;
  })
  .then( res => res.text() )
  .then( text => {
    let result = FAILED_SEARCH;
    const mCount = text.match( regExForCount );
    if (mCount !== null) {
      result = mCount[1].replace(/,/g, "");
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
      return searchForSitesPhrase( site, phraseObj )
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

const startMillis = Date.now();
const phrases = generatePhrases();
primeAllSites( sites, phrases );
searchSites( sites )
.then( sites => {
  const formattedResults = formatStats( sites );
  formattedResults.durationMillis = Date.now() - startMillis;
  console.log( `formattedResults: ${JSON.stringify(formattedResults, null, 2)}`);
})
.catch( error => {
  console.log(error.message);
});
