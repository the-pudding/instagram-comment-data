# Instagram comment data
Scraping a huge sample of random Instagram comments.

## Method

* Grab 10,000 random users (looking up IDs between 0-9999999, public, not business, with between 20-2,000 posts)
* Scrape all posts and comments for each user
* Go through each user, write comments to a time bin (month or year) file
* Calculate the min. number in a bin, and determine sample of each bin to pull (eg. if min is 100, grab 50 from each)
* Load each bin file, shuffle comments, pull sample number

## Installation
`npm install`

