// scan assorted news sites for idioms

const scanForPhrases = require("./scanForPhrases");

const singularNumbers = [ 'a', 'an', 'one' ];
const pluralNumbers   = [ 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const pluralAmounts   = [ 'many', 'some', 'a few', 'dozens of', 'half a dozen', 'more than half a dozen' ];
// const singularNumbers = [ 'a', 'one' ];
// const pluralNumbers   = [ 'two', 'three', ];
// const pluralAmounts   = [ 'many', 'some', ];

const idiomsWithPlurals = [
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
  {
    basePhrase   : 'according to',
    singularNoun : 'person',
    pluralNoun   : 'people',
  },
];

const standardCandles = [ 'finance', 'abc', 'news', 'political', ];

const FAILED_SEARCH = '-1'; // to differentiate from actually finding a result of 0

function generatePhrases(spec) {
  if (! spec.hasOwnProperty('AXN')) {
    spec.AXN = [];
  }
  if (! spec.hasOwnProperty('SC')) {
    spec.SC = [];
  }

  const initialAxnLength = spec.AXN.length;
  const initialScLength  = spec.SC.length;

  if (initialAxnLength === 0 && initialScLength === 0) {
    spec.AXN = idiomsWithPlurals.slice(0,1);
    spec.SC  = standardCandles.slice(0,1);
  }

  const phrases = [];
  const withPlurals = spec.AXN;
  const standAlones  = spec.SC;

  withPlurals.map( idiom => {
    singularNumbers.map( singularNumber => {
      if (singularNumber === 'a' && idiom.singularNoun.match(/^[aeiouh]/)) {
        return;
      }
      if (singularNumber === 'an' && !idiom.singularNoun.match(/^[aeiouh]/)) {
        return;
      }
      phrases.push( `${idiom.basePhrase} ${singularNumber} ${idiom.singularNoun}` );
    });

    pluralNumbers.map( pluralNumber => {
      phrases.push( `${idiom.basePhrase} ${pluralNumber} ${idiom.pluralNoun}` );
    });

    pluralAmounts.map( pluralAmount => {
      phrases.push( `${idiom.basePhrase} ${pluralAmount} ${idiom.pluralNoun}` );
    });
  });

  standAlones.map( candle => {
    phrases.push( candle );
  });

  return phrases;
}

function formatStatsForLineChart( sites, spec ){
  // divide phrases in to SC and not SC
  const allPhrases = Object.keys( sites[0].byPhrase ); // read common list of phrases from 1st site
  const phrasesSC  = [];
  const phrasesAXN = [];

  allPhrases.map( phrase => {
    if( spec.SC.includes(phrase) ){
      phrasesSC.push( phrase );
    } else {
      phrasesAXN.push( phrase );
    }
  });

  const phrases = (phrasesAXN.length > 0)? phrasesAXN : phrasesSC; // to handle SC-only spec

  // if no SC, or no AXN, then scale everything by 1 (to leave it unchanged)
  // if there is at least one SC, find the average value for each site, noting the one for ft.com
  // then divide all the others by the ft average to scale them to the ft, then divide each of their counts by that scale

  const scStatsBySite = {};
  let ftComSite;
  sites.map( site => { // get SC counts per site, and identify the ft.com site
    const scStats = {};
    scStatsBySite[site.name] = scStats;
    if (site.name === 'ft.com') {
      ftComSite = site;
    }
    scStats.counts = phrasesSC.map( phrase => parseInt(site.byPhrase[phrase].result) );
  });

  const ftComScStats = scStatsBySite[ftComSite.name];
  sites.map( site => {
    scStats = scStatsBySite[site.name];

    if (phrasesSC.length == 0 || phrasesAXN.length == 0) {
      scStats.countsRelativeToFtCom = [1.0];
      // scStats.avgRelToFtCom  = 1.0;
    } else {
      scStats.countsRelativeToFtCom = phrasesSC.map( (phrase, phraseIndex) => {
        return (ftComScStats.counts[phraseIndex] <= 0 || scStats.counts[phraseIndex] <= 0)? 1.0 : scStats.counts[phraseIndex] / ftComScStats.counts[phraseIndex];
      });
    }

    const sum = scStats.countsRelativeToFtCom.reduce((a, b) => a + b );
    const avg = sum / scStats.countsRelativeToFtCom.length;
    scStats.avgRatioCountsRelativeToFtCom = avg;
  });

  const datasets = [];
  const scaledDatasets = [];
  sites.map( site => {
    scStats = scStatsBySite[site.name];
    const dataset = {
      label: site.name,
      data: [],
      fill: false,
      borderColor: site.borderColor,
      backgroundColor: site.borderColor,
    };
    datasets.push(dataset);
    const scaledTitleSuffix = (scStats.avgRatioCountsRelativeToFtCom === 1.0)? '' : ` (divided by ${scStats.avgRatioCountsRelativeToFtCom.toFixed(1)})`;
    const scaledDataset = {
      label: `${site.name}${scaledTitleSuffix}`,
      data: [],
      fill: false,
      borderColor: site.borderColor,
    };
    scaledDatasets.push(scaledDataset);

    phrases.map( phrase => {
      const count = parseInt(site.byPhrase[phrase].result);
      dataset.data.push(count);
      scaledDataset.data.push( count / scStats.avgRatioCountsRelativeToFtCom );
    });
  });

  const axnSuffix = spec.AXN.map(axn => [axn.basePhrase, axn.singularNoun, axn.pluralNoun].join(',')).map(psv => `"${psv}"`).join(', ');
  const scSuffix  = (spec.SC)? ` scaled by ${spec.SC.map(sc => `"${sc}"`).join(', ')}` : '';
  const title = `Comparing use of idioms on different news sites: ${axnSuffix}`;
  const scaledTitle = `Comparing use of idioms on different news sites: ${axnSuffix}${scSuffix}`;
  return {
    spec,
    labels : phrases,
    datasets,
    scaledDatasets,
    title,
    scaledTitle,
    allPhrases,
    phrasesSC,
    phrases,
    stringified : {
      labels : JSON.stringify( phrases ),
      datasets : JSON.stringify(datasets),
      scaledDatasets : JSON.stringify(scaledDatasets),
      title: JSON.stringify(title),
      scaledTitle: JSON.stringify(scaledTitle),
    },
    scStatsBySite,
    scOnly : (phrasesAXN.length == 0),
  };
}

function scanRaw( spec = {'AXN': [], 'SC': []} ){
  const sites = [
    {
      name              : 'ft.com',
      borderColor       : 'orange',
      baseQuery         : 'https://www.ft.com/search?q=',
      regExForCount     : 'Viewing results? \\d+‒\\d+ of (\\d+)', // Viewing results 1‒25 of 2578
      regExForNoResults : 'No results found',
      generateSiteQuery : ( site, phrase ) => { return `${site.baseQuery}"${phrase}"`;},
    },
    {
      name              : 'www.nytimes.com',
      borderColor       : 'black',
      baseQuery         : 'https://www.nytimes.com/search?query=',
      regExForCount     : 'Showing ([\\d,]+) results? for:', // Showing 493,595 results for:
      regExForNoResults : 'Showing 0 results for:',
      generateSiteQuery : ( site, phrase ) => { return `${site.baseQuery}"${phrase}"`;},
    },
    // {
    //   name              : 'www.telegraph.co.uk',
    //   baseQuery         : 'https://www.telegraph.co.uk/search.html?q=',
    //   regExForCount     : 'About ([\\d,]+) results', // About 5,460,000 results
    //   regExForNoResults : 'No Results',
    // },

  ];
  const phrases = generatePhrases(spec);

  sites.forEach( site => {
    site.phrases = phrases;
  });

  let resultsObj = {};

  return scanForPhrases.raw( sites )
  .then( sfpResults => {
    resultsObj = sfpResults;
    const sites = resultsObj.sites;
    // strip resultText from each byPhrase
    sites.map( site => {
      Object.keys( site.byPhrase ).map( phrase => {
        const phraseObj = site.byPhrase[phrase];
        phraseObj.resultText = '...';
      })
    });
    return sites;
  })
  .then( sites => {
    resultsObj.formattedResultsLineChart = formatStatsForLineChart( sites, spec );
    return sites;
  })
  .then( sites => {
    resultsObj.formattedResults.stringified = {
      phraseCountsPerSiteCsv : JSON.stringify(resultsObj.formattedResults.phraseCountsPerSiteCsv, null, 2),
    }
    return resultsObj;
  })
  .catch( error => {
    console.log(error.message);
  });
}

const CACHED_SCANRAW = {};

function cachedScanRaw( spec = {'AXN': [], 'SC': []} ){
  const specKey = JSON.stringify(spec);
  if (CACHED_SCANRAW.hasOwnProperty( specKey )) {
    return Promise.resolve()
    .then( () => {
      console.log(`cachedScanRaw: from cache: specKey=${specKey}`);
      return CACHED_SCANRAW[specKey];
    });
  } else {
    return scanRaw( spec )
    .then( sr => {
      console.log(`cachedScanRaw: uncached: specKey=${specKey}`);
      CACHED_SCANRAW[specKey] = sr;
      return sr;
    })
  }
}

function flushCache(){
  const keys = Object.keys(CACHED_SCANRAW);
  keys.map( key => { delete CACHED_SCANRAW[key]; })
  return keys.length;
}

module.exports = {
  scanRaw: cachedScanRaw,
  candidateAXNs : idiomsWithPlurals.map( idiom => [idiom.basePhrase, idiom.singularNoun,idiom.pluralNoun].join(',')),
  candidateSCs  : standardCandles,
  flushCache,
};
