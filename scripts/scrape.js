const Instamancer = require('instamancer');
const fs = require('fs');
const d3 = require('d3');
const mkdirp = require('mkdirp');
const knox = require('knox');
const request = require('request');

const USER_DATA = d3.csvParse(fs.readFileSync(`./output/users-v2.csv`, 'utf8'));
const PATH_OUT = './output/user-comments';

const AWS_KEY = process.env.AWS_KEY;
const AWS_SECRET = process.env.AWS_SECRET;
const AWS_BUCKET = process.env.AWS_BUCKET;
const PUDDING_PATH = 'instagram-comments';
const LOCAL = process.env.LOCAL === 'true';

const NOW = Date.now();
const YEAR = 31536000000;

let zeroStreak = 0;

const client = knox.createClient({
	key: AWS_KEY,
	secret: AWS_SECRET,
	bucket: AWS_BUCKET
});

const OPTIONS = {
	total: 0,
	headless: true,
	fullAPI: true,
	silent: true,
	sleepTime: 3,
}

function uploadToS3({ data, id }) {
	return new Promise((resolve, reject) => {
		// const string = JSON.stringify({ data, updated });
		const string = d3.csvFormat(data);
		const req = client.put(`${PUDDING_PATH}/${id}.csv`, {
			'Content-Length': Buffer.byteLength(string),
			'Content-Type': 'text/csv'
		});

		req.on('response', res => {
			if (res.statusCode === 200) {
				console.log('saved to %s', req.url);
				resolve();
			}
			else reject(id);
		});

		req.end(string);
	});
}

function getComments({ edges = [], shortcode, id }) {
	const comments = edges.map(({ node }) => {
		const { text, created_at, owner } = node;
		const clean = text.trim().replace(/\r?\n|\r/g, ' ');
		return { shortcode, created_at, text: clean, id: owner.id };
	}).filter(d => d.id !== id);

	comments.forEach(d => delete d.id);
	return comments;
}

async function getPosts({ id, username }) {
	console.log(`starting scrape for ${id}`);
	return new Promise(async (resolve, reject) => {
		let aborted = false;
		let instaHash = Instamancer.user(username, OPTIONS);
		
		// const t = setTimeout(() => {
		// 	aborted = true;
		// 	instaHash = null;
		// 	reject(id);
		// }, +media_count * 2000);

		const output = [];
		let i = 0;
		let prevI = 0;
		let stuckCount = 0;
		const t = setInterval(() => {
			const years = output.length ? (NOW - output[output.length - 1].created_at * 1000) / YEAR : 0;
			console.log({ years })
			if (i !== prevI) {
				stuckCount = 0;
				prevI = i;
			} else stuckCount += 1;

			if (stuckCount >= 20) {
				clearInterval(t);
				aborted = true;
				instaHash = null;
				console.log(`aborting ${id}`);
				reject(id);
			} else if (i >= 1200) wrap(true);
			else if (years >= 7) wrap(true)
			else if (stuckCount === 3 && output.length === 0) wrap(true);

			console.log(`${output.length} comments`);
		}, 30000);

		const wrap = (rej) => {
			clearInterval(t);
			console.log(`comment count for ${id}: ${output.length}`);
			if (output.length === 0) zeroStreak += 1;
			else zeroStreak = 0;
			if (zeroStreak > 2) {
				console.log('zeroStreak');
				process.exit(1);
			}
			const cb = rej ? reject : resolve; 
			uploadToS3({ data: output, id }).then(cb).catch(reject);
		}

		for await (const post of instaHash) {
			// if (i % 100 === 0) console.log(i);
			// printProgress(i);
			const { shortcode, edge_media_to_parent_comment, owner } = post.shortcode_media;
			const { id } = owner;
			if (edge_media_to_parent_comment) {
				const { edges } = edge_media_to_parent_comment;
				const top = getComments({ edges, shortcode, id });
				const nested = edges.map(({ node }) => {
					const threadEdges = node.edge_threaded_comments ? node.edge_threaded_comments.edges : [];
					return getComments({ edges: threadEdges, shortcode, id });
				}).filter(d => d.length);
				const all = top.concat(...nested);
				const clean = all.filter(d => d && d.text);
				output.push(...clean);
			}
			i += 1;
		}

		if (!aborted) {
			// clearTimeout(t);
			clearInterval(t);
			console.log(`comment count for ${id}: ${output.length}`);
			if (output.length === 0) zeroStreak += 1;
			else zeroStreak = 0;
			if (zeroStreak > 2) {
				console.log('zeroStreak');
				process.exit(1);
			}
			uploadToS3({ data: output, id }).then(resolve).catch(reject);
		}
	});
}

function checkExists({ id }) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(reject, 5000);
		const url = `https://pudding-data-processing.s3.amazonaws.com/instagram-comments/${id}.csv`;
		request(url, (err, resp) => {
			console.log(id, resp.statusCode);
			clearTimeout(t);
			if (err) reject();
			else resolve(resp.statusCode === 200);
		})
	});
}

function redo(id) {
	return new Promise((resolve, reject) => {
		const url = `https://pudding-data-processing.s3.amazonaws.com/instagram-comments/redo.csv`;
		const r = request(url);
		r.on('response', response => {
			r.abort();
			let data = null;
			if (response.statusCode === 200) {
				data = d3.csvParse(response.body);
				data.push({ id });	
			} else {
				data = [{ id }];
			}
			uploadToS3({ data, id: 'redo' }).then(resolve).catch(reject);
		});

		r.on('error', reject);
	});
}

function delay(dur) {
	return new Promise((resolve) => {
		setTimeout(resolve, dur);
	});
}

async function init() {
	mkdirp(PATH_OUT);

	const blacklist = ['jessrice13', 'dv5tin'];

	if (LOCAL) {
		console.log('flip');
		USER_DATA.reverse();
	}

	for (s of USER_DATA.filter(d => !blacklist.includes(d.username))) {
		const exists = await checkExists(s);
		if (!exists) {
			try {
				await getPosts(s);
			} catch (id) {
				process.exit(1);
				// await redo(id);
				// await delay(20000);
			}
		}
	}
}

init();

