const Instamancer = require('instamancer');
const fs = require('fs');
const rimraf = require('rimraf');
const d3 = require('d3');

let tag = null;
let fileOut = null;
let instaHash = null;
let test = false;

const TEST_TOTAL = 20;

const OPTIONS = {
	total: TEST_TOTAL,
	headless: true,
	silent: true,
	fullAPI: true,
}

function printProgress(index) {
	if (process.stdout.clearLine) process.stdout.clearLine();
	process.stdout.cursorTo(0);
	process.stdout.write(`posts scraped: ${index + 1}`);
}

function setup() {
	tag = process.env.npm_config_tag || false;
	test = !!process.env.npm_config_test;
	fileOut = `./output/${tag}.csv`;
	if (!test) OPTIONS.total = 0;
	instaHash = Instamancer.hashtag(tag, OPTIONS);
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

async function init() {
	setup();
	if (!tag) {
		console.log('error: you need to pass a hashtag eg. "npm start --tag funny"');
		return false;
	} else {
		const count = test ? TEST_TOTAL : 'all' ;
		console.log(`scraping ${count} instagram posts for #${tag} ...sit tight.`);
	}

	rimraf.sync(fileOut);
	const COLUMNS = ['shortcode', 'created_at', 'text']
	fs.appendFileSync(fileOut, `${d3.csvFormatBody([COLUMNS])}\n`); 

	let i = 0;
	
	for await (const post of instaHash) {
		printProgress(i);
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
			clean.forEach(c => {
				const formatted = d3.csvFormatBody([c]);
				const chunk = `${formatted}\n`;
				fs.appendFileSync(fileOut, chunk);
			});
		}
		i += 1;
	}
}

init();
