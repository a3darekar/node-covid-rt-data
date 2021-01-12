const axios 	= require('axios');
const moment 	= require('moment');
const path 		= require('path');
const PORT 		= process.env.PORT || 3000;
const jsonPath	= 'covidData.json';

var data = {
	'dates': [],
	'states': [],
	'activeData': [],
	'rtData': [],
	'confirmedData': [],
	'recoveredData': [],
	'deceasedData': [],
	'lastUpdated': null
};

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
		let delta = 0
		console.log(fetchedData)
		if (fetchedData) {
			delta = Number(fetchedData[state.statecode]);
		}
		let filteredArr = arr.filter(entry=>{return entry.state === state.state});
		let prev = Number((filteredArr.length > 0) ? filteredArr.slice(-1)[0]['accumulated']: 0);
		let total = delta + prev;
		arr.push({'state': state.state, 'date': date, 'delta': delta, 'accumulated': total});
	});
}

function accumulateActiveDeltas(date, backDate, firstDate) {
	data.states.forEach(state=>{
		let confirmedEntry 	= data.confirmedData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let recoveredEntry 	= data.recoveredData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let deceasedEntry 	= data.deceasedData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let delta = Number(confirmedEntry.delta) - Number(recoveredEntry.delta) - Number(deceasedEntry.delta);
		let total = Number(confirmedEntry.accumulated) - Number(recoveredEntry.accumulated) - Number(deceasedEntry.accumulated);
		let rt = 1;
		let totalForRt = 0;
		let loopDate = moment(backDate);
		while(loopDate < date){
			totalForRt += data.confirmedData.filter(entry=> {return entry.state === state.state && entry.date.isSame(loopDate)})[0]['delta'];
			loopDate.add(1, "d");
		}
		if (date != firstDate){
			let backData = data.rtData.filter(entry=>{return entry.state === state.state && entry.date.isSame(backDate)})[0];
			rt = totalForRt / backData['accumulated'];
		}
		rt = (rt != null) ? rt : 1;
		data.activeData.push({'state': state.state, 'date': date,'delta': delta, 'accumulated': total});
		data.rtData.push({'state': state.state, 'date': date, 'rt_date': backDate, 'accumulated': total, 'accumulated15': totalForRt, "rt": rt});
	});
}

function getDates() { 
	let dates = new Set();
	try{
		data.info.forEach(value=>{
			dates.add(value.date);
		});
		dates = Array.from(dates);
		return dates.map(value=> {return moment(value, 'DD-MMM-YY')});
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
			confirmedDelta = confirmedDelta + Number(data.confirmedData.filter(entry => { return entry.state == state.state && entry.date == date })[0]['delta']);
			recoveredDelta = recoveredDelta + Number(data.recoveredData.filter(entry => { return entry.state == state.state && entry.date == date })[0]['delta']);
			deceasedDelta = deceasedDelta + Number(data.deceasedData.filter(entry => { return entry.state == state.state && entry.date == date })[0]['delta']);
		});
		let activeDelta = confirmedDelta - deceasedDelta - recoveredDelta;
		confirmedCount += confirmedDelta;
		recoveredCount += recoveredDelta;
		deceasedCount += deceasedDelta;
		activeCount += activeDelta;
		data.confirmedData.push({'state': india.state, 'date': date, 'delta': confirmedDelta, 'accumulated': confirmedCount});
		data.recoveredData.push({'state': india.state, 'date': date, 'delta': recoveredDelta, 'accumulated': recoveredCount});
		data.deceasedData.push({'state': india.state, 'date': date, 'delta': deceasedDelta, 'accumulated': deceasedCount});
		data.activeData.push({'state': india.state, 'date': date, 'delta': activeDelta, 'accumulated': activeCount});

		let rt = 1;
		let totalForRt = 0;
		let loopDate = moment(backDate);
		while(loopDate < date){
			totalForRt += data.confirmedData.filter(entry=> {return entry.state == india.state && entry.date.isSame(loopDate)})[0]['delta'];
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


function getValues() {
	getData.then(value => {
		data.dates = getDates();
		let firstDate = data.dates[0];
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
			accumulateDeltas(confirmedDeltas[0], date, backDate, data.confirmedData);
			accumulateDeltas(recoveredDeltas[0], date, backDate, data.recoveredData);
			accumulateDeltas(deceasedDeltas[0], date, backDate, data.deceasedData);
			accumulateActiveDeltas(date, backDate, firstDate);
			data.lastUpdated = moment();
		});

		getNationwideValues();

		let fs = require('fs');
		console.log("Data last Updated at: " + moment(data.lastUpdated).format('DD-MMM-YYYY hh:mm A'));
		if (data.dates.length > 0){
			fs.writeFile (jsonPath, JSON.stringify(data), function(err) {
					if (err) {
						console.log('json creation failed');
						throw err;
					}
					console.log('Json updated!');
				}
			);
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

app.get('/json', (req, res) => {
	fs.readFile(jsonPath, (err, json) => {
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
			res.json(obj);
		}
		console.log(req.url + " - " + req.connection.remoteAddress);
	});
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
