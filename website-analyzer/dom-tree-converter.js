const fs = require('fs');
const { By, until, Builder, Key } = require('selenium-webdriver');

const readabilityJsContent = fs.readFileSync('./Readability.js', 'utf-8');

function readFileToArray(filename) {
  const contents = fs.readFileSync(filename, 'utf-8');
  const arr = contents.split(/\r?\n/);
  return arr;
}

function readFileToJSON(filename) {
  const contents = fs.readFileSync(filename, 'utf-8');
  const json = JSON.parse(contents);
  return json;
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

async function getOutBoundRequests(driver) {
	const networkScript = `var performance = window.performance || window.mozPerformance || window.msPerformance || window.webkitPerformance || {}; console.log(performance); var network = performance.getEntries() || {};
	return network.filter((requestObject) => {
		return requestObject.entryType === 'resource'
	}).map((requestObject) => {
		try {
			const url = new URL(requestObject.name)
			return url.hostname;
		} catch(e) {
			console.log(e);
			return null
		}
	}).filter((requestObject) => {
		return requestObject !== null;
	});`;
	const networkJSONArray = await driver.executeScript(networkScript);
	return [...new Set(networkJSONArray)]; // remove duplicates
}

async function GetDOMTreeFromUrl(driver, newsDomain, isArticle, isJSON) {
	console.log("running outbound req finder for:", newsDomain)
	const isNytimes = newsDomain.includes('nytimes.com');
	if (isArticle) {
		await driver.get(newsDomain);
	} else {
		await driver.get(`https://${newsDomain}`);
	}

	const result = {};

	if (isArticle && isNytimes) {
		// wait for page to load
		await driver.wait(() => {
			return driver.executeScript("return document.readyState === 'complete'")
		});
		const contentBy = By.css('section[name="articleBody"]');
		let contentEl;
		try {
			contentEl = await driver.findElement(contentBy);
		} catch(e) {
			console.log(e)
			// swallow error
		}

		if (contentEl) {
			result.content = await contentEl.getAttribute("textContent");
			if (!result.content && isJSON) {
				return false;
			}
		} else {
			return false
		}
		
	}

	if (isArticle) {
		const date = new Date();
		result.date = date.getTime();
		try {
			await driver.executeScript(readabilityJsContent);
		} catch(e) {
			// swallow error
			console.log("executeScript 1")
			return false;
		}
		// get article title
		let titleBy = By.css('meta[property="og:title"]')
		let titleEl = await driver.findElement(titleBy);
		let title = null;
		if (titleEl) {
			title = await titleEl.getAttribute('content');;
		} else {
			titleBy = By.css('title')
			titleEl = await driver.findElement(titleBy);
			if (titleEl) {
				title = await titleEl.getText();
			}
		}

		// get article content
		let readabilityContent;
		try {
			readabilityContent = await driver.executeScript('return new Readability(document.cloneNode(true)).parse();');

		} catch(e) {
			// swallow error
			console.log("executeScript 2")

			return false;
		}
		let content;
		if (readabilityContent) {
			content = readabilityContent.textContent	
			if (!content && isJSON) {
				return false;
			}			
			if (!title) {
				title = readabilityContent.title
			}		
		}

		result.title = title;
		if (!isNytimes) {
			result.content = content;
		}
	}

	// wait for page to load
	await driver.wait(() => {
		return driver.executeScript("return document.readyState === 'complete'")
	});
	await timeout(1000);

	// // get dom object
	// const DOMTree = await driver.executeScript(`
	// const convertHTMLTreeToJSON = (element) => {
	// 	const jsonObject = {};
	// 	jsonObject.tagName = element.tagName;
	// 	for (let attribute of Object.values(element.attributes)) {
	// 		jsonObject[attribute.name] = attribute.value;
	// 	}
	// 	jsonObject.children = [];
	// 	const children = element.children;
	// 	for (let child of children) {
	// 		 jsonObject.children.push(convertHTMLTreeToJSON(child));
	// 	}
	// 	return jsonObject;
	// }; return convertHTMLTreeToJSON(document.documentElement);`)
	// result.DOMTree = DOMTree
	result.outBoundRequests = await getOutBoundRequests(driver)
	return result;
}

async function run() {

	const isJSON = true;
	let newsDomains;
	if (isJSON) {
		newsDomains = readFileToJSON('./news-articles-dump.json');
	} else {
		newsDomains = readFileToArray('./news-articles.txt');
	}

	const domTreesByDomain = {}
	if (isJSON) {
		for (let newsDomain of Object.keys(newsDomains)) {
			const driver = await setupDriver();

			domTreesByDomain[newsDomain] = {};
			const dedupArticles = [...new Set(newsDomains[newsDomain])];
			for (let newsArticle of dedupArticles) {
				try {
					const domTree = await GetDOMTreeFromUrl(driver, newsArticle, true, isJSON)
					if (domTree) {
						console.log(domTree);
						domTreesByDomain[newsDomain][newsArticle] = domTree
					} else {
						console.log('pass');
					}
				} catch(e) {
					console.log(e)
					console.log('pass');
				}
			}

			await driver.quit();
		}
	} else {
		const driver = await setupDriver();

		for (let newsDomain of newsDomains) {
			try {
				const domTree = await GetDOMTreeFromUrl(driver, newsDomain, true, isJSON)
				console.log(domTree);
				domTreesByDomain[newsDomain] = domTree
			} catch(e) {
				console.log(e)
			}
		}	
	}
	

	fs.writeFileSync('dom-trees-by-domain.json', JSON.stringify(domTreesByDomain, null, 4));
}

run()