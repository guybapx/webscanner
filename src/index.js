const Scanner = require('./scanner.js');
const LOG = require('./logger.js');

/**
 *
 * @param page - puppeteer page
 * @param opts - scanning configuration
 * @return {Promise}
 */
async function getSession(page, opts = {}) {
    const context = getContext(page, opts);
    LOG.setEnabled(context.log);
    return await Scanner.getSession(context);
}

function getContext(page, opts = {}) {
    if (!page) {
        throw new Error('page is missing');
    }

    const defaultCollect = {
        frames: false, //Collect iframes data
        scripts: false, //Collect scripts data
        scriptSource: false, //get script source
        scriptDOMEvents: false, //get script registered DOM Events
        scriptCoverage: false, //get script coverage
        styles: false, //Collect style data
        styleSource: true, //gets style source
        styleCoverage: false, //get style coverage
        serviceWorker: false,
        requests: false, //Collect requests data
        responses: false, //get response data per request
        bodyResponse: [], // gets response body by url regex
        dataURI: false, //Collect data URI requests (returns url hash)
        websocket: false, //Collect websocket connections
        cookies: false,//get all browser cookies
        logs: false,//Collect browser logs
        console: false,//Collect console AP usage
        errors: false,//collect JS errors
        storage: false,//collect storage events (localStorage, sessionStorage)
        resources: false, //collect all resources
        JSMetrics: false, //collect js execution metrics
        metadata: false, //collect js execution metrics
    };

    const defaultRules = {
        stealth: Boolean(opts.stealth),
        disableServices: false, //Disable common third party services
        blockedUrls: [], //Set chrome blocked urls
        adBlocking: false, //Enable ad blocking feature
        disableCSP: false, //Disable browser CSP blocking
        logsThreshold: 50, //default logs threshold
    };

    return {
        page, ...{
            log: opts.log || false,
            rules: {...defaultRules, ...opts.rules || {}},
            collect: {...defaultCollect, ...opts.collect || {}}
        }
    };
}

module.exports = {
    getSession
};
