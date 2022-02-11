const axios 	= require('axios');
const moment 	= require('moment');
const path 		= require('path');
const PORT 		= process.env.PORT || 3000;
var lastUpdated = null;

// moment.updateLocale('en', {
//     monthsShort :  'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_')
// });

const paths = {
	'data': 'data.json',
	'stats': 'stats.json'
};

var data = {
	'dates': [],
	'states': [],
	'rtData': []
};

var stats = {
	'activeData': [],
	'confirmedData': [],
	'recoveredData': [],
	'deceasedData': [],
}

let getStates = new Promise ((resolve, reject) => {
	axios.get('https://api.covid19india.org/v2/state_district_wise.json').then(response =>{
			response.data.forEach(state=>{
			delete state['districtData'];
			state.statecode = state.statecode.toLowerCase();
			data.states.push(state);
		}, error =>{
			reject('Error!');
			console.log(error);
		});
		resolve('Success!');
		return data.states;
	});
});

let getData = new Promise ((resolve, reject) => {
	getStates.then(value => {
		axios.get('https://api.covid19india.org/states_daily.json').then(response => {
			data.info = response.data['states_daily'];
			resolve(data.info);
		}, error =>{
			console.log(error);
			reject('Error!');
		});
	}, error =>{
		console.log(error);
		reject('Error!');
	});
});

function accumulateDeltas(fetchedData, date, backDate, arr) {
	data.states.forEach(state=>{
		let delta = Number(fetchedData[state.statecode]);
		let filteredArr = arr.filter(entry=>{return entry.state === state.state});
		let prev = Number((filteredArr.length > 0) ? filteredArr.slice(-1)[0]['accumulated']: 0);
		let total = delta + prev;
		arr.push({'state': state.state, 'date': date, 'delta': delta, 'accumulated': total});
	});
}

function accumulateActiveDeltas(date, backDate, firstDate) {
	data.states.forEach(state=>{
		let confirmedEntry 	= stats.confirmedData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let recoveredEntry 	= stats.recoveredData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let deceasedEntry 	= stats.deceasedData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let delta = Number(confirmedEntry.delta) - Number(recoveredEntry.delta) - Number(deceasedEntry.delta);
		let total = Number(confirmedEntry.accumulated) - Number(recoveredEntry.accumulated) - Number(deceasedEntry.accumulated);
		let rt = 1;
		let totalForRt = 0;
		let loopDate = moment(backDate);
		while(loopDate < date){
			totalForRt += stats.confirmedData.filter(entry=> {return entry.state === state.state && entry.date.isSame(loopDate)})[0]['delta'];
			loopDate.add(1, "d");
		}
		if (date != firstDate){
			let backData = data.rtData.filter(entry=>{return entry.state === state.state && entry.date.isSame(backDate)})[0];
			rt = totalForRt / backData['accumulated'];
		}
		rt = sanitize(rt);
		stats.activeData.push({'state': state.state, 'date': date,'delta': delta, 'accumulated': total});
		data.rtData.push({'state': state.state, 'date': date, 'rt_date': backDate, 'accumulated': total, 'accumulated15': totalForRt, "rt": rt});
	});
}

function getDates() { 
	let dates = new Set();
	try{
		data.info.forEach(value=>{
			dates.add(value.date);
		});
		dates = Array.from(dates).slice(0, 300);
		return dates.map(value=> {
			return moment(value, 'DD-MMM-YY');
		});
	} catch (error){
		console.log(error);
		return null;
	}
}

function getNationwideValues(date, backDate) {
	let confirmedCount = 0;
	let deceasedCount = 0;
	let recoveredCount = 0;
	let activeCount = 0;
	let india = {
		"state": "India",
		"statecode": "in"
	}
	data.dates.forEach(date=>{
		let backDate = moment(date).subtract(15, 'd');
		backDate = (backDate > data.dates[0]) ? backDate : data.dates[0];
		let confirmedDelta = 0;
		let deceasedDelta = 0;
		let recoveredDelta = 0;
		data.states.forEach(state=>{
			confirmedDelta = confirmedDelta + Number(stats.confirmedData.filter(entry => { return entry.state == state.state && entry.date == date })[0]['delta']);
			recoveredDelta = recoveredDelta + Number(stats.recoveredData.filter(entry => { return entry.state == state.state && entry.date == date })[0]['delta']);
			deceasedDelta = deceasedDelta + Number(stats.deceasedData.filter(entry => { return entry.state == state.state && entry.date == date })[0]['delta']);
		});
		let activeDelta = confirmedDelta - deceasedDelta - recoveredDelta;
		confirmedCount += confirmedDelta;
		recoveredCount += recoveredDelta;
		deceasedCount += deceasedDelta;
		activeCount += activeDelta;
		stats.confirmedData.push({'state': india.state, 'date': date, 'delta': confirmedDelta, 'accumulated': confirmedCount});
		stats.recoveredData.push({'state': india.state, 'date': date, 'delta': recoveredDelta, 'accumulated': recoveredCount});
		stats.deceasedData.push({'state': india.state, 'date': date, 'delta': deceasedDelta, 'accumulated': deceasedCount});
		stats.activeData.push({'state': india.state, 'date': date, 'delta': activeDelta, 'accumulated': activeCount});

		let rt = 1;
		let totalForRt = 0;
		let loopDate = moment(backDate);
		while(loopDate < date){
			totalForRt += stats.confirmedData.filter(entry=> {return entry.state == india.state && entry.date.isSame(loopDate)})[0]['delta'];
			loopDate.add(1, "d");
		}
		if (date != data.dates[0]){
			let backData = data.rtData.filter(entry=>{return entry.state == india.state && entry.date.isSame(backDate)})[0];
			rt = totalForRt / backData['accumulated'];
		}
		rt = (rt != null) ? rt : 1;
		data.rtData.push({'state': india.state, 'date': date, 'rt_date': backDate, 'accumulated': activeCount, 'accumulated15': totalForRt, "rt": rt});
	});
	data.states.push(india);
}

