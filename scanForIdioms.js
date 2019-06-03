// scan assorted news sites for idioms

const fetch = require('node-fetch');

const pluralNumbers   = [ 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const singularNumbers = [ 'a', 'one' ];
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
];

const standardCandles = [ 'the', 'finance', 'abc', 'news', 'political', ];

const sites = [
  {
    name              : 'ft.com',
    baseQuery         : 'https://www.ft.com/search?q=',
    regExForCount     : /Viewing results? \d+‒\d+ of (\d+)/, // Viewing results 1‒25 of 2578
    regExForNoResults : /No results found/,
  },
  {
    name              : 'www.nytimes.com',
    baseQuery         : 'https://www.nytimes.com/search?query=',
    regExForCount     : /Showing ([\d,]+) results? for:/, // Showing 493,595 results for:
    regExForNoResults : /Showing 0 results for:/,
  }

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
}

function searchForSitesPhrase( site, phraseObj ){
  const query = phraseObj.query;

  return fetch( query )
  .then( res => {
    phraseObj.status = res.status;
    return res;
  })
  .then( res => res.text() )
  .then( text => {
    let result = FAILED_SEARCH;
    const mCount = text.match( site.regExForCount );
    if (mCount !== null) {
      result = mCount[1].replace(/,/g, "");
    } else {
      const mNoResults = text.match( site.regExForNoResults );
      if (mNoResults !== null) {
        result = '0';
      }
    }

    phraseObj.result = result;

    return phraseObj.result;
  });
}

function searchSite( site ){
  const phrases = Object.keys( site.byPhrase );
  const promises = phrases.map( phrase => {
    const phraseObj = site.byPhrase[phrase];
    return searchForSitesPhrase( site, phraseObj );
  });

  return Promise.all( promises )
  .then( results => {
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
    console.log( `sitesResults: ${JSON.stringify(sitesResults, null, 2)}`);
  })
  .catch(error => {
    console.log(error.message)
  });
}

const phrases = generatePhrases();
primeAllSites( sites, phrases );
searchSites( sites );
