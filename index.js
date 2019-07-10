const dotenv = require("dotenv").config({
  silent: process.env.NODE_ENVIRONMENT === "production"
});
const package = require("./package.json");
const debug = require("debug")(`${package.name}:index`);
const express = require("express");
const path = require("path");
const app = express();
const validateRequest = require("./helpers/check-token");

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

app.use(requestLogger);

// these routes do *not* have s3o
app.use("/static", express.static("static"));

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  throw new Error("ERROR: TOKEN not specified in env");
}

// these route *do* use s3o
app.set("json spaces", 2);
if (process.env.BYPASS_TOKEN !== "true") {
  app.use(validateRequest);
}

//Core Routes

app.use("/typos/raw", (req, res) => {
  typos.scanRaw()
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
  typos.scanRaw()
  .then( sites => {
    res.render('tidyTypos', { sites });
  })
  .catch( err => {
    console.log( `ERROR: path=/typos/json, err=${err}`);
    res.json( { err } );;
  })
  ;
});

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

    res.render('basicIdiomChart', parsedResults );
  })
  .catch( err => {
    console.log( `ERROR: path=/idioms/chart, err=${err}`);
    res.json( { err } );;
  })
  ;
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
  console.log(`/: config.candidateChartSpecAndUrls=${JSON.stringify(config.candidateChartSpecAndUrls,null,2)}`);

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
