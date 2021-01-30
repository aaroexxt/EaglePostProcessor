//postProcV1.js by Aaron Becker
//Proudly written between 3-6am on Aug 3, 2020 and later updated Aug 19

const fs = require('fs');
//const parse = require('csv-parse');
const path = require('path');
const inquirer = require('inquirer');
const { resolve } = require('path');
const { readdir } = require('fs').promises;

/*
TODOS:
- fix issues with tab spacing in simplified file
- add check that only displays eagle projects with valid CSV files
- remove spaces when checking for matches
- cut names/descriptions to certain max chars to make everything fit
*/


/*
DATA STUFF
*/
const basePath = "/Users/Aaron/Documents/EAGLE/projects"; //"C:/Users/Aaron/OneDrive/Documents/EAGLE/projects";
const outFileNameSimple = "BOMconcatSimple.txt";
const outFileNameRaw = "BOMconcatRaw.txt";
const skipFirstLine = true; //skip first line in CSV (it only has a header)
let concMode = true; //true = add to BOM, false = subtract from BOM

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
						qty: ((concMode)?1:-1)*Number(output[i][0])*boardCount, //could be a "negative" quantity if it's being subtracted. Although these will always be pruned out before printing
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
						//Generate final lists from parts
						prune();
						processedComponents = formatComponentList();
						processedProjects = formatProjectList();
						processedProjects.push(""); //add attl \n before components
						finalBOM = processedProjects.concat(processedComponents);

						for (let i=0; i<finalBOM.length; i++) {
							console.log(finalBOM[i]);
						}
					} else if (choice == choices[2]) {
						//Generate final lists from parts
						prune();
						processedComponents = formatComponentList();
						processedProjects = formatProjectList();
						processedProjects.push(""); //add attl \n before components
						finalBOM = processedProjects.concat(processedComponents);

						console.log("Writing to "+outFileNameRaw+"and"+outFileNameSimple+" in "+basePath);
						fs.writeFile(path.join(basePath,outFileNameRaw), JSON.stringify(finalBOM, null, 4), function(err) {
							if (err) {
								console.error("Error writing file: "+err);
							} else {
								console.log("Writing file raw OK");
							}
						})
						fs.writeFile(path.join(basePath,outFileNameSimple), finalBOM.join("\n"), function(err) {
							if (err) {
								console.error("Error writing file: "+err);
							} else {
								console.log("Writing file simple OK");
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

//ONLY run this at the end (before exporting final list to terminal or file) otherwise component values will get messed up and your BOM won't be right :()
function prune() {
	let newComps = [];
	let pruneCount = 0;
	const oLen = components.length; //set to initial length
	for (let i=0; i<components.length; i++) {
		if (components[i].qty <= 0) {
			pruneCount++;
		} else {
			newComps.push(components[i]);
		}
	}
	components = newComps;
	console.log("Pruned "+pruneCount+" component items out of an initial "+oLen);
}

//Adds tab/spacing to component list and returns
function formatComponentList() {
	let processedComponents = ["----- Components in BOM -----"];
	if (components.length == 0) {
		processedComponents.push("<<BOM EMPTY>>");
		return processedComponents;
	}
	let interm = Object.keys(components[0]).map(item => {return item[0].toUpperCase()+item.substring(1)}); //Add header
	let addstr = "";
	for (let i=0; i<interm.length; i++) {
		addstr+=interm[i]+getTabs(i);
	}
	processedComponents.push(addstr);

	for (let i=0; i<components.length; i++) {
		let str = "";
		let keys = Object.keys(components[i]);
		for (let j=0; j<keys.length; j++) {
			str+=components[i][keys[j]]+getTabs(j);
		}
		processedComponents.push(str);
	}
	return processedComponents;
}
function getTabs(loop) {
	if (loop == 0) {
		return "\t";
	} else if (loop == 1) {
		return "\t\t\t\t\t\t\t";
	} else if (loop == 2) {
		return "\t\t\t\t\t";
	} else {
		return "\t\t";
	}
}

function formatProjectList() {
	let processedProjects = ["----- Projects in BOM -----"];
	for (let i=0; i<projects.length; i++) {
		processedProjects.push(projects[i].qty+"x "+projects[i].name);
	}
	return processedProjects;
}


/*
IMPORTANT RUNTIME VARIABLES; keeps track of component list and project origins
*/

var projects = [];
var components = [];

const packageReplaceRules = [
["C0805","0805"],
["R0805","0805"],
["C0603","0603"],
["R0603","0603"],
["SMD",""],
["SML",""],
["CLOSEDWIRE_",""]
];

const nameReplaceRules = [
["R-US_","Resistor"],
["C-US","Capacitor"],
["CPOL-US","Polarized Capacitor"],
["INDUCTOR","Inductor"],
["CONN_",""],
["CON_",""],
["SMD",""]
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
		inquirer.prompt([{
			type: "list",
			name: "addMode",
			message: "Remove from or add to BOM?",
			choices: ["Remove","Add"],
			default: "Add"
		}]).then(modeSel => {
			concMode = modeSel.addMode=="Add"?true:false;

			let keys = Object.keys(choice);
			choice = choice[keys[0]];

			inquirer.prompt([{
				name: "How many of this project do you want to "+((concMode)?"make":"remove")+"?",
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
							break;
						case 1:
							//Push to project count
							projects.push({
								path: choice,
								name: csvs[0].substring(csvs[0].lastIndexOf("\\")).substring(1).split(".csv")[0], //Do NOT ask about this line either, prolly only works on windows and its jank
								qty: boardCount*((concMode)?1:-1)
							});

							processCSV(csvs[0], boardCount);
							break;
						default:
							inquirer.prompt({
								name: "Pick a CSV file",
								type: "list",
								choices: csvs
							}).then(csvchoice => {
								let keys = Object.keys(csvchoice);
								//Push to project count
								projects.push({
									path: choice,
									name: csvchoice[keys[0]].substring(csvchoice[keys[0]].lastIndexOf("\\")).substring(1).split(".csv")[0], //Do NOT ask about this line either, prolly only works on windows and its jank
									qty: boardCount*((concMode)?1:-1)
								});
								processCSV(csvchoice[keys[0]], boardCount);
							}).catch(err => {
								console.error(err);
							});
							break;
					}
				});
			}).catch(err => {
				console.error(err);
			});
		})

		
	}).catch(err => {
		console.error(err)
	});
}
main();