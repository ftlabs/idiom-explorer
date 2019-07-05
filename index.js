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

app.use("/scanForPhrases/raw", (req, res) => {
  const maxDays = 100;
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
      phrases : [ 'the the' ],
      generateSiteQuery : ( site, phrase ) => { return `${site.baseQuery}"${phrase}"`; },
    },
  ];

  scanForPhrases.raw(sites)
  .then( sites => {
    res.json(sites);
  })
  .catch( err => {
    console.log( `ERROR: path=/scanForPhrases/raw, err=${err}`);
    res.json( { err } );
  })
  ;
});

// ---

app.use("/", (req, res) => {
  res.render("index");
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