function sanitize(value) {
	if (isNaN(value) || value === Infinity){
		return 1;
	}
	return value;
}


function getValues() {
	getData.then(value => {
		data.dates = getDates();
		lastUpdated = data.dates.slice(-1)[0];	
		let firstDate = data.dates[0];
		console.log(firstDate, lastUpdated);

		data.dates.forEach(date=>{
			let backDate = moment(date).subtract(15, 'd');
			backDate = (backDate > firstDate) ? backDate : firstDate;
			let confirmedDeltas = data.info.filter(entry=> {
				return entry.status === 'Confirmed' && entry.date === date.format('DD-MMM-YY')
			});
			let recoveredDeltas = data.info.filter(entry=> {
				return entry.status === 'Recovered' && entry.date === date.format('DD-MMM-YY')
			});
			let deceasedDeltas 	= data.info.filter(entry=> {
				return entry.status === 'Deceased' && entry.date === date.format('DD-MMM-YY')
			});
			accumulateDeltas(confirmedDeltas[0], date, backDate, stats.confirmedData);
			accumulateDeltas(recoveredDeltas[0], date, backDate, stats.recoveredData);
			accumulateDeltas(deceasedDeltas[0], date, backDate, stats.deceasedData);
			accumulateActiveDeltas(date, backDate, firstDate);
		});

		getNationwideValues();

		let fs = require('fs');
		console.log("Data last Updated at: " + moment(lastUpdated).format('DD-MMM-YYYY hh:mm A'));
		delete data.info;
		if (data.dates.length > 0){
			fs.writeFile('stats.json', JSON.stringify(stats), function(err) {
					if (err) {
						console.log('json creation failed');
						throw err;
					}
				}
			);

			fs.writeFile('data.json', JSON.stringify(data), function(err) {
					if (err) {
						console.log('json creation failed');
						throw err;
					}
				}
			);
			console.log('Json updated!');
		};
	}, error => {
		reject('Error!');
		console.log(error);
	});
}

const express = require('express');
const fs = require('fs');
const app = express();

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
	res.header("Access-Control-Allow-Headers", "*");
	next();
});

app.get('/', (req, res) => {
	fs.readFile('./index.html', function (err, html) {
		if (html) {
		res.statusCode = 200;
		res.writeHeader(200, {"Content-Type": "text/html"});
		res.write(html);
		} else {
			res.writeHeader(404, {"Content-Type": "text/html"});
			res.write("Sorry, but for some reason this data is unavailable at this moment.");
  			res.end();
		}

		console.log(req.url + " - " + req.connection.remoteAddress);
		res.end();
	});
});

app.get('/:jsonPath', (req, res) => {
	let jsonPath = req.params.jsonPath;
	if(paths[jsonPath]){
		fs.readFile(paths[jsonPath], (err, json) => {
			if (err){
				console.log('404 resolution! Json recovery started...');
				getValues();
				console.log('Next update will be in 6 hours!');
				res.writeHeader(404, {"Content-Type": "text/html"});
				res.write("Sorry, but for some reason this data is unavailable at this moment.");
				res.end();
			}else {
				let obj = JSON.parse(json);
				res.statusCode = 200;
				obj['lastUpdated'] = lastUpdated;
				res.json(obj);
			}
			console.log(req.url + " - " + req.connection.remoteAddress);
		});
	}else{
		res.writeHeader(404, {"Content-Type": "text/html"});
		res.write("Sorry, but for some reason this data is unavailable at this moment.");
		res.end();
	}
});

if (require.main === module) {
	if (! fs.existsSync(path)) {
		console.log('App restarted! Json updation initiated...');
		getValues();
		console.log('Next update will be in 6 hours!');
	}
	app.listen(PORT, () => {
		console.log(`Server ready at port ${ PORT }`);
	});
}

const CronJob = require('cron').CronJob;

var job = new CronJob('00 00 */6 * * *', function() {
	console.log('Updating Json!');
	getValues();
	console.log('Next update will be in 6 hours!');
}, null, true, 'Asia/Kolkata');
