//
// Imports
//
const async = require("async");
const fs = require("fs");
const prettydiff = require("prettydiff");

//
// Constants
//
const CREDS_FILE = "creds.json";
const INPUT_FILE = "suc.tsv";

// column numbers
exports.COL_NAME = 1;
exports.COL_ALT_NAME = 2;
exports.COL_X = 3;
exports.COL_Y = 4;
exports.COL_LINK = 6;

//
// Exports
//
exports.creds = function(callback) {
    if (!fs.existsSync(CREDS_FILE)) {
        return callback(`${CREDS_FILE} doesn't exist!`);
    }

    let creds = JSON.parse(fs.readFileSync(CREDS_FILE));

    return callback(null, creds);
};

exports.diff = function(before, after) {
    let options = prettydiff.defaults;
    options.source = before;
    options.diff = after;
    options.language = "text";
    options.mode = "diff";

    let diff = "(unknown)";
    try {
        diff = prettydiff.mode(options);
    } catch (e) {
        console.error(e);
    }

    console.log(diff);
};

exports.read = function(onlySystem, callback) {
    async.waterfall([
        function(cb) {
            console.log(`Reading ${INPUT_FILE}...`);

            // read input file
            var inputSuc = fs.readFileSync(INPUT_FILE, "utf-8");

            // split at each line
            var inputLines = inputSuc.split("\n");

            cb(null, inputLines);
        },
        function(inputLines, cb) {
            console.log("Extracting coordinates...");

            var systems = inputLines.map(line => {
                const lineSplit = line.split("\t");

                if (lineSplit.length < 6) {
                    return null;
                }

                return {
                    name: lineSplit[exports.COL_NAME].trim(),
                    altName: lineSplit[exports.COL_ALT_NAME].trim(),
                    x: parseFloat(lineSplit[exports.COL_X].replace("\"", "").replace(",", ""), 10),
                    y: parseFloat(lineSplit[exports.COL_Y].replace("\"", "").replace(",", ""), 10),
                    sarna: decodeURIComponent(lineSplit[exports.COL_LINK]
                        .replace("https://www.sarna.net/wiki/", "")
                        .replace("http://www.sarna.net/wiki/", ""))
                };
            }).filter(system => system !== null);

            cb(null, systems);
        },
        function(systems, cb) {
            // limit if desired
            var filteredSystems = [];

            if (!isNaN(parseInt(onlySystem, 0))) {
                filteredSystems = systems.slice(0, parseInt(onlySystem, 0));
            } else if (onlySystem) {
                if (onlySystem[0] === "+") {
                    // everything after
                    onlySystem = onlySystem.substring(1);

                    let foundSystemIdx = systems.findIndex(s => s.name === onlySystem || s.altName === onlySystem);
                    if (!foundSystemIdx) {
                        return callback(`Could not find system ${onlySystem}`);
                    }

                    filteredSystems = systems.slice(foundSystemIdx);
                } else {
                    let foundSystem = systems.find(s => s.name === onlySystem || s.altName === onlySystem);
                    if (!foundSystem) {
                        return callback(`Could not find system ${onlySystem}`);
                    }

                    filteredSystems.push(foundSystem);
                }
            } else {
                filteredSystems = systems.slice(0);
            }

            return cb(null, systems, filteredSystems);
        }
    ], callback);
};
