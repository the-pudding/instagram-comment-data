# Instagram comment data
Scraping a huge sample of random Instagram comments.

## Method

* Grab 10,000 random users (looking up IDs between 0-9999999, public, not business, with between 20-2,000 posts)
* Scrape all posts and comments for each user
* Arrange all comments for each user chronologically, take a sample at ~ equal time intervals (__%)
* Bucket all comments by year, and take even amount from each year

## Installation
`npm install`

## Usage
download **all** comments
`npm start --tag=funny`

download a small sample
`npm start --tag=funny --test`
