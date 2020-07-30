const fs = require('fs');
//const parse = require('csv-parse');
const path = require('path');
const inquirer = require('inquirer');
const { resolve } = require('path');
const { readdir } = require('fs').promises;

/*
DATA STUFF
*/
const basePath = "C:/Users/Aaron/OneDrive/Documents/EAGLE/projects";
const outFileName = "BOMconcat.txt";
const skipFirstLine = true; //skip first line in CSV (it only has a header)

//Check folder
console.log("1/7: reading base folder");
let potentialDirs = fs.readdirSync(basePath);
let dirs = [];
console.log("2/7: identifying directories")
for (let i=0; i<potentialDirs.length; i++) {
	let fullPath = path.join(basePath,potentialDirs[i]);
	if (fs.lstatSync(fullPath).isDirectory()) {
		dirs.push(fullPath)
	}
}

if (dirs.length == 0) {
	console.log("Err no project directory found");
	process.exit(1);
}

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

function jankParse(data, opts, callback) { //lmao did I rly just write a CSV parser in about 7 minutes that only processes the first 4 elements? wow what a jank hack. bet it has a lot of bugs lol lets speedrun this boi
	let split = data.split("\r\n");
	
	let procRet = [];
	for (let b=0; b<split.length; b++) {
		let elemProps = [];
		let elemBuffer = "";
		let elemsParsedCount = 4;
		for (let c=0; c<split[b].length; c++) {
			if (elemsParsedCount <= 0) {
				break;
			}
			if (split[b][c] == (opts.delimiter||";")) {
				elemProps.push(elemBuffer.replace(new RegExp("\"", 'g'), ""));
				elemBuffer = "";
				elemsParsedCount--;
			} else {
				elemBuffer+=split[b][c];
			}
		}

		procRet.push(elemProps);
	}

	procRet.splice(-1,1); //remove last element dont ask why
	return callback(false,procRet);
}

const processCSV = function(csvPath, boardCount) {
	return new Promise((resolve, reject) => {
		console.log("CSV chosen: "+csvPath);
	
		console.log("5/7: reading csv");
		let csvData = fs.readFileSync(csvPath, {encoding:'utf8', flag:'r'});
		console.log("6/7: parsing csv");
		jankParse(csvData, {delimiter: ";"}, function(err, output) {
			if (err) {
				console.error("Error parsing CSV: "+err);
			} else {
				console.log("7/7: filtering csv")
				for (let i = (skipFirstLine)?1:0; i<output.length; i++) { //Skip first line if flag is set
					var name = output[i][2];
					var package = output[i][3];
					if (name == package) {
						package = "unknown";
					} else {
						name = name.replace(new RegExp(package, 'g'), "");
					}

					//filter name and package by rules
					for (let j=0; j<packageReplaceRules.length; j++) {
						if (package.indexOf(packageReplaceRules[j][0]) > -1) {
							package = package.replace(new RegExp(packageReplaceRules[j][0], 'g'), packageReplaceRules[j][1]);
						}
					}

					for (let j=0; j<nameReplaceRules.length; j++) {
						if (name.indexOf(nameReplaceRules[j][0]) > -1) {
							name = name.replace(new RegExp(nameReplaceRules[j][0], 'g'), nameReplaceRules[j][1]);
						}
					}
					//name = name[0].toUpperCase()+name.substring(1).toLowerCase(); //title case name

					//Create new component as object
					let cObject = {
						qty: Number(output[i][0])*boardCount,
						value: output[i][1],
						name: name,
						package: package
					};

					//Check if it exists
					let fullMatch = false;
					for (let j=0; j<components.length; j++) {
						let cpKeys = Object.keys(components[j]);
						let cKeys = Object.keys(cObject);
						let commonKeys = []; //only check keys that are the same (in case csvs have different formats for some reason idk y)
						for (let z = 0; z<cpKeys.length; z++) {
							if (cKeys.indexOf(cpKeys[z]) > -1 && ignoreKeys.indexOf(cpKeys[z]) < 0) {
								commonKeys.push(cpKeys[z]);
							}
						}

						let partialMatch = true; 
						for (let z=0; z<commonKeys.length; z++) { //only compare common keys
							if (cObject[commonKeys[z]] != components[j][commonKeys[z]]) {
								partialMatch = false;
								break;
							}
						}

						if (partialMatch) { //if it's still a partial match, that means that the components matched exactly
							components[j]["qty"] += Number(cObject["qty"]); //add the quantity to the component in existing db
							fullMatch = true;
						}
					}

					if (!fullMatch) {
						components.push(cObject);
					}
				}
				console.log("Processing CSV ok");


				let choices = ["Add another CSV", "Dump to terminal", "Dump to file"];
				inquirer.prompt({
					name: "Next action",
					type: "list",
					choices: choices
				}).then(choice => {
					let keys = Object.keys(choice);
					choice = choice[keys[0]];

					if (choice == choices[0]) {
						main(); //go back to main
					} else if (choice == choices[1]) {
						console.log(JSON.stringify(components, null, 4));
					} else if (choice == choices[2]) {
						console.log("Writing to "+outFileName+" in "+basePath);
						fs.writeFile(path.join(basePath,outFileName), JSON.stringify(components, null, 4), function(err) {
							if (err) {
								console.error("Error writing file: "+err);
							} else {
								console.log("Writing file OK");
							}
						})
					}
				}).catch(err => {
					console.error(err);
				});
			}
		})
	})
}


let components = [];

const packageReplaceRules = [
["C0805","0805"],
["R0805","0805"],
["C0603","0603"],
["R0603","0603"],
["SMD",""],
["SML",""]
];

const nameReplaceRules = [
["R-US_","Resistor"],
["C-US","Capacitor"],
["CPOL-US","Polarized Capacitor"],
["INDUCTOR","Inductor"]
]

const ignoreKeys = [
"qty"
]


function main() {
	inquirer.prompt({
		name: "Pick an Eagle Project",
		type: "list",
		choices: dirs
	}).then(choice => {
		let keys = Object.keys(choice);
		choice = choice[keys[0]];

		inquirer.prompt([{
			name: "How many of this project do you want to make?",
			default: 1,
			type: "number",
		}]).then(boardCount => {
			let keys = Object.keys(boardCount);
			boardCount = Number(boardCount[keys[0]]);
			if (isNaN(boardCount) || boardCount < 1) {
				console.error("Board count invalid");
				process.exit(1);
			}

			console.log("3/7: reading files");
			getFiles(choice).then(files => {
				console.log("4/7: finding csvs");
				let csvs = [];
				for (let i=0; i<files.length; i++) {
					if (files[i].toLowerCase().indexOf(".csv") > -1) {
						csvs.push(files[i]);
					}
				}

				switch (csvs.length) {
					case 0:
						console.error("CSV length 0, no csv found!");
						return reject();
						break;
					case 1:
						processCSV(csvs[0], boardCount);
						break;
					default:
						inquirer.prompt({
							name: "Pick a CSV file",
							type: "list",
							choices: csvs
						}).then(choice => {
							let keys = Object.keys(choice);
							processCSV(choice[keys[0]], boardCount);
						}).catch(err => {
							console.error(err);
						});
						break;
				}
			});
		}).catch(err => {
			console.error(err);
		});
	}).catch(err => {
		console.error(err)
	});
}
main();