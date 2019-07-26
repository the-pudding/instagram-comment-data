const Instamancer = require('instamancer');
const fs = require('fs');
const rimraf = require('rimraf');
const d3 = require('d3');
const request = require('request');

// https://i.instagram.com/api/v1/users/336650/info/

function patterns(str, all) {
  
  // if the string is empty, return all the string sets
  if (str.length === 0) { return all; }
  
  // if character is 0 or 1 then add the character to each
  // string set we currently have so far
  if (str[0] === '0' || str[0] === '1') {
    for (var i = 0; i < all.length; i++) {
      all[i].push(str[0]);  
    }
  }
  
  // for a wildcard, we make a copy of each string set
  // and for half of them we append a 0 to the string 
  // and for the other half we append a 1 to the string
  if (str[0] === '?') {
    var len = all.length;
    for (var i = 0; i < len; i++) {
      var temp = all[i].slice(0);
      all.push(temp);
    }
    for (var i = 0; i < all.length; i++) {
      (i < all.length/2) ? all[i].push('0') : all[i].push('1');  
    }
  }
  
  // recursively calculate all string sets
  return patterns(str.substring(1), all);
  
}

function checkExist(id) {
	return new Promise((resolve, reject) => {
		const url = `https://instagram.com/p/${id}`;
		request.head(url, (err, resp) => {
			if (err) reject();
			else if (resp.statusCode === 200) resolve(true);
			else resolve();
		});
	});
}

function base10_to_base64(num) {
    const order = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    const base = order.length;
    let str = '';
		let r = null;
    while (num) {
        r = num % base;
        num -= r;
        num /= base;
        str = `${order.charAt(r)}${str}`;
    }
    return str;
}

function generateIDs(timestamp, sequence) {
		const q = d3.range(13).map(() => '?').join('');
		const p = patterns(q, [[]]);
		const users = [].concat(...p.map(d => d.join('')));
		
		return users.map(user => {
			const EPOCH = 1314220021400;
			const since = timestamp - EPOCH;
			const timeSince = 108306491600 - since;

			const created = (since).toString(2);
			// const user = (i % 5000).toString(2);
			const seq = (sequence % 1024).toString(2);

			const created2 = `${created}`.padStart(41, '0');
			// const user2 = `${user}`.padStart(13, '0');
			const seq2 = `${seq}`.padStart(10, '0');

			const idBase10 = `${created2}${user}${seq2}`;
			const id = parseInt(idBase10, 2);
			const shortcode = base10_to_base64(id);
			return shortcode;
		});
}

function delay() {
	return new Promise(resolve => {
		setTimeout(resolve, 500);
	})
}

async function init() {
	const ids = [].concat(...d3.range(2).map(d => generateIDs(1422526513000, d)));
	let i = 0;
	for (id of ids) {
		await delay();
		const success = await checkExist(id);
		if (success) console.log(i, '------', id);
		else if (i % 100 === 0) console.log(i);
		i += 1;
	}
}

init();