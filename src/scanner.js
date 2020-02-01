const url = require('url');
const CRI = require('chrome-remote-interface');
const LOG = require('./utils/logger.js');
const {processData} = require('./dataProcessor.js');
const chromeClient = require('./client.js');

async function getPuppeteerSession(context) {
    const scanner = new Scanner(context);
    await scanner.init();
    return new Proxy(context.page, {
        get: function (page, prop) {
            switch (prop) {
                case 'getData':
                    return async function () {
                        return await scanner.getData();
                    };
                case 'close':
                    return async function () {
                        return await scanner.close();
                    };
                default:
                    return page[prop];
            }
        }
    });
}

class Scanner {
    constructor(context) {
        this.client = null;
        this.context = context;
        this.data = getCleanDataObject();
    }
}

Scanner.prototype.init = init;
Scanner.prototype.close = close;
Scanner.prototype.getData = getData;

function getCleanDataObject() {
    return {
        scripts: {},
        serviceWorker: {},
        requests: [],
        responses: [],
        ///////////////////////////////
        websockets: {},
        dataURI: {},
        events: [],
        frames: {},
        styles: {},
        research: {},
        metrics: null,
        coverage: null,
        logs: {},
        console: {},
        errors: [],
        contexts: {},
        storage: {}
    };
}

async function init() {
    LOG.debug('Initiating Scanner');
    this.client = await getChromeClient(this.context.page);
    await chromeClient.initScan(this.client, this.context.collect, this.context.rules);
    chromeClient.registerFrameEvents(this.client, this.data.frames);
    chromeClient.registerNetworkEvents(this.client, this.context.rules, this.context.collect, this.data.requests, this.data.responses);
}

async function close() {
    LOG.debug('Closing Scanner');

    try {
        await this.client.close();
    } catch (e) {
        LOG.error(e);
    }
}

async function getChromeClient(page) {
    const connection = page._client._connection._url;
    const {hostname, port} = url.parse(connection, true);
    return await CRI({host: hostname, port});
}

async function setSWListener(client, content, serviceWorkers) {
    await chromeClient.registerServiceWorkerEvents(client, content, serviceWorkers);
}

async function getData() {
    LOG.debug('Preparing data...');
    const collect = this.context.collect;

    if (collect.scriptDOMEvents) {
        this.data.domEvents = await chromeClient.getAllDOMEvents(this.client);
    }
    if (collect.cookies) {
        this.data.cookies = await chromeClient.getCookies(this.client);
    }
    if (collect.resources) {
        this.data.resources = await chromeClient.getResources(this.client);
    }
    if (collect.styleCoverage) {
        this.data.styleCoverage = await chromeClient.getStyleCoverage(this.client);
    }
    if (collect.scriptCoverage) {
        this.data.scriptCoverage = await chromeClient.getScriptCoverage(this.client);
    }
    if (collect.metadata) {
        this.data.metadata = await chromeClient.getMetadata(this.client);
    }
    if (collect.JSMetrics) {
        this.data.JSMetrics = await chromeClient.getExecutionMetrics(this.client);
    }

    const data = await processData(this.data, this.context);

    this.data = getCleanDataObject();
    return data;
}

module.exports = {
    getPuppeteerSession
};
