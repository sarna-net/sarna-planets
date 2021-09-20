"use strict";

//
// Imports
//
const MediaWikiBot = require("nodemw");
const async = require("async");
const PlanetsLib = require("./planets-lib");
const fs = require("fs");
const path = require("path");

//
// Constants
//
const IMAGE_REGEX = /^\|\s*image\s*=.*\n/m;
const CAPTION_REGEX = /^\|\s*caption\s*=.*\n/m;
const PARALLEL = 1;
const PRETEND = false;
const SUC_YEAR = 3151;
const IMAGES_VERSION = "1.1.2";
const SKIP_IMAGE_CHECK = true;
const FORCE_COMMENT_EDIT = false;
const REDIRECT_TEXT = /#REDIRECT \[\[(.*)\]\]/;

//
// Command-Line
//
var onlySystem;
if (process.argv.length >= 3) {
    onlySystem = process.argv[2];
    console.log(`Limiting to ${onlySystem}.`);
}

//
// App
//

async.waterfall(
    [
        PlanetsLib.creds,
        //
        // Read planets file
        //
        function(creds, cb) {
            PlanetsLib.read(onlySystem, function(err, systems, filteredSystems) {
                cb(err, creds, systems, filteredSystems);
            });
        },
        //
        // Login
        //
        function(creds, systems, filteredSystems, cb) {
            console.log("Logging in...");

            // start MediaWikiBot with configuration
            var client = new MediaWikiBot("config.json");

            // login
            client.logIn(creds.username, creds.password, function(err) {
                cb(err, systems, filteredSystems, client);
            });
        },
        //
        // Ensure all images exist locally
        //
        function(systems, filteredSystems, client, cb) {
            console.log("Ensuring images exist locally...");

            async.eachLimit(filteredSystems, PARALLEL, function(system, cbEach) {
                if (system.sarna.indexOf("%") !== -1) {
                    // sarna link already is encoded, switch back to Unicode version for the real file
                    system.imageName = `${decodeURIComponent(system.sarna)}_${SUC_YEAR}.svg`;

                    // encoded version should be what we have on disk
                    system.svgFileName = path.join(
                        __dirname,
                        "planet-images",
                        IMAGES_VERSION,
                        SUC_YEAR.toString(),
                        system.imageName);
                } else {
                    // sarna link is no encoded, use as-is
                    system.imageName = `${system.sarna}_${SUC_YEAR}.svg`;

                    // might need to encode for the disk version
                    system.svgFileName = path.join(
                        __dirname,
                        "planet-images",
                        IMAGES_VERSION,
                        SUC_YEAR.toString(),
                        encodeURIComponent(system.imageName));
                }

                fs.access(system.svgFileName, fs.constants.R_OK, function(err) {
                    if (err) {
                        console.error(`Error with ${system.svgFileName}:`);
                        console.error(err);
                    }

                    return cbEach(err);
                });
            }, function(err) {
                cb(err, systems, filteredSystems, client);
            });
        },
        //
        // Read all files in
        //
        function(systems, filteredSystems, client, cb) {
            console.log("Reading images in...");

            async.eachLimit(filteredSystems, PARALLEL, function(system, cbEach) {
                fs.readFile(system.svgFileName, function(err, data) {
                    if (err) {
                        console.error(`Error reading ${system.svgFileName}:`);
                        console.error(err);
                    }

                    system.svgFileData = data;

                    return cbEach(err);
                });
            }, function(err) {
                cb(err, systems, filteredSystems, client);
            });
        },
        //
        // Ensure remote images exist, or upload
        //
        function(systems, filteredSystems, client, cb) {
            console.log(`Uploading ${filteredSystems.length} systems's images...`);

            async.eachLimit(filteredSystems, PARALLEL, function(system, cbEach) {
                const mwFileName = `File:${system.imageName}`;
                const imageVersionMeta = `<info:version>${IMAGES_VERSION}</info:version>`;

                if (SKIP_IMAGE_CHECK) {
                    console.log(`\t${system.imageName} skipping image check`);
                    return cbEach();
                }

                client.getImageInfo(mwFileName, function(err, imageinfo) {
                    if (!imageinfo) {
                        console.log(`\t${system.imageName} is missing, uploading`);
                    } else if (imageinfo &&
                        imageinfo.exif &&
                        imageinfo.exif.metadata.indexOf(imageVersionMeta) === -1) {
                        console.log(`\t${system.imageName} is older version, uploading`);
                    } else if (FORCE_COMMENT_EDIT) {
                        // forcing an update to edit comments
                        console.log(`\t${system.imageName} forcing a comment update`);
                    } else {
                        console.log(`\t${system.imageName} already exists`);

                        // skip to next step
                        return cbEach(err);
                    }

                    const imageComment = `${system.name} neighboring systems (${SUC_YEAR}) (v${IMAGES_VERSION})`;

                    // image missing, upload
                    return client.upload(
                        system.imageName,
                        system.svgFileData,
                        imageComment,
                        function(err2) {
                            if (err2) {
                                return cbEach(err2);
                            }

                            const imageDescr = imageComment + "\n\n"
                                + "([[BattleTechWiki:Map Legend|Map Legend]])" + "\n\n"
                                + "[[Category:System Maps]]";

                            return client.edit(
                                mwFileName,
                                imageDescr,
                                "Updating Planet image description per BattleTechWiki:Project_Planets/Mapping",
                                true,
                                cbEach);
                        });
                });

                return null;
            },
            function(err) {
                if (err) {
                    console.error(err);
                }

                cb(err, systems, filteredSystems, client);
            });
        },
        function(systems, filteredSystems, client, cb) {
            console.log(`Updating ${filteredSystems.length} systems...`);

            async.eachLimit(filteredSystems, PARALLEL, function(system, cbEach) {
                console.log(`Checking ${system.name}: https://www.sarna.net/wiki/${system.sarna}`);

                updateSystem(client, system, systems, cbEach);

                return null;
            }, function(err) {
                if (err) {
                    console.error(err);
                }

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

function updateSystem(client, system, systems, callback) {
    client.getArticle(system.sarna, function(err, data) {
        // error handling
        if (err) {
            return callback("Missing article!");
        }

        var redirectTest = REDIRECT_TEXT.exec(data);
        if (redirectTest && redirectTest.length) {
            // redirect detected, follow it
            var before = system.sarna;
            system.sarna = redirectTest[1].replace(" ", "_");

            console.log(`  Redirect from ${before} to ${system.sarna}`);

            return updateSystem(client, system, systems, callback);
        }

        //
        // Image
        //
        IMAGE_REGEX.lastIndex = 0;

        const imageMatch = IMAGE_REGEX.exec(data);
        if (!imageMatch || !imageMatch.length) {
            return callback("Could not find an image");
        }

        let dataUpdated = data.replace(IMAGE_REGEX,
            `| image               = ${system.imageName}\n`);

        //
        // Caption
        //
        CAPTION_REGEX.lastIndex = 0;

        const captionMatch = CAPTION_REGEX.exec(data);
        if (!captionMatch || !captionMatch.length) {
            return callback("Could not find a caption");
        }

        dataUpdated = dataUpdated.replace(CAPTION_REGEX,
            `| caption             = ${system.name} [[#Nearby_Systems|nearby systems]]\n`);

        PlanetsLib.diff(data, dataUpdated);

        if (!PRETEND) {
            return client.edit(
                system.sarna,
                dataUpdated,
                "Updating Planet coordinates per BattleTechWiki:Project_Planets/Mapping",
                true,
                callback);
        } else {
            return callback();
        }
    });
}
