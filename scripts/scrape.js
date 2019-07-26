const Instamancer = require('instamancer');
const fs = require('fs');
const d3 = require('d3');
const mkdirp = require('mkdirp');
const knox = require('knox');

const USER_DATA = d3.csvParse(fs.readFileSync('./input/users--1-5000.csv', 'utf8'));
const PATH_OUT = './output/user-comments';

const AWS_KEY = process.env.AWS_KEY;
const AWS_SECRET = process.env.AWS_SECRET;
const AWS_BUCKET = process.env.AWS_BUCKET;
const PUDDING_PATH = 'instagram-comments';

const client = knox.createClient({
	key: AWS_KEY,
	secret: AWS_SECRET,
	bucket: AWS_BUCKET
});

const OPTIONS = {
	total: 0,
	headless: true,
	fullAPI: true,
	// silent: true,
}

function uploadToS3({ data, id }) {
	// const string = JSON.stringify({ data, updated });
	const string = d3.csvFormat(data);
	const req = client.put(`${PUDDING_PATH}/${id}.csv`, {
		'Content-Length': Buffer.byteLength(string),
		'Content-Type': 'text/csv'
	});

	req.on('response', res => {
		if (res.statusCode === 200) console.log('saved to %s', req.url);
	});

	req.end(string);
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
	// const fileOut = `${PATH_OUT}/${id}.csv`;
	const instaHash = Instamancer.user(username, OPTIONS);

	// fs.appendFileSync(fileOut, `${d3.csvFormatBody([COLUMNS])}\n`);
	const output = [];

	for await (const post of instaHash) {
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
			// clean.forEach(c => {
			// 	const formatted = d3.csvFormatBody([c]);
			// 	const chunk = `${formatted}\n`;
			// 	fs.appendFileSync(fileOut, chunk);
			// });
		}
	}

	uploadToS3({ data: output, id });
	return Promise.resolve();
}

async function init() {
	mkdirp(PATH_OUT);

	// const files = fs.readdirSync(PATH_OUT).filter(d => d.includes('.csv'));
	// const offset = files.length;
	const offset = 53;
	const subsetUsers = USER_DATA.slice(offset); 

	for (s of subsetUsers) {
		await getPosts(s);
	}
}

init();

