const fs = require('fs');
const d3 = require('d3');
const shell = require('shelljs');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');

const RATE = 0.25; // 25% of smallest half-year comments
const PATH_IN = './output/s3';
const PATH_OUT = './output/bin';

const writers = {};
const counts = {};

function getWriter(bin) {
	if (!writers[bin]) {
		writers[bin] = `${PATH_OUT}/${bin}.csv`;
		fs.appendFileSync(writers[bin], 'bin,shortcode,created_at,text\n');
		counts[bin] = 0;
	}
	counts[bin] += 1;
	return writers[bin];
}

function binComments(file) {
	const data = d3.csvParse(fs.readFileSync(`${PATH_IN}/${file}`, 'utf8'));
	for (d of data) {
		const date = new Date(+d.created_at * 1000);
		const year = date.getFullYear();
		const month = d3.format('02')(Math.floor(date.getMonth() / 6));
		const bin = `${year}-${month}`;
		const writer = getWriter(bin);
		const row = d3.csvFormatBody([{ bin, ...d }]);
		fs.appendFileSync(writer, `${row}\n`);
	}
	return Promise.resolve();
}

async function getComments({ d, sampleSize }) {
	const data = d3.csvParse(fs.readFileSync(`${PATH_OUT}/${d.bin}.csv`, 'utf8'));
	d3.shuffle(data);
	const sample = data.slice(0, sampleSize);
	return Promise.resolve(sample);
}

async function pluck({bins, sampleSize}) {
	bins.sort((a,b) => d3.ascending(a.bin, b.bin));
	const output = [];

	for (d of bins) {
		console.log(`sampling ${d.bin}`);
		const comments = await getComments({ d, sampleSize });
		output.push(...comments);
	}

	return Promise.resolve(output);
}


async function init() {
	rimraf.sync(PATH_OUT);
	mkdirp(PATH_OUT);
	
	shell.exec('aws s3 sync s3://pudding-data-processing/instagram-comments ./output/s3 --exclude redo.csv');
	
	const files = fs.readdirSync(PATH_IN).filter(d => d.includes('.csv'));
	const len = files.length;
	let i = 0;

	for (f of files) {
		i += 1;
		console.log(`${i} of ${len}`);
		try {
			await binComments(f);
		} catch (err) {
			console.log(err);
		}
	}

	const countMap = Object.keys(counts).map(bin => ({bin, count: counts[bin]})).filter(d => {
		let [ year, group ] = d.bin.split('-');
		year = +year;
		group = +group;
		// 2011 - 01 (second half of year)
		return year + group > 2011;
	});

	const sampleSize = Math.floor(d3.min(countMap, d => d.count) * RATE);
	const results = await pluck({ bins: countMap, sampleSize });
	fs.writeFileSync(`./output/sample--${Date.now()}.csv`, d3.csvFormat(results));
}

init();