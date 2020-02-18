"use strict";

//
// Imports
//
const fs = require("fs");
const MediaWikiBot = require("nodemw");
const async = require("async");
const PlanetsLib = require("./planets-lib");

//
// Constants
//
const COORD_REGEX = /^\|\s*coord\s*=\s*([\d.,-]+)\s*:\s*([\d.,-]+).*/gm;
const PLANET_NAME_REGEX = /([^(]+)/;
const DIFF_THRESHOLD = 5;
const PLANET_CHECK = "{{InfoBoxSystem";
const PARALLEL = 1;
const DISAMBIGUATION = "disambiguation";
const PRETEND = true;

//
// App
//

// pass configuration object
var client = new MediaWikiBot("config.json");

var inputSuc = fs.readFileSync("suc.tsv", "utf-8");
var inputSucLines = inputSuc.split("\n");
var output = fs.createWriteStream("sarna-audit.csv", {
    encoding: "utf-8"
});

async.waterfall(
    [
        PlanetsLib.creds,
        function(creds, cb) {
            console.log("Logging in");

            client.logIn(creds.username, creds.password, function(err) {
                cb(err);
            });
        },
        function(cb) {
            async.eachLimit(inputSucLines, PARALLEL, function(line, cbEach) {
                if (!line.trim()) {
                    return cbEach();
                }

                const lineSplit = line.split("\t");

                const sucPlanet = lineSplit[PlanetsLib.COL_NAME];
                const sucX = parseFloat(lineSplit[PlanetsLib.COL_X].replace("\"", "").replace(",", ""), 10);
                const sucY = parseFloat(lineSplit[PlanetsLib.COL_Y].replace("\"", "").replace(",", ""), 10);
                const sarnaLink = lineSplit[PlanetsLib.COL_LINK];

                if (!sarnaLink) {
                    return writeResult(output, cbEach, sucPlanet, "",
                        "missing-sarna-link", sucX, sucY, "", "");
                }

                const sarnaName = sarnaLink.replace("https://www.sarna.net/wiki/", "")
                    .replace("http://www.sarna.net/wiki/", "");

                const planetNameMatch = PLANET_NAME_REGEX.exec(sucPlanet);
                if (!planetNameMatch) {
                    return cbEach(`Cannot match ${sucPlanet}`);
                }

                if (!sarnaName) {
                    return writeResult(output, cbEach, sucPlanet, sarnaName,
                        "missing", sucX, sucY, "", "");
                }

                console.log(`Checking ${sucPlanet} : ${sarnaName}...`);

                client.getArticle(sarnaName, function(err, data) {
                    // error handling
                    if (err) {
                        console.log("Missing article!");

                        return writeResult(output, cbEach, sucPlanet, sarnaName,
                            "missing", sucX, sucY, "", "");
                    }

                    // data does not contain planet-like content
                    if (!data || data.indexOf(PLANET_CHECK) === -1) {
                        if (data && data.toLowerCase().indexOf(DISAMBIGUATION) !== -1) {
                            return writeResult(output, cbEach, sucPlanet, sarnaName,
                                "disambiguation", sucX, sucY, "0", "0");
                        } else {
                            return writeResult(output, cbEach, sucPlanet, sarnaName,
                                "not-a-planet", sucX, sucY, "0", "0");
                        }
                    }

                    // Reset the global regex
                    COORD_REGEX.lastIndex = 0;

                    const coordinatesMatch = COORD_REGEX.exec(data);
                    if (!coordinatesMatch || !coordinatesMatch.length) {
                        return writeResult(output, cbEach, sucPlanet, sarnaName,
                            "no-coordinates", sucX, sucY, "0", "0");
                    }

                    const sarnaX = parseFloat(coordinatesMatch[1].trim().replace(",", ""), 10);
                    const sarnaY = parseFloat(coordinatesMatch[2].trim().replace(",", ""), 10);

                    if (sucX !== sarnaX || sucY !== sarnaY) {
                        if (roundNumber(sucX) === roundNumber(sarnaX) &&
                            roundNumber(sucX) === roundNumber(sarnaX)) {

                            console.log("\tFixing rounded-coordinates");

                            const dataUpdated = data.replace(COORD_REGEX,
                                `| coord               = ${sucX} : ${sucY}{{e}}`);

                            if (!PRETEND) {
                                client.edit(
                                    sarnaName,
                                    dataUpdated,
                                    "Updating Planet coordinates per BattleTechWiki:Project_Planets/Mapping",
                                    true,
                                    cbEach);
                            }

                            writeResult(
                                output,
                                function() {
                                    /* NOP */
                                },
                                sucPlanet,
                                sarnaName,
                                "rounded-coordinates",
                                sucX, sucY, sarnaX, sarnaY);

                            return undefined;
                        }

                        const xDiff = Math.abs(sucX - sarnaX);
                        const yDiff = Math.abs(sucY - sarnaY);

                        const diff = Math.sqrt(xDiff * xDiff + yDiff * yDiff);

                        if (diff < DIFF_THRESHOLD) {
                            console.log("\tFixing close-coordinates");

                            const dataUpdated = data.replace(COORD_REGEX,
                                `| coord               = ${sucX} : ${sucY}{{e}}`);

                            if (!PRETEND) {
                                client.edit(
                                    sarnaName,
                                    dataUpdated,
                                    "Updating Planet coordinates per BattleTechWiki:Project_Planets/Mapping",
                                    true,
                                    cbEach);
                            }

                            writeResult(
                                output,
                                function() {
                                    /* NOP */
                                },
                                sucPlanet,
                                sarnaName,
                                "close-coordinates",
                                sucX, sucY, sarnaX, sarnaY);

                            return undefined;
                        } else {
                            return writeResult(output, cbEach, sucPlanet, sarnaName,
                                "mismatched-coordinates", sucX, sucY, sarnaX, sarnaY, diff);
                        }
                    }

                    return writeResult(output, cbEach, sucPlanet, sarnaName, "ok", sucX, sucY, sarnaX, sarnaY);
                });

                return null;
            }, function(err) {
                if (err) {
                    console.error(err);
                }

                output.end();

                cb();
            });
        }
    ],
    function(err) {
        if (err) {
            console.error(err);
        }

        console.log("Complete!");
    }
);

function roundNumber(num) {
    return Math.round(num * 100) / 100;
}

function writeResult(outStream, cb, sucPlanet, sarnaName, reason, sucX, sucY, sarnaX, sarnaY, extra) {
    extra = extra || "";

    const line = `${sucPlanet},${sarnaName},${reason},${sucX},${sucY},${sarnaX},${sarnaY},${extra}`;

    outStream.write(line + "\n", "utf-8", cb);
}
