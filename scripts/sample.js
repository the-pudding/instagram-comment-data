const fs = require('fs');
const d3 = require('d3');
const shell = require('shelljs');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const franc = require('franc-min');
// const emojiRegex = require('emoji-regex');
const stringz = require('stringz');


const RATE = 0.25; // 25% of smallest half-year comments, would like it down to 5%
const PATH_IN = './output/s3';
const PATH_OUT = './output/bin';

const writers = {};
// const emojiRegex = new RegExp('(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])');
const emojiRegex = new RegExp('(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c\ude32-\ude3a]|[\ud83c\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])');
// const regex = emojiRegex();

let usable = 0;

function countNonASCII(str = '') {
	let asciiLen = 0;
	for (let i = 0; i < str.length; i += 1) {
		if (str.charCodeAt(i) < 128) asciiLen += 1;
	}
	const realLen = stringz.length(str);
	return realLen - asciiLen;
}

function countEmoji(str = '') {
	let count = 0;
	const chars = stringz.toArray(str);
	// console.log(chars);
	for (let i = 0; i < chars.length; i += 1) {
		const c = chars[i];
		const r = emojiRegex.test(c);
		// console.log(c, r);
		count += r ? 1 : 0;
	}
	return count;
}

function isASCII(str) {
	return /^[\x00-\x7F]*$/.test(str);
}

function isEnglishish(text) {
	const langs = franc.all(text, { minLength: 10 });
	const eng = langs.find(d => d[0] === 'eng');
	const engIndex = langs.findIndex(d => d[0] === 'eng');
	const undIndex = langs.findIndex(d => d[0] === 'und');
	const use = (engIndex > -1 && eng[1] > 0.8) || undIndex > -1;
	return use;
}

function getWriter(bin) {
	if (!writers[bin]) {
		writers[bin] = `${PATH_OUT}/${bin}.csv`;
		fs.appendFileSync(writers[bin], 'bin,shortcode,created_at,text\n');
	}
	return writers[bin];
}

