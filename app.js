const axios = require('axios');
const moment = require('moment');
const PORT = process.env.PORT || 5000;

var data = {
	'dates': [],
	'states': [],
	'activeData': [],
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
		let delta = Number(fetchedData[state.statecode]);
		let filteredArr = arr.filter(entry=>{return entry.state === state.state});
		let prev = Number((filteredArr.length > 0) ? filteredArr.slice(-1)[0]['accumulated']: 0);
		let total = delta + prev;
		arr.push({'state': state.state, 'date': date, 'delta': delta, 'accumulated': total});
	});
}

function accumulateActiveDeltas(date, backDate) {
	data.states.forEach(state=>{
		let confirmedEntry 	= data.confirmedData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let recoveredEntry 	= data.recoveredData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let deceasedEntry 	= data.deceasedData.filter(entry=> {return entry.state === state.state && entry.date === date})[0];
		let delta = Number(confirmedEntry.delta) - Number(recoveredEntry.delta) - Number(deceasedEntry.delta);
		let total = Number(confirmedEntry.accumulated) - Number(recoveredEntry.accumulated) - Number(deceasedEntry.accumulated);
		let rt = 1;
		if (! date.isSame(backDate)){
			let backData = data.activeData.filter(entry=>{return entry.state === state.state && entry.date.isSame(backDate)});
			rt = total / backData[0].accumulated;
		}
		data.activeData.push({'state': state.state, 'date': date, 'rt_date': backDate, 'delta': delta, 'accumulated': total, "rt": rt});
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
			accumulateActiveDeltas(date, backDate);
			data.lastUpdated = moment();
		});

		
		let fs = require('fs');
		if (data.dates.length > 0){
			fs.writeFile ('stateData.json', JSON.stringify(data), function(err) {
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
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/plain');
	res.send('node script to periodically compile and serve covid-19 data from api.covid19india.org for the vue app: vue-covid-rt-stats. Use "/json" to see the latest data. ');
});

app.get('/json', (req, res) => {
	fs.readFile('stateData.json', (err, json) => {
		let obj = JSON.parse(json);
		res.json(obj);
		console.log(req.url + " - " + req.connection.remoteAddress);
	});
});

if (require.main === module) {
	getValues();
	app.listen(PORT, () => {
		console.log(`Server ready at port ${ PORT }`);
	});
}

const CronJob = require('cron').CronJob;

var job = new CronJob('00 00 00 * * *', function() {
	console.log('Updating Json!');
	getValues();
	console.log('Next update will be at tomorrow midnight!');
}, null, true, 'Asia/Kolkata');
