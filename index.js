const dotenv = require("dotenv").config({
  silent: process.env.NODE_ENVIRONMENT === "production"
});
const package = require("./package.json");
const debug = require("debug")(`${package.name}:index`);
const express = require("express");
const path = require("path");
const app = express();

const typos = require("./bin/lib/typos");
const scanForPhrases = require("./bin/lib/scanForPhrases");
const idioms = require("./bin/lib/idioms");

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

let requestLogger = function(req, res, next) {
  debug("RECEIVED REQUEST:", req.method, req.url);
  next(); // Passing the request to the next handler in the stack.
};

const session = require('cookie-session');
const OktaMiddleware = require('@financial-times/okta-express-middleware');
const okta = new OktaMiddleware({
  client_id: process.env.OKTA_CLIENT,
  client_secret: process.env.OKTA_SECRET,
  issuer: process.env.OKTA_ISSUER,
  appBaseUrl: process.env.BASE_URL,
  scope: 'openid offline_access name'
});

app.use(session({
	secret: process.env.SESSION_TOKEN,
	maxAge: 24 * 3600 * 1000, //24h
	httpOnly: true
}));

app.use(requestLogger);

// these routes do *not* have OKTA
app.use("/static", express.static("static"));

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  throw new Error("ERROR: TOKEN not specified in env");
}

// these route *do* use OKTA
app.set("json spaces", 2);


// Check for valid OKTA login or valid token to byass OKTA login
// This function is not in a middleware or seperate file because
// it requires the context of okta and app.use to function
app.use((req, res, next) => {
  if ('token' in req.headers){
	   if(req.headers.token === process.env.TOKEN){
		     debug(`Token (header) was valid.`);
		     next();
       } else {
         debug(`The token (header) value passed was invalid.`);
         res.status(401);
         res.json({
           status : 'err',
           message : 'The token (header) value passed was invalid.'
         });
       }
  } else if('token' in req.query ){
    if(req.query.token === process.env.TOKEN){
      debug(`Token (query string) was valid.`);
		  next();
    } else {
      debug(`The token (query) value passed was invalid.`);
      res.status(401);
      res.json({
        status : 'err',
        message : 'The token (query) value passed was invalid.'
      });
    }
  } else {
    debug(`No token in header or query, so defaulting to OKTA`);
		// here to replicate multiple app.uses we have to do
		// some gross callback stuff. You might be able to
    // find a nicer way to do this

		// This is the equivalent of calling this:
		// app.use(okta.router);
		// app.use(okta.ensureAuthenticated());
    // app.use(okta.verifyJwts());

		okta.router(req, res, error => {
			if (error) {
				return next(error);
      }
			okta.ensureAuthenticated()(req, res, error => {
				if (error) {
					return next(error);
        }
				okta.verifyJwts()(req, res, next);
      });
    });
  }
});


//Core Routes

app.use("/typos/raw", (req, res) => {
  const maxDays = req.query.hasOwnProperty('maxdays')? parseInt(req.query.maxdays) : null;

  typos.scanRaw(maxDays)
  .then( sites => {
    res.json(sites);
  })
  .catch( err => {
    console.log( `ERROR: path=/typos/raw, err=${err}`);
    res.json( { err } );;
  })
  ;
});

app.use("/typos/config", (req, res) => {
  res.json(typos.config);
});

app.use("/typos/tidy", (req, res) => {
  const maxDays = req.query.hasOwnProperty('maxdays')? parseInt(req.query.maxdays) : null;
  const ignoreCsv = req.query.hasOwnProperty('ignore')? req.query.ignore : null;

  typos.scanRaw(maxDays, ignoreCsv)
  .then( sites => {
    res.render('tidyTypos', { sites });
  })
  .catch( err => {
    console.log( `ERROR: path=/typos/json, err=${err}`);
    res.json( { err } );;
  })
  ;
});

// ---