function binComments(file) {
	const data = d3.csvParse(fs.readFileSync(`${PATH_IN}/${file}`, 'utf8'));
	const filtered = data.filter(d => countNonASCII(d.text) - countEmoji(d.text) <= 0);
	if (filtered.length) usable += 1;
	for (d of filtered) {
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

async function getComments({ file, sampleSize }) {
	const data = d3.csvParse(fs.readFileSync(`${PATH_OUT}/${file}`, 'utf8'));
	d3.shuffle(data);
	const sample = data.slice(0, sampleSize);
	return Promise.resolve(sample);
}

async function pluck({binFiles, sampleSize}) {
	// binFiles.sort(d3.ascending);
	const output = [];

	for (file of binFiles) {
		console.log(`sampling ${file}`);
		const comments = await getComments({ file, sampleSize });
		output.push(...comments);
	}

	return Promise.resolve(output);
}

function getCommentCount(bin) {
	const data = d3.csvParse(fs.readFileSync(`${PATH_OUT}/${bin}`, 'utf8'));
	return data.length;
}

async function createBins() {
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
	console.log({ usable });
	return Promise.resolve();
}

async function createSamples() {
	const binFiles = fs.readdirSync(PATH_OUT).filter(d => {
		const isCSV = d.includes('.csv');
		let [year, group] = d.replace('.csv', '').split('-');
		year = +year;
		group = +group;
		const t = year + group;
		// 2012 - 01 (second half of year)
		return isCSV && t > 2012 && t <= 2019;
	});

	const minComments = d3.min(binFiles, d => getCommentCount(d));
	const sampleSize = Math.floor(minComments * RATE);

	console.log({ minComments, sampleSize });
	const results = await pluck({ binFiles, sampleSize });
	fs.writeFileSync(`./output/sample--${Date.now()}.csv`, d3.csvFormat(results));
}

async function init() {
	// await createBins();
	await createSamples();
}


// init();

// const test = ["💀",
// "🤣",
// "😂",
// "😄",
// "😅",
// "😆",
// "aaaahhhh",
// "actulol",
// "ahahahah",
// "bahaha",
// "buhaha",
// "cant stop laughing",
// "ctfu",
// "ded",
// "dedddd",
// "dehd",
// "dying so hard",
// "eks dee",
// "el-maooo",
// "evil laugh",
// "fdsfgs",
// "fffffffff",
// "finished!",
// "giggles",
// "ha",
// "ha ha ha",
// "haaa",
// "haha",
// "hahaha",
// "ha^X",
// "heh",
// "hehe",
// "huahuahuah",
// "i actually burst out laughing",
// "i cant",
// "i cant breathe",
// "i cant even",
// "i cant no more",
// "i chortled",
// "i literally loled",
// "i snorted",
// "im actually laughing",
// "im actually laughing out loud",
// "im actually laughing so hard",
// "im bawling",
// "im cackling",
// "im choking",
// "im crying",
// "im dead",
// "im deceased",
// "im done",
// "im dying",
// "im grinning so hard right now",
// "im laughing so hard rn",
// "im literally cracking up",
// "im peeing",
// "im screaming",
// "im wheezing",
// "jajaja",
// "kekeke",
// "kikiki",
// "kkkkkkkkkk",
// "laughing",
// "lawlz",
// "lel...",
// "lelel...",
// "lmao",
// "lmfao",
// "lol",
// "lolololol",
// "looool",
// "luls",
// "lulz",
// "muahaha",
// "mueheheh",
// "mwahahah",
// "my sides hurt",
// "my stomach hurts from laughing",
// "oh my god stahhhhp",
// "pissing myself",
// "qltm",
// "rofl",
// "roflmao",
// "shutup! im dead!",
// "sksksksk",
// "staaaahp",
// "teehee",
// "thats jokes",
// "thats literally so funny",
// "XD",
// "you just made me laugh like an idiot",
// '👏🏻👏🏻👏🏻👏🏻👏🏻👏🏻',
// '👏👏👏👏',
// '🔝🔝🔝',
// 'Kkkkkk boa!',
// 'Kkkk 👊👌',
// ' 1513907572, 👏🏼👏🏼 Que 2018 seja ainda melhor 🥂🍾✨🚀🎯🏌🏼‍♀️',
// '👏🏼👏🏼👏🏼👏🏼',
// '👏🏻👏🏻👏🏻👏🏻👏🏻👏🏻👏🏻',
// '👏👏👏👏👏👏',
// 'nuninhos! 👶🏼👶🏼 q baita foto Nunes!',
// 'Que demais!!!!',
// '😍😍',
// '😍😍😍',
// 'Mais e mais sucesso em 2018!!','get that toast boy',
// '✅Cool photo☺☺☺.........',
// '✅Одно из мега лучших картинок👍!'
// ];

// const test = [
// 	'😃😃😃😃😃😃😃😃😃😃😃😃✌!',
// 	'Hola chickens',
// 	'👉#instagood!!',
// 	'It’s suppose to be like the dog from the Grinch! He only had one antler.😍',
// 	'Happy birthday sassy!',
// 	'looooooooooooool',
// 	'lolololololololol',
// 	'haha',
// 	'hahahahahahahahahaha',
// 	'✅Cool photo☺☺☺.........',
// 	'✅Одно из мега лучших картинок👍!'
// ];

// test.forEach(d => {
// 	console.log(d);
// 	console.log(isEnglishish(d), countNonASCII(d) , countEmoji(d));
// 	console.log('valid', isEnglishish(d) && countNonASCII(d) - countEmoji(d) <= 0);
// });
// console.log(filtered);

// const test = [];

// console.log(test.map(isEnglishish));

// const tests = ['testing.', 'and 👩学校👩', 'śoo', '👩👩👩👩👩👩', 'testing👩.', '学校😀', '😀', 'ö👩', 'っていいますか、ハードロックおじさんです^^'];

// for (t of tests) {
// 	console.log(t);
// 	console.log(countNonASCII(t), countEmoji(t));
// }







// if (match) {
// 	const emoji = match[0];
// 	console.log(`Matched sequence ${emoji} — code points: ${[...emoji].length}`);
// } else console.log('no match');

// const data = d3.csvParse(fs.readFileSync('./output/sample--1564609230656.csv', 'utf8'));

// const data = [
// 	{text: 'ha'},
// 	{ text: 'haha' },
// 	{ text: 'hahahahaha' },
// 	{ text: 'lol' },
// 	{ text: 'lolll' },
// 	{ text: 'rofl omg' },
// ];

// const lang = data.slice(0, 100).map(d => {
// 	const langs = franc.all(d.text, { minLength: 5 });
// 	const eng = langs.find(d => d[0] === 'eng');
// 	const engIndex = langs.findIndex(d => d[0] === 'eng');
// 	const und = langs.find(d => d[0] === 'und');
// 	const undIndex = langs.findIndex(d => d[0] === 'und');
// 	console.log(d.text);
// 	const use = (engIndex < 20 && engIndex > -1) || undIndex > -1;
// 	console.log(use);
// 	// console.log(langs.slice(0, 10));
// 	console.log('-------------\n')
// 	// return {
// 	// 	...d,
// 	// }	
	
// });

// fs.writeFileSync('./output/lang.csv', d3.csvFormat(lang));