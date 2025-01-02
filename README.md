## web-stats
A project to display server/vps/dedicated/pc/anything statistics on a website like:
* CPU Usage
* CPU Temperature
* RAM - GENERAL, SWAP or CACHE
* Server uptime
* Network usage
* Memory usage on the server's main disk
and soon will be more stats
## Setup
1. Download or clone this github repo
2. Install packages using command: `npm install`
3. Start server using one of following commands:
* `node .`
* `node index.js`
#### For ease of use, I recommend running with pm2:
* `npm install -g pm2`
* `pm2 start index.js --name web-stats`