const LOG = require('../src/utils/logger');

function processData(data, context) {
    if (!data || !context) {
        return;
    }

    const collect = context.collect || {};
    const responseData = {};

    processFrames(data.frames);
    processNetwork(data);

    if (collect.frames) {
        responseData.frames = data.frames;
        //eslint-disable-next-line
        for (const frameId in data.resourcesTree) {
            responseData.frames[frameId] = {...responseData.frames[frameId], ...data.resourcesTree[frameId]};
        }
    }
    if (collect.scripts) {
        processScripts(data, collect);
        responseData.scripts = data.scripts;
    }
    if (collect.styles) {
        if (collect.styleCoverage) {
            processStyleCoverage(data, collect);
        }
        responseData.styleSheets = data.styles;
    }
    if (data.metadata) {
        responseData.metadata = data.metadata;
        responseData.metadata.metrics = processMetrics(data.metrics);
    }

    if (collect.requests) {
        responseData.requests = processRequests(data);
    }
    if (collect.dataURI) {
        responseData.dataURI = data.dataURI;
    }
    if (collect.storage) {
        responseData.storage = data.storage;
    }
    if (collect.serviceWorker) {
        responseData.serviceWorker = data.serviceWorker;
    }
    if (collect.cookies) {
        responseData.cookies = data.cookies;
    }
    if (collect.logs) {
        responseData.logs = data.logs;
    }
    if (collect.console) {
        responseData.console = data.console;
    }
    if (collect.errors) {
        responseData.errors = data.errors;
    }
    if (collect.storage) {
        responseData.storage = data.storage;
    }
    if (collect.resources) {
        responseData.resources = data.resources;
    }
    //Remove undefined values
    return JSON.parse(JSON.stringify(responseData));
}

function processRequests(data) {
    const reqs = {};
    //eslint-disable-next-line
    for (const requestId in data.requests) {
        const req = data.requests[requestId];
        req.requestId = requestId;
        try {
            const origin = new URL(req.url).origin;
            reqs[origin] = reqs[origin] || [];
            reqs[origin].push(req);
        } catch (e) {
            reqs.other = reqs.other || [];
            reqs.other.push(req);
        }
    }
}

function processScripts(data, collect) {
    if (!data.scripts || !Object.keys(data.scripts).length) {
        return;
    }

    if (collect.scriptCoverage) {
        processScriptCoverage(data);
    }

    if (data.domEvents) {
        for (let i = 0; i < data.domEvents.length; i++) {
            const eventObj = data.domEvents[i];
            const script = data.scripts[eventObj.scriptId];

            if (script) {
                delete eventObj.scriptId;
                script.events = script.events || [];
                script.events.push(eventObj);
            }
        }
    }

    //eslint-disable-next-line
    for (const scriptId in data.scripts) {
        const script = data.scripts[scriptId];
        const frame = data.frames[script.frameId];
        script.frameURL = frame.url;

        if (script.frameURL === script.url) {
            script.url = 'inline';
        }

        //TODO - extract from function
        if (script.stackTrace) {
            script.parentScript = script.stackTrace.callFrames && script.stackTrace.callFrames[0];
        }
    }
}

function processStyleCoverage(data,) {
    const coverage = data.styleCoverage || [];

    for (let i = 0; i < coverage.length; i++) {
        const {styleSheetId, endOffset, startOffset} = coverage[i];
        const style = data.styles[styleSheetId];

        if (style) {
            style.coverage = style.coverage || {};
            style.coverage.usedBytes = style.coverage.usedBytes || 0;
            style.coverage.usedBytes += endOffset - startOffset;
        }
    }

    //eslint-disable-next-line
    for (const styleId in data.styles) {
        const style = data.styles[styleId];
        if (style.coverage) {
            style.coverage.usage = style.coverage.usedBytes / style.length;
        }
    }
}

function processNetwork(data) {
    if (!data.requests || !Object.keys(data.requests).length) {
        return;
    }

    //eslint-disable-next-line
    for (const requestId in data.requests) {
        const request = data.requests[requestId];
        const frame = data.frames[request.frameId] || {};
        request.frameURL = frame.url;
    }
    return data.requests;
}

function processFrames(frames) {
    //eslint-disable-next-line
    for (const frameId in frames) {
        const frame = frames[frameId];
        frame.url = frame.url || 'about:blank';
    }
}

function processMetrics(collectedMetrics) {
    const metrics = {};

    for (let i = 0; i < collectedMetrics.length; i++) {
        const metric = collectedMetrics[i];
        metrics[metric.name] = metric.value;
    }
    return metrics;
}

function processScriptCoverage(data) {
    const coverage = data.scriptCoverage.sort((a, b) => {
        return +a.scriptId >= +b.scriptId ? 1 : -1;
    });

    for (let i = 0; i < coverage.length; i++) {
        const {scriptId, functions, url} = coverage[i];

        if (url === '__puppeteer_evaluation_script__') {
            continue;
        }
        const script = data.scripts[scriptId];
        const usedFunctions = new Set();
        const unusedFunctionsNames = new Set();
        const ranges = [];

        if (!script) {
            LOG.debug(`Script ${scriptId} is missing`);
            continue;
        }

        for (let i = 0; i < functions.length; i++) {
            const funcObj = functions[i];
            const coverageCandidate = funcObj.ranges[0];
            const functionName = funcObj.functionName || '[[anonymous]]';

            if (!coverageCandidate.count) {
                unusedFunctionsNames.add(functionName);
                continue;
            }
            usedFunctions.add(functionName);

            if (ranges.length === 0) {
                ranges.push(coverageCandidate);
                continue;
            }

            let merged = false;
            for (let j = 0; j < ranges.length; j++) {
                const coverage = ranges[j];

                if (isRangeContains(coverageCandidate, coverage)) {
                    ranges[j] = {
                        startOffset: Math.min(coverage.startOffset, coverageCandidate.startOffset),
                        endOffset: Math.max(coverage.endOffset, coverageCandidate.endOffset)
                    };
                    merged = true;
                    break;
                }
            }

            if (!merged) {
                ranges.push(coverageCandidate);
            }
        }

        let usedBytes = 0;

        for (let i = 0; i < ranges.length; i++) {
            const {startOffset, endOffset} = ranges[i];
            usedBytes += endOffset - startOffset;
        }

        script.functionCoverage = {
            usedBytes,
            usage: usedBytes / script.length,
            usedFunctions: Array.from(usedFunctions).sort(),
            unusedFunctions: Array.from(unusedFunctionsNames).sort(),
        };
    }
}

function isRangeContains(p1, p2) {
    const isStartUnion = p1.startOffset <= p2.startOffset && p1.endOffset <= p2.endOffset && p1.endOffset >= p2.startOffset;
    const isEndUnion = p1.endOffset >= p2.endOffset && p1.startOffset >= p2.startOffset && p1.startOffset <= p2.endOffset;
    const isUnion = (p1.startOffset > p2.startOffset && p1.endOffset < p2.endOffset) || (p1.startOffset < p2.startOffset && p1.endOffset > p2.endOffset);
    return isStartUnion || isEndUnion || isUnion;
}

module.exports = {
    processData,
    processScriptCoverage
};
