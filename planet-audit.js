"use strict";

//
// Imports
//
var fs = require("fs");
var MediaWikiBot = require("nodemw");
var async = require("async");

//
// Constants
//
var COORD_REGEX = /^\|\s*coord\s*=\s*([\d.,-]+)\s*:\s*([\d.,-]+).*/gm;
var PLANET_NAME_REGEX = /([^(]+)/;
var DIFF_THRESHOLD = 5;
var PLANET_CHECK = "{{InfoBoxSystem";
var PARALLEL = 1;
var DISAMBIGUATION = "disambiguation";

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

async.series(
    [
        function(cb) {
            console.log("Logging in");

            client.logIn("Nicjansma", "oMngY0HdUZLjErVuKP2eh8QutCH_7PtM", cb);
        },
        function(cb) {
            async.eachLimit(inputSucLines, PARALLEL, function(line, cbEach) {
                if (!line.trim()) {
                    return cbEach();
                }

                const lineSplit = line.split("\t");

                const sucPlanet = lineSplit[1];
                const sucX = parseFloat(lineSplit[3].replace("\"", "").replace(",", ""), 10);
                const sucY = parseFloat(lineSplit[4].replace("\"", "").replace(",", ""), 10);
                const sarnaLink = lineSplit[5];

                if (!sarnaLink) {
                    return writeResult(output, cbEach, sucPlanet, "",
                        "missing-sarna-link", sucX, sucY, "", "");
                }

                const sarnaName = sarnaLink.replace("https://www.sarna.net/wiki/", "").replace("http://www.sarna.net/wiki/", "");

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

                            client.edit(
                                sarnaName,
                                dataUpdated,
                                "Updating Planet coordinates per BattleTechWiki:Project_Planets/Mapping",
                                true,
                                cbEach);

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

                            client.edit(
                                sarnaName,
                                dataUpdated,
                                "Updating Planet coordinates per BattleTechWiki:Project_Planets/Mapping",
                                true,
                                cbEach);

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
