"use strict";

//
// Imports
//
const async = require("async");
const PlanetsLib = require("./planets-lib");

//
// Command-Line
//
if (process.argv.length < 3) {
    console.log("Usage: node planet-affected-list.js [planet] [max distance / 60 default]");
}

let targetSystem = process.argv[2];
let maxDistance = process.argv[3] || 60;

//
// App
//

async.waterfall(
    [
        function(cb) {
            PlanetsLib.read(undefined, function(err, allSystems) {
                cb(err, allSystems);
            });
        },
        function(allSystems, cb) {
            console.log(`Checking ${targetSystem} against ${allSystems.length} systems...`);

            checkSystem(targetSystem, allSystems);

            cb();
        }
    ],
    function(err) {
        if (err) {
            console.error(err);
        }
    }
);

function checkSystem(target, allSystems) {
    var targetSystemData = allSystems.find(s => s.name === targetSystem);

    // find other systems
    var systemsDiff = allSystems.map(s => {
        var dx = Math.abs(s.x - targetSystemData.x);
        var dy = Math.abs(s.y - targetSystemData.y);

        return {
            name: s.name,
            dist: Math.sqrt(dx * dx + dy * dy),
            sarna: s.sarna
        };
    });

    // sort by distance
    systemsDiff.sort((a, b) => {
        return a.dist - b.dist;
    });

    // see how many are only 60ly or less
    var systemsNearby = systemsDiff.filter(s =>
        s.dist <= maxDistance &&
        s.name !== targetSystemData.name);

    console.log(`${systemsNearby.length} systems found at ${maxDistance} ly:`);
    console.log();
    console.log(systemsNearby.map(s => s.name).join("\n"));
}
