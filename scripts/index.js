const Instamancer = require('instamancer');
const fs = require('fs');
const rimraf = require('rimraf');
const d3 = require('d3');

const TAG = 'catsinboxes'
const FILE_OUT = `./output/${TAG}.csv`;
const TEST = false;

const OPTIONS = {
	total: TEST ? 10 : 0,
	headless: true,
	silent: true,
	fullAPI: true,
}

const HASH = Instamancer.hashtag(TAG, OPTIONS);

function getComments({ edges = [], shortcode }) {
	return edges.map(({ node }) => {
		const { text, created_at } = node;
		const clean = text.replace(/\n/g, ' ');
		return { shortcode, created_at, text: clean };
	});
}

async function init() {
	rimraf.sync(FILE_OUT);
	const COLUMNS = ['shortcode', 'created_at', 'text']
	fs.appendFileSync(FILE_OUT, `${d3.csvFormatBody([COLUMNS])}\n`); 

	let i = 0;
	for await (const post of HASH) {
		console.log(i);
		const { shortcode, edge_media_to_parent_comment } = post.shortcode_media;
		const { edges } = edge_media_to_parent_comment;
		const commentsTop = getComments({ edges, shortcode });
		const commentsNested = edges.map(({ node }) => {
			const threadEdges = node.edge_threaded_comments ? node.edge_threaded_comments.edges : []; 
			return getComments({ edges: threadEdges, shortcode });
		}).filter(d => d.length);
		const commentsAll = commentsTop.concat(...commentsNested);
		const chunk = `${d3.csvFormatBody(commentsAll)}\n`;
		fs.appendFileSync(FILE_OUT, chunk);
		i += 1;
	}
}

init();
