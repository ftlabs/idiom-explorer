// scan assorted news sites for typos

const scanForPhrases = require("./scanForPhrases");

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

// for clarity, break out the regex for a phrase into a map of individual fragments,
// each of which is a not typo, with an example, then concat the keys with pipes into one regex for each phrase.
let notTyposFragments = { // default
  'a a'   : {
    '&amp;<mark'     : 'making M&A a potentially',
    '>A<\\/mark>\\$' : 'and a A$100bn',
    '>A<\\/mark>,[^>]+>a<\\/mark>'      : 'Article 35A, a constitutional provision',
    '>A<\\/mark>-<mark[^>]+>A<\\/mark>' : 'A-A*',
  },
  'a an'  : {
    '\\(<mark[^>]+>[Aa]<\\/mark>\\) <mark[^>]+>an<\\/mark>' : 'including (a) an entity',
    '>A<\\/mark>\s?[\—,\-] +<mark[^>]+>an<\\/mark>' : 'Programme A — an early ',
    '&amp;<mark[^>]+>A<'     : 'at the V&A, an education',
    '>A<\\/mark>:'         : 'at Costa? A: An Aericano',
  },
  'a the' : {
    '-<mark[^>]+>[aA]<'  : 'as triple-A. The agency',
    '>[aA]<\\/mark>\\)'  : 'What is new is a) the declining',
    '&amp;<mark[^>]+>A<' : 'Banking M&A: the quest',
    '>A<\\/mark>[:\\.,♥♣♦♠]' : 'Exhibit A: the surge, or Person A. The case continues. Person A, the. East’s A♣ (the high ',
    '[’\']<mark[^>]+>a<' : 'seized Sana’a, the capital',
    'Series? <mark[^>]+>A<': 'of Serie A, the top',
    '>a<\\/mark> +[\—\-] +<mark[^>]+>the<\\/mark>' : 'How on a - the scale ',
    'a\\.k\\.<mark[^>]+>a<\\/mark>' : 'a.k.a. the original',
  },
  'an the' : {
    'Ping <mark[^>]+>An<' : 'like Ping An, the insurance group',
    '<mark[^>]+>An<\\/mark>\.' : 'were from Nghe An. The two'
  },
  'pubic' : {
    '<mark[^>]+>[Pp]ubic<\\/mark> (?:area|bone|hair|fuzz|triangle)' : 'pubic hair, etc',
  },
  'said said' : {
    '>said<\\/mark>[^>]+>Said<\\/mark>' : 'said Said Jahani',
    '>Said<\\/mark>,[^>]+>said<\\/mark>' : 'founder of Thunder Said, said this',
  },
  'the a' : {
    '>A<\\/mark>'             : 'including the A321XLR launched; to the A level syllabus',
    '“<mark[^>]+>a<\\/mark>”' : 'Hera was the “a” removed' // NB the details of the speech marks
  },
  'the an' : {
    '“<mark[^>]+>An<\\/mark>”' : 'next to the “An” in Grant Thornton’s logo.' // NB the details of the speech marks
  },
  'the the' : {
    '>the<\\/mark> +[\—\-] +<mark[^>]+>the<\\/mark>' : 'action of the - the actions',
  },
  'were were' : {
    '“<mark[^>]+>Were<\\/mark>[^>]+>Were<\\/mark>”' : 'He ended with “Were Were”, drums firing like gunshots',
  },
  'with with' : {
    '<mark[^>]+>with<\\/mark>\\. <mark[^>]+>With<\\/mark>' : 'work with. With more',
  }
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
  notTypos[phrase] = Object.keys(fragments).join('|');
});

const standardCandles = [
  'trump',
  'business',
];

