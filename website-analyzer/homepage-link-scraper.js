const fs = require('fs');
const cheerio = require('cheerio')
const { By, until, Builder, Key } = require('selenium-webdriver');

function readFileToArray(filename) {
  const contents = fs.readFileSync(filename, 'utf-8');
  const arr = contents.split(/\r?\n/);
  return arr;
}


function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const setupDriver = async () => {
    try {
        const driver = await new Builder().forBrowser('firefox').build();
        return driver;
    } catch (e) {
        console.log(e);
        return null;
    }
}

const checkTags = ($, element) => {
    if (!$(element)[0]) return false;
    const tag = $(element)[0].name;
    
    switch (tag) {
      case 'nav':
        return false
    }

    return true;

};

const passTags = ($, element) => {
    if (element.closest('article').length > 0) {
      return true
    } else if (element.closest('section').length > 0) {
      return true
    } else if (element.parents('[class*=story]').length > 0) {
      return true
    } else {
      return false;
    };
}

const generateURLList = ($, elements, source) => {
    let urls = [];
    for (let i = 0; i < elements.length; i++) {
      const element = $(elements[i]);
      let href = null;
      let finalUrl;
      if (element.is('a')) {
        href = element.attr('href');
      } else {
        href = $(element.find('a')[0]).attr('href');
      }

      if (href != null) {
        if (href.indexOf('//') === 0) {
          finalUrl = 'https:'+href;
        } else if (href.indexOf('/') === 0) {
          const combinedUrl = "https://"+source+'/'+href;
          finalUrl = combinedUrl;
        } else {
          finalUrl = href;
        }
      }
      if (finalUrl) {
      	try {
      	  new URL(finalUrl);
      	} catch(e) {
      		continue;
      	}
	    
	    urls.push(finalUrl)
      }
    }
    return urls;
}

async function GetLinksFromHomepage(driver, newsDomain) {
	console.log("running homepage link scraper for:", newsDomain)
	await driver.get(`https://${newsDomain}`);

    const body = await driver.executeScript('return document.documentElement.innerHTML')
    const $ = cheerio.load(body);

    let newLeaves = [];

    const leaves = $('*:not(:has(*))');
    for (let i = 0; i < leaves.length; i++) {
      const el = $(leaves[i]);
      if (
        !!el.text().trim().length
        && el.text().trim().length > 12
        && el.text().trim().split(' ').length > 3
      ) {
        newLeaves.push(el);
      };
    }

    console.log("Processed:", newLeaves.length);
    newLeaves = newLeaves.map((leaf) => {
      let currentEl = $(leaf);
      let levelsUp = 0;
      while (currentEl.parent() && levelsUp < 10) {
        if (!checkTags($, currentEl)) return null;
        if (currentEl.is(':header')) {
          if (currentEl.closest('article').length > 0) {
            return currentEl.closest('article');
          }

          if (currentEl.has('a')) {
            return currentEl;
          } else if (currentEl.parent().is('a')) {
            return currentEl.parent();
          }
        } else if (currentEl.find('> :header').length > 0) {
          return currentEl;
        } else if (passTags($, currentEl) && currentEl.is('a') && $(currentEl).text().trim().split(' ').length > 4 ) {
          return currentEl;
        } else if (currentEl.is('article')) {
          return currentEl;
        }

        currentEl = currentEl.parent();
        levelsUp++;
      }

      return null;
    }).filter(leaf => !!leaf); 
    console.log("Renderable:", newLeaves.length);
    const urls = generateURLList($, newLeaves, newsDomain);

	return urls;
}

async function run() {
	const driver = await setupDriver();

	const newsDomains = readFileToArray('./news-domains.txt');

	let homepageLinks = {}
	for (let newsDomain of newsDomains) {
		try {
			const newLinks = await GetLinksFromHomepage(driver, newsDomain)
			homepageLinks[newsDomain] = newLinks
		} catch(e) {
			console.log(e)
		}
	}

	fs.writeFileSync('news-articles-dump.json', JSON.stringify(homepageLinks, null, 4));
}

run()