function parseIdiomsSpec( specText = '' ){
  // AXN -> adverb number noun
  // SC -> standard candle
  // /idioms/raw?spec=AXN:according to,source,sources|according to,person,people|SC:finance

  const spec = {
    'AXN' : [],
    'SC'  : []
  }

  if (specText) {

    specText.split('|')
    .map( item => {
      const itemParts = item.split(':');
      if (itemParts.length !== 2) {
        throw new Error(`parseIdiomsSpec: could not parse item=${item}`);
      }
      if (itemParts[0] == 'AXN') {
        const axnParts = itemParts[1].split(',');
        if (axnParts.length !== 3) {
          throw new Error(`parseIdiomsSpec: could not parse itemParts[1]=${itemParts[1]}`);
        }

        spec.AXN.push({
          basePhrase   : axnParts[0],
          singularNoun : axnParts[1],
          pluralNoun   : axnParts[2],
        });
      } else if (itemParts[0] == 'SC') {
        spec.SC.push( itemParts[1] );
      }
    });
  }
  return spec;
}

app.use("/idioms/raw", (req, res) => {
  const spec = parseIdiomsSpec( req.query.spec );
  console.log(`INFO: /idioms/raw: spec=${JSON.stringify(spec)}`);
  idioms.scanRaw(spec)
  .then( sites => {
    res.json(sites);
  })
  .catch( err => {
    console.log( `ERROR: path=/idioms/raw, err=${err}`);
    res.json( { err } );;
  })
  ;
});

app.use("/idioms/chart", (req, res) => {
  const spec = parseIdiomsSpec( req.query.spec );
  const unscaled = (req.query.unscaled === 'true');
  const yAxisLogarithmic = (req.query.yaxistype === 'logarithmic');
  console.log(`INFO: /idioms/chart: spec=${JSON.stringify(spec)}`);
  idioms.scanRaw(spec)
  .then( parsedResults => {
    const frlcStringified = parsedResults.formattedResultsLineChart.stringified;
    frlcStringified.datasetsMaybeScaled
      = (unscaled)? frlcStringified.datasets : frlcStringified.scaledDatasets;
    frlcStringified.titleMaybeScaled
      = (unscaled)? frlcStringified.title : frlcStringified.scaledTitle;
    frlcStringified.yAxisType
      = JSON.stringify( (yAxisLogarithmic)? 'logarithmic' : 'linear' );

    parsedResults.formattedResultsLineChart.chartType = (parsedResults.formattedResultsLineChart.scOnly)? 'bar' : 'line';

    res.render('basicIdiomChart', parsedResults );
  })
  .catch( err => {
    console.log( `ERROR: path=/idioms/chart, err=${err}`);
    res.json( { err } );;
  })
  ;
});

// ---

app.use("/admin/flushallcaches", (req, res) => {
  const flushes = {
    idioms : idioms.flushCache(),
    scanForPhrases : scanForPhrases.flushCache(),
  }
  res.json( { 'num keys flushed' : flushes});
});


// ---

app.use("/", (req, res) => {
  const config = {};
  // /idioms/chart?spec=AXN:according%20to,source,sources|SC:finance&unscaled=true&yaxistype=logarithmic
  const candidateAXNs = idioms.candidateAXNs;
  const candidateSCs  = idioms.candidateSCs;
  const primarySC = candidateSCs[0];
  const urlMissingSpec = '/idioms/chart?unscaled=true&yaxistype=logarithmic&spec=';
  const candidateSpecs = candidateAXNs.map( axn => `AXN:${axn}|SC:${primarySC}`);
  config.candidateChartSpecAndUrls = candidateSpecs.map( spec => {
    return {
      spec,
      stringifiedSpec: JSON.stringify(spec),
      url: `${urlMissingSpec}${spec}`,
      stringifiedUrl: JSON.stringify(`${urlMissingSpec}${spec}`),
    }
  });

  res.render("index", config);
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const PORT = process.env.PORT;
if (!PORT) {
	throw new Error('ERROR: PORT not specified in env');
}

const server = app.listen(PORT, function() {
  console.log("Server is listening on port", PORT);
});

module.exports = server;
