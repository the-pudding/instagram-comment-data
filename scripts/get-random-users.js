const fs = require('fs');
const d3 = require('d3');
const request = require('request');
const mkdirp = require('mkdirp');

const NUM_USERS = 10000;
const MAX_ID = 999999;
const MIN_MEDIA = 50;
const MAX_MEDIA = 2000;

const DEFAULT_DELAY = 3500;
let delayVal = DEFAULT_DELAY;

function delay(dur) {
	return new Promise(resolve => {
		setTimeout(resolve, dur);
	})
}

function getUserData(id) {
	return new Promise((resolve, reject) => {
		const url = `https://i.instagram.com/api/v1/users/${id}/info/`;
		request(url, (err, response, body) => {
			if (err) reject(err)
			else if (response.statusCode === 200) resolve(JSON.parse(body));
			else reject(response.statusCode);
		})
	});
}

async function getRandomUser(id) {
	try {
		await delay(delayVal);
		const { user } = await getUserData(id);
		const { username } = user;
		// if (username && !is_private && !is_business && media_count > MIN_MEDIA && media_count < MAX_MEDIA ) return Promise.resolve({ id, username, media_count });
		return Promise.resolve({ id, username });
		// else return Promise.reject({ id });
	} catch (err) {
		console.log({ err });
		if (err === 429) delayVal = 600000;
		return Promise.reject({ id });
	}
}

function loadFiles({fileUsers, fileNon}) {
	const existsU = fs.existsSync(fileUsers);
	let users = [];
	let non = [];

	if (existsU) users = d3.csvParse(fs.readFileSync(fileUsers, 'utf8'));
	users = users.map(d => ({...d, id: + d.id }));

	const existsN = fs.existsSync(fileNon);
	if (existsN) non = d3.csvParse(fs.readFileSync(fileNon, 'utf8'));
	non = non.map(d => ({...d, id: + d.id }));

	if (existsU && existsN) return { users, non };

	const COLUMNS = ['id', 'username'];
	fs.appendFileSync(fileUsers, `${d3.csvFormatBody([COLUMNS])}\n`); 

	const COLUMNS2 = ['id'];
	fs.appendFileSync(fileNon, `${d3.csvFormatBody([COLUMNS2])}\n`); 

	return { users, non };
}

async function init() {
	mkdirp('./output');
	const fileUsers = './output/users-v2.csv';
	const fileNon = './output/invalid-v2.csv';

	const { users, non } = loadFiles({ fileUsers, fileNon });
	
	let index = 0;
	while (users.length < NUM_USERS) {
		console.log(index, users.length);
		try {
			const id = Math.floor(Math.random() * MAX_ID);
			const userMatch = users.find(d => d && d.id === id);
			const nonMatch = non.find(d => d && d.id === id);
			if (!userMatch && !nonMatch) {
				const user = await getRandomUser(id);
				if (user) {
					users.push(user);
					const formatted = d3.csvFormatBody([user]);
					fs.appendFileSync(fileUsers, `${formatted}\n`);
					delayVal = DEFAULT_DELAY;
				}
				index += 1;
			}
		}
		catch (datum) {
			non.push(datum);
			const formatted = d3.csvFormatBody([datum]);
			fs.appendFileSync(fileNon, `${formatted}\n`);
			index += 1;
		}
	}
}
	
init();