let MAXDAYS = 7;
if (process.env.hasOwnProperty('MAXDAYS' )) {
  const numDays = parseInt( process.env.MAXDAYS );
  if (numDays > 0) {
    MAXDAYS = numDays;
    console.log( `INFO: MAXDAYS specified in env: ${MAXDAYS}`);
  } else {
    console.log( `WARNING: MAXDAYS specified in env, but failed to parse as a +ve int: defaulting to ${MAXDAYS}`);
  }
} else  {
  console.log( `INFO: MAXDAYS not specified in env: defaulting to ${MAXDAYS}`);
}

const FAILED_SEARCH = '-1'; // to differentiate from actually finding a result of 0

function parseSitePhraseObj( site, phraseObj ){
  const phrase = phraseObj.phrase;
  const query = phraseObj.query;
  const regExForCount      = new RegExp( site.regExForCount      );
  const regExForNoResults  = new RegExp( site.regExForNoResults  );
  const regExForEachResult = new RegExp( site.regExForEachResult, ['g']);
  const regExForNotTypo    = notTypos.hasOwnProperty(phrase)? new RegExp(notTypos[phrase]) : null;
  const text = phraseObj.resultText;
  phraseObj.resultText = '...';
  phraseObj.results = [];

  if (phraseObj.result !== FAILED_SEARCH && phraseObj.result !== '0') {
    // look up each result
    let resultMatches;
    while ((resultMatches = regExForEachResult.exec(text)) !== null) {
      const section    = resultMatches[1];
      const path       = resultMatches[2];
      const heading    = resultMatches[3];
      const standfirst = resultMatches[4];
      const dateText   = resultMatches[5];
      const textMaybeContainingMarks = (standfirst.includes('<mark'))? standfirst : heading;

      if (regExForNotTypo !== null
        && textMaybeContainingMarks.match(regExForNotTypo) !== null) {
        // skip this result
      } else {
        const fullPath = path.startsWith('/') ? `https://www.ft.com${path}` : path;

        let standFirstParts;
        let standfirstCropped = "standfirst";
        if ((standFirstParts = /(.*\W)(\w+\W*<mark.+<\/mark>.+<\/mark>\W*\w+)(.*)/.exec( standfirst)) !== null) {
          standfirstCropped = `... ${standFirstParts[2]} ...`;
        }

        phraseObj.results.push({
          section,
          path,
          fullPath,
          heading,
          standfirst,
          standfirstCropped,
          date: dateText,
        });
      }
    }
  }

  return phraseObj;
}

function parseSites( sites ){
  sites.forEach( site => {
    Object.keys( site.byPhrase ).map( phrase => {
      const phraseObj = site.byPhrase[phrase];
      parseSitePhraseObj( site, phraseObj );
    });
  });
}

function scanRaw(maxDays=null) {
  if (maxDays === null) {
    maxDays = MAXDAYS;
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
        '<a href=\"([^\"]+)\"[^>]+>(.*?)</a>', // path, heading(may or may not contain a span)
        'class=\"o-teaser__standfirst\"',
        '<a.*?>(',
        ')</a>', // standfirst(may or may not contain a span)
        'class=\"o-teaser__timestamp-date\"[^>]+>([^<]+)<', // date
      ].join('(?:.|\\n)*?'), // match any char incl newline. Should be via flag 's' and dotAll '.' for later node versions
      alignApp          : 'http://ftlabs-suggest.herokuapp.com/articles/alignTitlesInYear/display?term=',
      notTyposFragments,
      notTypos,
      generateSiteQuery : ( site, phrase ) => { return `${site.baseQuery}"${phrase}"`; },
      phrases : typos,
      useUncached : true,
    },

  ];

  return scanForPhrases.raw( sites )
  .then( sitesPlusFormat => {
    const sites = sitesPlusFormat.sites;
    parseSites( sites );
    // console.log( `scanRaw: sitesPlusFormat: ${JSON.stringify(sitesPlusFormat, null, 2)}`);
    return sites;
  })
  .catch( error => {
    console.log(error.message);
  });
}

module.exports = {
  scanRaw,
  config : {
    MAXDAYS,
    typos,
    notTyposFragments,
    notTypos,
    standardCandles
  }
};
