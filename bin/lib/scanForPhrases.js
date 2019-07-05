// scan assorted news sites for idioms

const directly = require('./directly'); // trying Rhys' https://github.com/wheresrhys/directly.
                                                // You pass 'directly' a list of fns, each of which generates a promise.
                                                // The fn calls are throttled.

const SITE_FETCH_CONCURRENCE  = (process.env.hasOwnProperty('SITE_FETCH_CONCURRENCE' ))? process.env.SITE_FETCH_CONCURRENCE  : 2;
const SITE_FETCH_DELAY_MILLIS = (process.env.hasOwnProperty('SITE_FETCH_DELAY_MILLIS'))? process.env.SITE_FETCH_DELAY_MILLIS : 500;

const fetch = require('node-fetch');

const FAILED_SEARCH = '-1'; // to differentiate from actually finding a result of 0

function generateSiteQueriesForAllPhrases( site ){
  site.byPhrase = {};
  site.phrases.map( phrase => {
    site.byPhrase[phrase] = {
      phrase,
      query : site.generateSiteQuery( site, phrase ),
    };
  });
}

function primeSites( sites ){
   sites.map( site => {
     generateSiteQueriesForAllPhrases( site );
   });
   return sites;
}

function searchForSitePhrase( site, phraseObj ){
  const phrase = phraseObj.phrase;
  const query = phraseObj.query;
  const regExForCount      = new RegExp( site.regExForCount      );
  const regExForNoResults  = new RegExp( site.regExForNoResults  );

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
    phraseObj.resultText = text;
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
  // create array of funcs which return search promises, to pass to directly() to throttle the searches
  const promisers = site.phrases.map( phrase => {
    const phraseObj = site.byPhrase[phrase];
    return function() {
      return searchForSitePhrase( site, phraseObj )
        .catch( err => {
          console.log( `ERROR: searchSite: promise for site=${site.name}, phrase=${phrase}: err=${err}`);
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
    phraseCountsPerSiteCsv : phraseCountsPerSite.map( row => { return row.join(','); } ),
  };
}

// mandatory site vals
const mandatorySiteKeys = [
  'phrases',
];

function checkAndSetSitesConfigs( sites ){
  if (! sites ) {
    throw new Error(`ERROR: checkSitesConfigs: sites not specified`);
  }
  sites.forEach( (site, index) => {
    mandatorySiteKeys.forEach( mandatorySiteKey => {
      if (! site.hasOwnProperty( mandatorySiteKey )) {
        throw new Error(`ERROR: checkSitesConfigs: site[${index}] missing key, ${mandatorySiteKey}`);
      }
    })

    site.SITE_FETCH_CONCURRENCE  = SITE_FETCH_CONCURRENCE;
    site.SITE_FETCH_DELAY_MILLIS = SITE_FETCH_DELAY_MILLIS;
  });
}

// refactored so each site obj contains all the info needed, including the phrases.
// NB, assuming we can overwrite the sites obj
function raw(sites) {
  checkAndSetSitesConfigs(sites);
  const startMillis = Date.now();
  primeSites( sites );

  return searchSites( sites )
  .then( sites => {
    const formattedResults = formatStats( sites );
    formattedResults.durationMillis = Date.now() - startMillis;
    console.log( `formattedResults: ${JSON.stringify(formattedResults, null, 2)}`);
    return {
      sites,
      formattedResults,
    };
  })
  .catch( error => {
    console.log(error.message);
  });
}

module.exports = {
  raw,
};
