(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
function logToConsoleError(err) {
    var target = err.stack || err;
    if (console && console.error) {
        console.error(target);
    }
    else if (console && console.log) {
        console.log(target);
    }
}
function makeSinkProxies(drivers, streamAdapter) {
    var sinkProxies = {};
    for (var name_1 in drivers) {
        if (drivers.hasOwnProperty(name_1)) {
            var subject = streamAdapter.makeSubject();
            var driverStreamAdapter = drivers[name_1].streamAdapter || streamAdapter;
            var stream = driverStreamAdapter.adapt(subject.stream, streamAdapter.streamSubscribe);
            sinkProxies[name_1] = {
                stream: stream,
                observer: subject.observer,
            };
        }
    }
    return sinkProxies;
}
function callDrivers(drivers, sinkProxies, streamAdapter) {
    var sources = {};
    for (var name_2 in drivers) {
        if (drivers.hasOwnProperty(name_2)) {
            var driverOutput = drivers[name_2](sinkProxies[name_2].stream, streamAdapter, name_2);
            var driverStreamAdapter = drivers[name_2].streamAdapter;
            if (driverStreamAdapter && driverStreamAdapter.isValidStream(driverOutput)) {
                sources[name_2] = streamAdapter.adapt(driverOutput, driverStreamAdapter.streamSubscribe);
            }
            else {
                sources[name_2] = driverOutput;
            }
            if (sources[name_2] && typeof sources[name_2] === 'object') {
                sources[name_2]._isCycleSource = name_2;
            }
        }
    }
    return sources;
}
function replicateMany(sinks, sinkProxies, streamAdapter) {
    var sinkNames = Object.keys(sinks).filter(function (name) { return !!sinkProxies[name]; });
    var buffers = {};
    var replicators = {};
    sinkNames.forEach(function (name) {
        buffers[name] = { next: [], error: [], complete: [] };
        replicators[name] = {
            next: function (x) { return buffers[name].next.push(x); },
            error: function (x) { return buffers[name].error.push(x); },
            complete: function (x) { return buffers[name].complete.push(x); },
        };
    });
    var subscriptions = sinkNames.map(function (name) {
        return streamAdapter.streamSubscribe(sinks[name], {
            next: function (x) {
                replicators[name].next(x);
            },
            error: function (err) {
                logToConsoleError(err);
                replicators[name].error(err);
            },
            complete: function (x) {
                replicators[name].complete(x);
            },
        });
    });
    var disposeFunctions = subscriptions
        .filter(function (fn) { return typeof fn === 'function'; });
    sinkNames.forEach(function (name) {
        var observer = sinkProxies[name].observer;
        var next = observer.next;
        var error = observer.error;
        var complete = observer.complete;
        buffers[name].next.forEach(next);
        buffers[name].error.forEach(error);
        buffers[name].complete.forEach(complete);
        replicators[name].next = next;
        replicators[name].error = error;
        replicators[name].complete = complete;
    });
    return function () {
        disposeFunctions.forEach(function (dispose) { return dispose(); });
    };
}
function disposeSources(sources) {
    for (var k in sources) {
        if (sources.hasOwnProperty(k) && sources[k]
            && typeof sources[k].dispose === 'function') {
            sources[k].dispose();
        }
    }
}
var isObjectEmpty = function (obj) { return Object.keys(obj).length === 0; };
function Cycle(main, drivers, options) {
    if (typeof main !== "function") {
        throw new Error("First argument given to Cycle must be the 'main' " +
            "function.");
    }
    if (typeof drivers !== "object" || drivers === null) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with driver functions as properties.");
    }
    if (isObjectEmpty(drivers)) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with at least one driver function declared as a property.");
    }
    var streamAdapter = options.streamAdapter;
    if (!streamAdapter || isObjectEmpty(streamAdapter)) {
        throw new Error("Third argument given to Cycle must be an options object " +
            "with the streamAdapter key supplied with a valid stream adapter.");
    }
    var sinkProxies = makeSinkProxies(drivers, streamAdapter);
    var sources = callDrivers(drivers, sinkProxies, streamAdapter);
    var sinks = main(sources);
    if (typeof window !== 'undefined') {
        window.Cyclejs = { sinks: sinks };
    }
    var run = function () {
        var disposeReplication = replicateMany(sinks, sinkProxies, streamAdapter);
        return function () {
            disposeSources(sources);
            disposeReplication();
        };
    };
    return { sinks: sinks, sources: sources, run: run };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{}],2:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var XStreamAdapter = {
    adapt: function (originStream, originStreamSubscribe) {
        if (XStreamAdapter.isValidStream(originStream)) {
            return originStream;
        }
        ;
        var dispose = null;
        return xstream_1.default.create({
            start: function (out) {
                var observer = out;
                dispose = originStreamSubscribe(originStream, observer);
            },
            stop: function () {
                if (typeof dispose === 'function') {
                    dispose();
                }
            },
        });
    },
    makeSubject: function () {
        var stream = xstream_1.default.create();
        var observer = {
            next: function (x) { stream.shamefullySendNext(x); },
            error: function (err) { stream.shamefullySendError(err); },
            complete: function () { stream.shamefullySendComplete(); },
        };
        return { observer: observer, stream: stream };
    },
    remember: function (stream) {
        return stream.remember();
    },
    isValidStream: function (stream) {
        return (typeof stream.addListener === 'function' &&
            typeof stream.shamefullySendNext === 'function');
    },
    streamSubscribe: function (stream, observer) {
        stream.addListener(observer);
        return function () { return stream.removeListener(observer); };
    },
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = XStreamAdapter;

},{"xstream":10}],3:[function(require,module,exports){
"use strict";
var base_1 = require('@cycle/base');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
/**
 * Takes a `main` function and circularly connects it to the given collection
 * of driver functions.
 *
 * **Example:**
 * ```js
 * import {run} from '@cycle/xstream-run';
 * const dispose = run(main, drivers);
 * // ...
 * dispose();
 * ```
 *
 * The `main` function expects a collection of "source" streams (returned from
 * drivers) as input, and should return a collection of "sink" streams (to be
 * given to drivers). A "collection of streams" is a JavaScript object where
 * keys match the driver names registered by the `drivers` object, and values
 * are the streams. Refer to the documentation of each driver to see more
 * details on what types of sources it outputs and sinks it receives.
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Function} a dispose function, used to terminate the execution of the
 * Cycle.js program, cleaning up resources used.
 * @function run
 */
function run(main, drivers) {
    var _a = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default }), run = _a.run, sinks = _a.sinks;
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](sinks);
    }
    return run();
}
exports.run = run;
/**
 * A function that prepares the Cycle application to be executed. Takes a `main`
 * function and prepares to circularly connects it to the given collection of
 * driver functions. As an output, `Cycle()` returns an object with three
 * properties: `sources`, `sinks` and `run`. Only when `run()` is called will
 * the application actually execute. Refer to the documentation of `run()` for
 * more details.
 *
 * **Example:**
 * ```js
 * import Cycle from '@cycle/xstream-run';
 * const {sources, sinks, run} = Cycle(main, drivers);
 * // ...
 * const dispose = run(); // Executes the application
 * // ...
 * dispose();
 * ```
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Object} an object with three properties: `sources`, `sinks` and
 * `run`. `sources` is the collection of driver sources, `sinks` is the
 * collection of driver sinks, these can be used for debugging or testing. `run`
 * is the function that once called will execute the application.
 * @function Cycle
 */
var Cycle = function (main, drivers) {
    var out = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default });
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](out.sinks);
    }
    return out;
};
Cycle.run = run;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{"@cycle/base":1,"@cycle/xstream-adapter":2}],4:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":5}],5:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ponyfill = require('./ponyfill');

var _ponyfill2 = _interopRequireDefault(_ponyfill);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var root; /* global window */


if (typeof self !== 'undefined') {
  root = self;
} else if (typeof window !== 'undefined') {
  root = window;
} else if (typeof global !== 'undefined') {
  root = global;
} else if (typeof module !== 'undefined') {
  root = module;
} else {
  root = Function('return this')();
}

var result = (0, _ponyfill2['default'])(root);
exports['default'] = result;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./ponyfill":6}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports['default'] = symbolObservablePonyfill;
function symbolObservablePonyfill(root) {
	var result;
	var _Symbol = root.Symbol;

	if (typeof _Symbol === 'function') {
		if (_Symbol.observable) {
			result = _Symbol.observable;
		} else {
			result = _Symbol('observable');
			_Symbol.observable = result;
		}
	} else {
		result = '@@observable';
	}

	return result;
};
},{}],7:[function(require,module,exports){
"use strict";
var index_1 = require('../index');
var ConcatProducer = (function () {
    function ConcatProducer(streams) {
        this.streams = streams;
        this.type = 'concat';
        this.out = null;
        this.i = 0;
    }
    ConcatProducer.prototype._start = function (out) {
        this.out = out;
        this.streams[this.i]._add(this);
    };
    ConcatProducer.prototype._stop = function () {
        var streams = this.streams;
        if (this.i < streams.length) {
            streams[this.i]._remove(this);
        }
        this.i = 0;
        this.out = null;
    };
    ConcatProducer.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        u._n(t);
    };
    ConcatProducer.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    ConcatProducer.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        var streams = this.streams;
        streams[this.i]._remove(this);
        if (++this.i < streams.length) {
            streams[this.i]._add(this);
        }
        else {
            u._c();
        }
    };
    return ConcatProducer;
}());
/**
 * Puts one stream after the other. *concat* is a factory that takes multiple
 * streams as arguments, and starts the `n+1`-th stream only when the `n`-th
 * stream has completed. It concatenates those streams together.
 *
 * Marble diagram:
 *
 * ```text
 * --1--2---3---4-|
 * ...............--a-b-c--d-|
 *           concat
 * --1--2---3---4---a-b-c--d-|
 * ```
 *
 * Example:
 *
 * ```js
 * import concat from 'xstream/extra/concat'
 *
 * const streamA = xs.of('a', 'b', 'c')
 * const streamB = xs.of(10, 20, 30)
 * const streamC = xs.of('X', 'Y', 'Z')
 *
 * const outputStream = concat(streamA, streamB, streamC)
 *
 * outputStream.addListener({
 *   next: (x) => console.log(x),
 *   error: (err) => console.error(err),
 *   complete: () => console.log('concat completed'),
 * })
 * ```
 *
 * @factory true
 * @param {Stream} stream1 A stream to concatenate together with other streams.
 * @param {Stream} stream2 A stream to concatenate together with other streams. Two
 * or more streams may be given as arguments.
 * @return {Stream}
 */
function concat() {
    var streams = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        streams[_i - 0] = arguments[_i];
    }
    return new index_1.Stream(new ConcatProducer(streams));
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = concat;

},{"../index":10}],8:[function(require,module,exports){
"use strict";
var index_1 = require('../index');
var DelayOperator = (function () {
    function DelayOperator(dt, ins) {
        this.dt = dt;
        this.ins = ins;
        this.type = 'delay';
        this.out = null;
    }
    DelayOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    DelayOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = null;
    };
    DelayOperator.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._n(t);
            clearInterval(id);
        }, this.dt);
    };
    DelayOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._e(err);
            clearInterval(id);
        }, this.dt);
    };
    DelayOperator.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._c();
            clearInterval(id);
        }, this.dt);
    };
    return DelayOperator;
}());
/**
 * Delays periodic events by a given time period.
 *
 * Marble diagram:
 *
 * ```text
 * 1----2--3--4----5|
 *     delay(60)
 * ---1----2--3--4----5|
 * ```
 *
 * Example:
 *
 * ```js
 * import fromDiagram from 'xstream/extra/fromDiagram'
 * import delay from 'xstream/extra/delay'
 *
 * const stream = fromDiagram('1----2--3--4----5|')
 *  .compose(delay(60))
 *
 * stream.addListener({
 *   next: i => console.log(i),
 *   error: err => console.error(err),
 *   complete: () => console.log('completed')
 * })
 * ```
 *
 * ```text
 * > 1  (after 60 ms)
 * > 2  (after 160 ms)
 * > 3  (after 220 ms)
 * > 4  (after 280 ms)
 * > 5  (after 380 ms)
 * > completed
 * ```
 *
 * @param {number} period The amount of silence required in milliseconds.
 * @return {Stream}
 */
function delay(period) {
    return function delayOperator(ins) {
        return new index_1.Stream(new DelayOperator(period, ins));
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = delay;

},{"../index":10}],9:[function(require,module,exports){
"use strict";
var index_1 = require('../index');
var FCIL = (function () {
    function FCIL(out, op) {
        this.out = out;
        this.op = op;
    }
    FCIL.prototype._n = function (t) {
        this.out._n(t);
    };
    FCIL.prototype._e = function (err) {
        this.out._e(err);
    };
    FCIL.prototype._c = function () {
        this.op.less();
    };
    return FCIL;
}());
var FlattenConcOperator = (function () {
    function FlattenConcOperator(ins) {
        this.ins = ins;
        this.type = 'flattenConcurrently';
        this.active = 1; // number of outers and inners that have not yet ended
        this.out = null;
    }
    FlattenConcOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    FlattenConcOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.active = 1;
        this.out = null;
    };
    FlattenConcOperator.prototype.less = function () {
        if (--this.active === 0) {
            var u = this.out;
            if (!u)
                return;
            u._c();
        }
    };
    FlattenConcOperator.prototype._n = function (s) {
        var u = this.out;
        if (!u)
            return;
        this.active++;
        s._add(new FCIL(u, this));
    };
    FlattenConcOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    FlattenConcOperator.prototype._c = function () {
        this.less();
    };
    return FlattenConcOperator;
}());
exports.FlattenConcOperator = FlattenConcOperator;
/**
 * Flattens a "stream of streams", handling multiple concurrent nested streams
 * simultaneously.
 *
 * If the input stream is a stream that emits streams, then this operator will
 * return an output stream which is a flat stream: emits regular events. The
 * flattening happens concurrently. It works like this: when the input stream
 * emits a nested stream, *flattenConcurrently* will start imitating that
 * nested one. When the next nested stream is emitted on the input stream,
 * *flattenConcurrently* will also imitate that new one, but will continue to
 * imitate the previous nested streams as well.
 *
 * Marble diagram:
 *
 * ```text
 * --+--------+---------------
 *   \        \
 *    \       ----1----2---3--
 *    --a--b----c----d--------
 *     flattenConcurrently
 * -----a--b----c-1--d-2---3--
 * ```
 *
 * @return {Stream}
 */
function flattenConcurrently(ins) {
    return new index_1.Stream(new FlattenConcOperator(ins));
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = flattenConcurrently;

},{"../index":10}],10:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var symbol_observable_1 = require('symbol-observable');
var NO = {};
exports.NO = NO;
function noop() { }
function copy(a) {
    var l = a.length;
    var b = Array(l);
    for (var i = 0; i < l; ++i) {
        b[i] = a[i];
    }
    return b;
}
function and(f1, f2) {
    return function andFn(t) {
        return f1(t) && f2(t);
    };
}
function _try(c, t, u) {
    try {
        return c.f(t);
    }
    catch (e) {
        u._e(e);
        return NO;
    }
}
var NO_IL = {
    _n: noop,
    _e: noop,
    _c: noop,
};
exports.NO_IL = NO_IL;
// mutates the input
function internalizeProducer(producer) {
    producer._start =
        function _start(il) {
            il.next = il._n;
            il.error = il._e;
            il.complete = il._c;
            this.start(il);
        };
    producer._stop = producer.stop;
}
var StreamSub = (function () {
    function StreamSub(_stream, _listener) {
        this._stream = _stream;
        this._listener = _listener;
    }
    StreamSub.prototype.unsubscribe = function () {
        this._stream.removeListener(this._listener);
    };
    return StreamSub;
}());
var Observer = (function () {
    function Observer(_listener) {
        this._listener = _listener;
    }
    Observer.prototype.next = function (value) {
        this._listener._n(value);
    };
    Observer.prototype.error = function (err) {
        this._listener._e(err);
    };
    Observer.prototype.complete = function () {
        this._listener._c();
    };
    return Observer;
}());
var FromObservable = (function () {
    function FromObservable(observable) {
        this.type = 'fromObservable';
        this.ins = observable;
        this.active = false;
    }
    FromObservable.prototype._start = function (out) {
        this.out = out;
        this.active = true;
        this._sub = this.ins.subscribe(new Observer(out));
        if (!this.active)
            this._sub.unsubscribe();
    };
    FromObservable.prototype._stop = function () {
        if (this._sub)
            this._sub.unsubscribe();
        this.active = false;
    };
    return FromObservable;
}());
var Merge = (function () {
    function Merge(insArr) {
        this.type = 'merge';
        this.insArr = insArr;
        this.out = NO;
        this.ac = 0;
    }
    Merge.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var L = s.length;
        this.ac = L;
        for (var i = 0; i < L; i++) {
            s[i]._add(this);
        }
    };
    Merge.prototype._stop = function () {
        var s = this.insArr;
        var L = s.length;
        for (var i = 0; i < L; i++) {
            s[i]._remove(this);
        }
        this.out = NO;
    };
    Merge.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    Merge.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Merge.prototype._c = function () {
        if (--this.ac <= 0) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    return Merge;
}());
var CombineListener = (function () {
    function CombineListener(i, out, p) {
        this.i = i;
        this.out = out;
        this.p = p;
        p.ils.push(this);
    }
    CombineListener.prototype._n = function (t) {
        var p = this.p, out = this.out;
        if (out === NO)
            return;
        if (p.up(t, this.i)) {
            out._n(p.vals);
        }
    };
    CombineListener.prototype._e = function (err) {
        var out = this.out;
        if (out === NO)
            return;
        out._e(err);
    };
    CombineListener.prototype._c = function () {
        var p = this.p;
        if (p.out === NO)
            return;
        if (--p.Nc === 0) {
            p.out._c();
        }
    };
    return CombineListener;
}());
var Combine = (function () {
    function Combine(insArr) {
        this.type = 'combine';
        this.insArr = insArr;
        this.out = NO;
        this.ils = [];
        this.Nc = this.Nn = 0;
        this.vals = [];
    }
    Combine.prototype.up = function (t, i) {
        var v = this.vals[i];
        var Nn = !this.Nn ? 0 : v === NO ? --this.Nn : this.Nn;
        this.vals[i] = t;
        return Nn === 0;
    };
    Combine.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var n = this.Nc = this.Nn = s.length;
        var vals = this.vals = new Array(n);
        if (n === 0) {
            out._n([]);
            out._c();
        }
        else {
            for (var i = 0; i < n; i++) {
                vals[i] = NO;
                s[i]._add(new CombineListener(i, out, this));
            }
        }
    };
    Combine.prototype._stop = function () {
        var s = this.insArr;
        var n = s.length;
        var ils = this.ils;
        for (var i = 0; i < n; i++) {
            s[i]._remove(ils[i]);
        }
        this.out = NO;
        this.ils = [];
        this.vals = [];
    };
    return Combine;
}());
var FromArray = (function () {
    function FromArray(a) {
        this.type = 'fromArray';
        this.a = a;
    }
    FromArray.prototype._start = function (out) {
        var a = this.a;
        for (var i = 0, l = a.length; i < l; i++) {
            out._n(a[i]);
        }
        out._c();
    };
    FromArray.prototype._stop = function () {
    };
    return FromArray;
}());
var FromPromise = (function () {
    function FromPromise(p) {
        this.type = 'fromPromise';
        this.on = false;
        this.p = p;
    }
    FromPromise.prototype._start = function (out) {
        var prod = this;
        this.on = true;
        this.p.then(function (v) {
            if (prod.on) {
                out._n(v);
                out._c();
            }
        }, function (e) {
            out._e(e);
        }).then(noop, function (err) {
            setTimeout(function () { throw err; });
        });
    };
    FromPromise.prototype._stop = function () {
        this.on = false;
    };
    return FromPromise;
}());
var Periodic = (function () {
    function Periodic(period) {
        this.type = 'periodic';
        this.period = period;
        this.intervalID = -1;
        this.i = 0;
    }
    Periodic.prototype._start = function (out) {
        var self = this;
        function intervalHandler() { out._n(self.i++); }
        this.intervalID = setInterval(intervalHandler, this.period);
    };
    Periodic.prototype._stop = function () {
        if (this.intervalID !== -1)
            clearInterval(this.intervalID);
        this.intervalID = -1;
        this.i = 0;
    };
    return Periodic;
}());
var Debug = (function () {
    function Debug(ins, arg) {
        this.type = 'debug';
        this.ins = ins;
        this.out = NO;
        this.s = noop;
        this.l = '';
        if (typeof arg === 'string') {
            this.l = arg;
        }
        else if (typeof arg === 'function') {
            this.s = arg;
        }
    }
    Debug.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    Debug.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Debug.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var s = this.s, l = this.l;
        if (s !== noop) {
            try {
                s(t);
            }
            catch (e) {
                u._e(e);
            }
        }
        else if (l) {
            console.log(l + ':', t);
        }
        else {
            console.log(t);
        }
        u._n(t);
    };
    Debug.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Debug.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Debug;
}());
var Drop = (function () {
    function Drop(max, ins) {
        this.type = 'drop';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.dropped = 0;
    }
    Drop.prototype._start = function (out) {
        this.out = out;
        this.dropped = 0;
        this.ins._add(this);
    };
    Drop.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Drop.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        if (this.dropped++ >= this.max)
            u._n(t);
    };
    Drop.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Drop.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Drop;
}());
var EndWhenListener = (function () {
    function EndWhenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    EndWhenListener.prototype._n = function () {
        this.op.end();
    };
    EndWhenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    EndWhenListener.prototype._c = function () {
        this.op.end();
    };
    return EndWhenListener;
}());
var EndWhen = (function () {
    function EndWhen(o, ins) {
        this.type = 'endWhen';
        this.ins = ins;
        this.out = NO;
        this.o = o;
        this.oil = NO_IL;
    }
    EndWhen.prototype._start = function (out) {
        this.out = out;
        this.o._add(this.oil = new EndWhenListener(out, this));
        this.ins._add(this);
    };
    EndWhen.prototype._stop = function () {
        this.ins._remove(this);
        this.o._remove(this.oil);
        this.out = NO;
        this.oil = NO_IL;
    };
    EndWhen.prototype.end = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    EndWhen.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    EndWhen.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    EndWhen.prototype._c = function () {
        this.end();
    };
    return EndWhen;
}());
var Filter = (function () {
    function Filter(passes, ins) {
        this.type = 'filter';
        this.ins = ins;
        this.out = NO;
        this.f = passes;
    }
    Filter.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    Filter.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Filter.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO || !r)
            return;
        u._n(t);
    };
    Filter.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Filter.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Filter;
}());
var FlattenListener = (function () {
    function FlattenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    FlattenListener.prototype._n = function (t) {
        this.out._n(t);
    };
    FlattenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    FlattenListener.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return FlattenListener;
}());
var Flatten = (function () {
    function Flatten(ins) {
        this.type = 'flatten';
        this.ins = ins;
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = NO_IL;
    }
    Flatten.prototype._start = function (out) {
        this.out = out;
        this.open = true;
        this.inner = NO;
        this.il = NO_IL;
        this.ins._add(this);
    };
    Flatten.prototype._stop = function () {
        this.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = NO_IL;
    };
    Flatten.prototype.less = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (!this.open && this.inner === NO)
            u._c();
    };
    Flatten.prototype._n = function (s) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        if (inner !== NO && il !== NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new FlattenListener(u, this));
    };
    Flatten.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Flatten.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return Flatten;
}());
var Fold = (function () {
    function Fold(f, seed, ins) {
        var _this = this;
        this.type = 'fold';
        this.ins = ins;
        this.out = NO;
        this.f = function (t) { return f(_this.acc, t); };
        this.acc = this.seed = seed;
    }
    Fold.prototype._start = function (out) {
        this.out = out;
        this.acc = this.seed;
        out._n(this.acc);
        this.ins._add(this);
    };
    Fold.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.acc = this.seed;
    };
    Fold.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO)
            return;
        u._n(this.acc = r);
    };
    Fold.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Fold.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Fold;
}());
var Last = (function () {
    function Last(ins) {
        this.type = 'last';
        this.ins = ins;
        this.out = NO;
        this.has = false;
        this.val = NO;
    }
    Last.prototype._start = function (out) {
        this.out = out;
        this.has = false;
        this.ins._add(this);
    };
    Last.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.val = NO;
    };
    Last.prototype._n = function (t) {
        this.has = true;
        this.val = t;
    };
    Last.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Last.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (this.has) {
            u._n(this.val);
            u._c();
        }
        else {
            u._e('TODO show proper error');
        }
    };
    return Last;
}());
var MapFlattenListener = (function () {
    function MapFlattenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    MapFlattenListener.prototype._n = function (r) {
        this.out._n(r);
    };
    MapFlattenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    MapFlattenListener.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return MapFlattenListener;
}());
var MapFlatten = (function () {
    function MapFlatten(mapOp) {
        this.type = mapOp.type + "+flatten";
        this.ins = mapOp.ins;
        this.out = NO;
        this.mapOp = mapOp;
        this.inner = NO;
        this.il = NO_IL;
        this.open = true;
    }
    MapFlatten.prototype._start = function (out) {
        this.out = out;
        this.inner = NO;
        this.il = NO_IL;
        this.open = true;
        this.mapOp.ins._add(this);
    };
    MapFlatten.prototype._stop = function () {
        this.mapOp.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.inner = NO;
        this.il = NO_IL;
    };
    MapFlatten.prototype.less = function () {
        if (!this.open && this.inner === NO) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    MapFlatten.prototype._n = function (v) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        var s = _try(this.mapOp, v, u);
        if (s === NO)
            return;
        if (inner !== NO && il !== NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new MapFlattenListener(u, this));
    };
    MapFlatten.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapFlatten.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return MapFlatten;
}());
var MapOp = (function () {
    function MapOp(project, ins) {
        this.type = 'map';
        this.ins = ins;
        this.out = NO;
        this.f = project;
    }
    MapOp.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    MapOp.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    MapOp.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO)
            return;
        u._n(r);
    };
    MapOp.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapOp.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return MapOp;
}());
var FilterMapFusion = (function (_super) {
    __extends(FilterMapFusion, _super);
    function FilterMapFusion(passes, project, ins) {
        _super.call(this, project, ins);
        this.type = 'filter+map';
        this.passes = passes;
    }
    FilterMapFusion.prototype._n = function (t) {
        if (!this.passes(t))
            return;
        var u = this.out;
        if (u === NO)
            return;
        var r = _try(this, t, u);
        if (r === NO)
            return;
        u._n(r);
    };
    return FilterMapFusion;
}(MapOp));
var Remember = (function () {
    function Remember(ins) {
        this.type = 'remember';
        this.ins = ins;
        this.out = NO;
    }
    Remember.prototype._start = function (out) {
        this.out = out;
        this.ins._add(out);
    };
    Remember.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return Remember;
}());
var ReplaceError = (function () {
    function ReplaceError(replacer, ins) {
        this.type = 'replaceError';
        this.ins = ins;
        this.out = NO;
        this.f = replacer;
    }
    ReplaceError.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    ReplaceError.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    ReplaceError.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    ReplaceError.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            this.ins._remove(this);
            (this.ins = this.f(err))._add(this);
        }
        catch (e) {
            u._e(e);
        }
    };
    ReplaceError.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return ReplaceError;
}());
var StartWith = (function () {
    function StartWith(ins, val) {
        this.type = 'startWith';
        this.ins = ins;
        this.out = NO;
        this.val = val;
    }
    StartWith.prototype._start = function (out) {
        this.out = out;
        this.out._n(this.val);
        this.ins._add(out);
    };
    StartWith.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return StartWith;
}());
var Take = (function () {
    function Take(max, ins) {
        this.type = 'take';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.taken = 0;
    }
    Take.prototype._start = function (out) {
        this.out = out;
        this.taken = 0;
        if (this.max <= 0) {
            out._c();
        }
        else {
            this.ins._add(this);
        }
    };
    Take.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    Take.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var m = ++this.taken;
        if (m < this.max) {
            u._n(t);
        }
        else if (m === this.max) {
            u._n(t);
            u._c();
        }
    };
    Take.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    Take.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return Take;
}());
var Stream = (function () {
    function Stream(producer) {
        this._prod = producer || NO;
        this._ils = [];
        this._stopID = NO;
        this._dl = NO;
        this._d = false;
        this._target = NO;
        this._err = NO;
    }
    Stream.prototype._n = function (t) {
        var a = this._ils;
        var L = a.length;
        if (this._d)
            this._dl._n(t);
        if (L == 1)
            a[0]._n(t);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._n(t);
        }
    };
    Stream.prototype._e = function (err) {
        if (this._err !== NO)
            return;
        this._err = err;
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._e(err);
        if (L == 1)
            a[0]._e(err);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._e(err);
        }
        if (!this._d && L == 0)
            throw this._err;
    };
    Stream.prototype._c = function () {
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._c();
        if (L == 1)
            a[0]._c();
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._c();
        }
    };
    Stream.prototype._x = function () {
        if (this._ils.length === 0)
            return;
        if (this._prod !== NO)
            this._prod._stop();
        this._err = NO;
        this._ils = [];
    };
    Stream.prototype._stopNow = function () {
        // WARNING: code that calls this method should
        // first check if this._prod is valid (not `NO`)
        this._prod._stop();
        this._err = NO;
        this._stopID = NO;
    };
    Stream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1)
            return;
        if (this._stopID !== NO) {
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    Stream.prototype._remove = function (il) {
        var _this = this;
        var ta = this._target;
        if (ta !== NO)
            return ta._remove(il);
        var a = this._ils;
        var i = a.indexOf(il);
        if (i > -1) {
            a.splice(i, 1);
            if (this._prod !== NO && a.length <= 0) {
                this._err = NO;
                this._stopID = setTimeout(function () { return _this._stopNow(); });
            }
            else if (a.length === 1) {
                this._pruneCycles();
            }
        }
    };
    // If all paths stemming from `this` stream eventually end at `this`
    // stream, then we remove the single listener of `this` stream, to
    // force it to end its execution and dispose resources. This method
    // assumes as a precondition that this._ils has just one listener.
    Stream.prototype._pruneCycles = function () {
        if (this._hasNoSinks(this, [])) {
            this._remove(this._ils[0]);
        }
    };
    // Checks whether *there is no* path starting from `x` that leads to an end
    // listener (sink) in the stream graph, following edges A->B where B is a
    // listener of A. This means these paths constitute a cycle somehow. Is given
    // a trace of all visited nodes so far.
    Stream.prototype._hasNoSinks = function (x, trace) {
        if (trace.indexOf(x) !== -1) {
            return true;
        }
        else if (x.out === this) {
            return true;
        }
        else if (x.out && x.out !== NO) {
            return this._hasNoSinks(x.out, trace.concat(x));
        }
        else if (x._ils) {
            for (var i = 0, N = x._ils.length; i < N; i++) {
                if (!this._hasNoSinks(x._ils[i], trace.concat(x))) {
                    return false;
                }
            }
            return true;
        }
        else {
            return false;
        }
    };
    Stream.prototype.ctor = function () {
        return this instanceof MemoryStream ? MemoryStream : Stream;
    };
    /**
     * Adds a Listener to the Stream.
     *
     * @param {Listener} listener
     */
    Stream.prototype.addListener = function (listener) {
        listener._n = listener.next || noop;
        listener._e = listener.error || noop;
        listener._c = listener.complete || noop;
        this._add(listener);
    };
    /**
     * Removes a Listener from the Stream, assuming the Listener was added to it.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.removeListener = function (listener) {
        this._remove(listener);
    };
    /**
     * Adds a Listener to the Stream returning a Subscription to remove that
     * listener.
     *
     * @param {Listener} listener
     * @returns {Subscription}
     */
    Stream.prototype.subscribe = function (listener) {
        this.addListener(listener);
        return new StreamSub(this, listener);
    };
    /**
     * Add interop between most.js and RxJS 5
     *
     * @returns {Stream}
     */
    Stream.prototype[symbol_observable_1.default] = function () {
        return this;
    };
    /**
     * Creates a new Stream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {Stream}
     */
    Stream.create = function (producer) {
        if (producer) {
            if (typeof producer.start !== 'function'
                || typeof producer.stop !== 'function') {
                throw new Error('producer requires both start and stop functions');
            }
            internalizeProducer(producer); // mutates the input
        }
        return new Stream(producer);
    };
    /**
     * Creates a new MemoryStream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {MemoryStream}
     */
    Stream.createWithMemory = function (producer) {
        if (producer) {
            internalizeProducer(producer); // mutates the input
        }
        return new MemoryStream(producer);
    };
    /**
     * Creates a Stream that does nothing when started. It never emits any event.
     *
     * Marble diagram:
     *
     * ```text
     *          never
     * -----------------------
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.never = function () {
        return new Stream({ _start: noop, _stop: noop });
    };
    /**
     * Creates a Stream that immediately emits the "complete" notification when
     * started, and that's it.
     *
     * Marble diagram:
     *
     * ```text
     * empty
     * -|
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.empty = function () {
        return new Stream({
            _start: function (il) { il._c(); },
            _stop: noop,
        });
    };
    /**
     * Creates a Stream that immediately emits an "error" notification with the
     * value you passed as the `error` argument when the stream starts, and that's
     * it.
     *
     * Marble diagram:
     *
     * ```text
     * throw(X)
     * -X
     * ```
     *
     * @factory true
     * @param error The error event to emit on the created stream.
     * @return {Stream}
     */
    Stream.throw = function (error) {
        return new Stream({
            _start: function (il) { il._e(error); },
            _stop: noop,
        });
    };
    /**
     * Creates a stream from an Array, Promise, or an Observable.
     *
     * @factory true
     * @param {Array|Promise|Observable} input The input to make a stream from.
     * @return {Stream}
     */
    Stream.from = function (input) {
        if (typeof input[symbol_observable_1.default] === 'function') {
            return Stream.fromObservable(input);
        }
        else if (typeof input.then === 'function') {
            return Stream.fromPromise(input);
        }
        else if (Array.isArray(input)) {
            return Stream.fromArray(input);
        }
        throw new TypeError("Type of input to from() must be an Array, Promise, or Observable");
    };
    /**
     * Creates a Stream that immediately emits the arguments that you give to
     * *of*, then completes.
     *
     * Marble diagram:
     *
     * ```text
     * of(1,2,3)
     * 123|
     * ```
     *
     * @factory true
     * @param a The first value you want to emit as an event on the stream.
     * @param b The second value you want to emit as an event on the stream. One
     * or more of these values may be given as arguments.
     * @return {Stream}
     */
    Stream.of = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i - 0] = arguments[_i];
        }
        return Stream.fromArray(items);
    };
    /**
     * Converts an array to a stream. The returned stream will emit synchronously
     * all the items in the array, and then complete.
     *
     * Marble diagram:
     *
     * ```text
     * fromArray([1,2,3])
     * 123|
     * ```
     *
     * @factory true
     * @param {Array} array The array to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromArray = function (array) {
        return new Stream(new FromArray(array));
    };
    /**
     * Converts a promise to a stream. The returned stream will emit the resolved
     * value of the promise, and then complete. However, if the promise is
     * rejected, the stream will emit the corresponding error.
     *
     * Marble diagram:
     *
     * ```text
     * fromPromise( ----42 )
     * -----------------42|
     * ```
     *
     * @factory true
     * @param {Promise} promise The promise to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromPromise = function (promise) {
        return new Stream(new FromPromise(promise));
    };
    /**
     * Converts an Observable into a Stream.
     *
     * @factory true
     * @param {any} observable The observable to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromObservable = function (observable) {
        return new Stream(new FromObservable(observable));
    };
    /**
     * Creates a stream that periodically emits incremental numbers, every
     * `period` milliseconds.
     *
     * Marble diagram:
     *
     * ```text
     *     periodic(1000)
     * ---0---1---2---3---4---...
     * ```
     *
     * @factory true
     * @param {number} period The interval in milliseconds to use as a rate of
     * emission.
     * @return {Stream}
     */
    Stream.periodic = function (period) {
        return new Stream(new Periodic(period));
    };
    Stream.prototype._map = function (project) {
        var p = this._prod;
        var ctor = this.ctor();
        if (p instanceof Filter) {
            return new ctor(new FilterMapFusion(p.f, project, p.ins));
        }
        return new ctor(new MapOp(project, this));
    };
    /**
     * Transforms each event from the input Stream through a `project` function,
     * to get a Stream that emits those transformed events.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7------
     *    map(i => i * 10)
     * --10--30-50----70-----
     * ```
     *
     * @param {Function} project A function of type `(t: T) => U` that takes event
     * `t` of type `T` from the input Stream and produces an event of type `U`, to
     * be emitted on the output Stream.
     * @return {Stream}
     */
    Stream.prototype.map = function (project) {
        return this._map(project);
    };
    /**
     * It's like `map`, but transforms each input event to always the same
     * constant value on the output Stream.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7-----
     *       mapTo(10)
     * --10--10-10----10----
     * ```
     *
     * @param projectedValue A value to emit on the output Stream whenever the
     * input Stream emits any value.
     * @return {Stream}
     */
    Stream.prototype.mapTo = function (projectedValue) {
        var s = this.map(function () { return projectedValue; });
        var op = s._prod;
        op.type = op.type.replace('map', 'mapTo');
        return s;
    };
    /**
     * Only allows events that pass the test given by the `passes` argument.
     *
     * Each event from the input stream is given to the `passes` function. If the
     * function returns `true`, the event is forwarded to the output stream,
     * otherwise it is ignored and not forwarded.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2--3-----4-----5---6--7-8--
     *     filter(i => i % 2 === 0)
     * ------2--------4---------6----8--
     * ```
     *
     * @param {Function} passes A function of type `(t: T) +> boolean` that takes
     * an event from the input stream and checks if it passes, by returning a
     * boolean.
     * @return {Stream}
     */
    Stream.prototype.filter = function (passes) {
        var p = this._prod;
        if (p instanceof Filter) {
            return new Stream(new Filter(and(p.f, passes), p.ins));
        }
        return new Stream(new Filter(passes, this));
    };
    /**
     * Lets the first `amount` many events from the input stream pass to the
     * output stream, then makes the output stream complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *    take(3)
     * --a---b--c|
     * ```
     *
     * @param {number} amount How many events to allow from the input stream
     * before completing the output stream.
     * @return {Stream}
     */
    Stream.prototype.take = function (amount) {
        return new (this.ctor())(new Take(amount, this));
    };
    /**
     * Ignores the first `amount` many events from the input stream, and then
     * after that starts forwarding events from the input stream to the output
     * stream.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *       drop(3)
     * --------------d---e--
     * ```
     *
     * @param {number} amount How many events to ignore from the input stream
     * before forwarding all events from the input stream to the output stream.
     * @return {Stream}
     */
    Stream.prototype.drop = function (amount) {
        return new Stream(new Drop(amount, this));
    };
    /**
     * When the input stream completes, the output stream will emit the last event
     * emitted by the input stream, and then will also complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c--d----|
     *       last()
     * -----------------d|
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.last = function () {
        return new Stream(new Last(this));
    };
    /**
     * Prepends the given `initial` value to the sequence of events emitted by the
     * input stream. The returned stream is a MemoryStream, which means it is
     * already `remember()`'d.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3---
     *   startWith(0)
     * 0--1---2-----3---
     * ```
     *
     * @param initial The value or event to prepend.
     * @return {MemoryStream}
     */
    Stream.prototype.startWith = function (initial) {
        return new MemoryStream(new StartWith(this, initial));
    };
    /**
     * Uses another stream to determine when to complete the current stream.
     *
     * When the given `other` stream emits an event or completes, the output
     * stream will complete. Before that happens, the output stream will behaves
     * like the input stream.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3--4----5----6---
     *   endWhen( --------a--b--| )
     * ---1---2-----3--4--|
     * ```
     *
     * @param other Some other stream that is used to know when should the output
     * stream of this operator complete.
     * @return {Stream}
     */
    Stream.prototype.endWhen = function (other) {
        return new (this.ctor())(new EndWhen(other, this));
    };
    /**
     * "Folds" the stream onto itself.
     *
     * Combines events from the past throughout
     * the entire execution of the input stream, allowing you to accumulate them
     * together. It's essentially like `Array.prototype.reduce`. The returned
     * stream is a MemoryStream, which means it is already `remember()`'d.
     *
     * The output stream starts by emitting the `seed` which you give as argument.
     * Then, when an event happens on the input stream, it is combined with that
     * seed value through the `accumulate` function, and the output value is
     * emitted on the output stream. `fold` remembers that output value as `acc`
     * ("accumulator"), and then when a new input event `t` happens, `acc` will be
     * combined with that to produce the new `acc` and so forth.
     *
     * Marble diagram:
     *
     * ```text
     * ------1-----1--2----1----1------
     *   fold((acc, x) => acc + x, 3)
     * 3-----4-----5--7----8----9------
     * ```
     *
     * @param {Function} accumulate A function of type `(acc: R, t: T) => R` that
     * takes the previous accumulated value `acc` and the incoming event from the
     * input stream and produces the new accumulated value.
     * @param seed The initial accumulated value, of type `R`.
     * @return {MemoryStream}
     */
    Stream.prototype.fold = function (accumulate, seed) {
        return new MemoryStream(new Fold(accumulate, seed, this));
    };
    /**
     * Replaces an error with another stream.
     *
     * When (and if) an error happens on the input stream, instead of forwarding
     * that error to the output stream, *replaceError* will call the `replace`
     * function which returns the stream that the output stream will replicate.
     * And, in case that new stream also emits an error, `replace` will be called
     * again to get another stream to start replicating.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2-----3--4-----X
     *   replaceError( () => --10--| )
     * --1---2-----3--4--------10--|
     * ```
     *
     * @param {Function} replace A function of type `(err) => Stream` that takes
     * the error that occurred on the input stream or on the previous replacement
     * stream and returns a new stream. The output stream will behave like the
     * stream that this function returns.
     * @return {Stream}
     */
    Stream.prototype.replaceError = function (replace) {
        return new (this.ctor())(new ReplaceError(replace, this));
    };
    /**
     * Flattens a "stream of streams", handling only one nested stream at a time
     * (no concurrency).
     *
     * If the input stream is a stream that emits streams, then this operator will
     * return an output stream which is a flat stream: emits regular events. The
     * flattening happens without concurrency. It works like this: when the input
     * stream emits a nested stream, *flatten* will start imitating that nested
     * one. However, as soon as the next nested stream is emitted on the input
     * stream, *flatten* will forget the previous nested one it was imitating, and
     * will start imitating the new nested one.
     *
     * Marble diagram:
     *
     * ```text
     * --+--------+---------------
     *   \        \
     *    \       ----1----2---3--
     *    --a--b----c----d--------
     *           flatten
     * -----a--b------1----2---3--
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.flatten = function () {
        var p = this._prod;
        return new Stream(p instanceof MapOp && !(p instanceof FilterMapFusion) ?
            new MapFlatten(p) :
            new Flatten(this));
    };
    /**
     * Passes the input stream to a custom operator, to produce an output stream.
     *
     * *compose* is a handy way of using an existing function in a chained style.
     * Instead of writing `outStream = f(inStream)` you can write
     * `outStream = inStream.compose(f)`.
     *
     * @param {function} operator A function that takes a stream as input and
     * returns a stream as well.
     * @return {Stream}
     */
    Stream.prototype.compose = function (operator) {
        return operator(this);
    };
    /**
     * Returns an output stream that behaves like the input stream, but also
     * remembers the most recent event that happens on the input stream, so that a
     * newly added listener will immediately receive that memorised event.
     *
     * @return {MemoryStream}
     */
    Stream.prototype.remember = function () {
        return new MemoryStream(new Remember(this));
    };
    /**
     * Returns an output stream that identically behaves like the input stream,
     * but also runs a `spy` function fo each event, to help you debug your app.
     *
     * *debug* takes a `spy` function as argument, and runs that for each event
     * happening on the input stream. If you don't provide the `spy` argument,
     * then *debug* will just `console.log` each event. This helps you to
     * understand the flow of events through some operator chain.
     *
     * Please note that if the output stream has no listeners, then it will not
     * start, which means `spy` will never run because no actual event happens in
     * that case.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3-----4--
     *         debug
     * --1----2-----3-----4--
     * ```
     *
     * @param {function} labelOrSpy A string to use as the label when printing
     * debug information on the console, or a 'spy' function that takes an event
     * as argument, and does not need to return anything.
     * @return {Stream}
     */
    Stream.prototype.debug = function (labelOrSpy) {
        return new (this.ctor())(new Debug(this, labelOrSpy));
    };
    /**
     * *imitate* changes this current Stream to emit the same events that the
     * `other` given Stream does. This method returns nothing.
     *
     * This method exists to allow one thing: **circular dependency of streams**.
     * For instance, let's imagine that for some reason you need to create a
     * circular dependency where stream `first$` depends on stream `second$`
     * which in turn depends on `first$`:
     *
     * <!-- skip-example -->
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var first$ = second$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * ```
     *
     * However, that is invalid JavaScript, because `second$` is undefined
     * on the first line. This is how *imitate* can help solve it:
     *
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var secondProxy$ = xs.create();
     * var first$ = secondProxy$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * secondProxy$.imitate(second$);
     * ```
     *
     * We create `secondProxy$` before the others, so it can be used in the
     * declaration of `first$`. Then, after both `first$` and `second$` are
     * defined, we hook `secondProxy$` with `second$` with `imitate()` to tell
     * that they are "the same". `imitate` will not trigger the start of any
     * stream, it just binds `secondProxy$` and `second$` together.
     *
     * The following is an example where `imitate()` is important in Cycle.js
     * applications. A parent component contains some child components. A child
     * has an action stream which is given to the parent to define its state:
     *
     * <!-- skip-example -->
     * ```js
     * const childActionProxy$ = xs.create();
     * const parent = Parent({...sources, childAction$: childActionProxy$});
     * const childAction$ = parent.state$.map(s => s.child.action$).flatten();
     * childActionProxy$.imitate(childAction$);
     * ```
     *
     * Note, though, that **`imitate()` does not support MemoryStreams**. If we
     * would attempt to imitate a MemoryStream in a circular dependency, we would
     * either get a race condition (where the symptom would be "nothing happens")
     * or an infinite cyclic emission of values. It's useful to think about
     * MemoryStreams as cells in a spreadsheet. It doesn't make any sense to
     * define a spreadsheet cell `A1` with a formula that depends on `B1` and
     * cell `B1` defined with a formula that depends on `A1`.
     *
     * If you find yourself wanting to use `imitate()` with a
     * MemoryStream, you should rework your code around `imitate()` to use a
     * Stream instead. Look for the stream in the circular dependency that
     * represents an event stream, and that would be a candidate for creating a
     * proxy Stream which then imitates the target Stream.
     *
     * @param {Stream} target The other stream to imitate on the current one. Must
     * not be a MemoryStream.
     */
    Stream.prototype.imitate = function (target) {
        if (target instanceof MemoryStream) {
            throw new Error('A MemoryStream was given to imitate(), but it only ' +
                'supports a Stream. Read more about this restriction here: ' +
                'https://github.com/staltz/xstream#faq');
        }
        this._target = target;
        for (var ils = this._ils, N = ils.length, i = 0; i < N; i++) {
            target._add(ils[i]);
        }
        this._ils = [];
    };
    /**
     * Forces the Stream to emit the given value to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param value The "next" value you want to broadcast to all listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendNext = function (value) {
        this._n(value);
    };
    /**
     * Forces the Stream to emit the given error to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param {any} error The error you want to broadcast to all the listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendError = function (error) {
        this._e(error);
    };
    /**
     * Forces the Stream to emit the "completed" event to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     */
    Stream.prototype.shamefullySendComplete = function () {
        this._c();
    };
    /**
     * Adds a "debug" listener to the stream. There can only be one debug
     * listener, that's why this is 'setDebugListener'. To remove the debug
     * listener, just call setDebugListener(null).
     *
     * A debug listener is like any other listener. The only difference is that a
     * debug listener is "stealthy": its presence/absence does not trigger the
     * start/stop of the stream (or the producer inside the stream). This is
     * useful so you can inspect what is going on without changing the behavior
     * of the program. If you have an idle stream and you add a normal listener to
     * it, the stream will start executing. But if you set a debug listener on an
     * idle stream, it won't start executing (not until the first normal listener
     * is added).
     *
     * As the name indicates, we don't recommend using this method to build app
     * logic. In fact, in most cases the debug operator works just fine. Only use
     * this one if you know what you're doing.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.setDebugListener = function (listener) {
        if (!listener) {
            this._d = false;
            this._dl = NO;
        }
        else {
            this._d = true;
            listener._n = listener.next || noop;
            listener._e = listener.error || noop;
            listener._c = listener.complete || noop;
            this._dl = listener;
        }
    };
    /**
     * Blends multiple streams together, emitting events from all of them
     * concurrently.
     *
     * *merge* takes multiple streams as arguments, and creates a stream that
     * behaves like each of the argument streams, in parallel.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b----c---d------
     *            merge
     * --1-a--2--b--3-c---d--4---
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to merge together with other streams.
     * @param {Stream} stream2 A stream to merge together with other streams. Two
     * or more streams may be given as arguments.
     * @return {Stream}
     */
    Stream.merge = function merge() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new Merge(streams));
    };
    /**
     * Combines multiple input streams together to return a stream whose events
     * are arrays that collect the latest events from each input stream.
     *
     * *combine* internally remembers the most recent event from each of the input
     * streams. When any of the input streams emits an event, that event together
     * with all the other saved events are combined into an array. That array will
     * be emitted on the output stream. It's essentially a way of joining together
     * the events from multiple streams.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b-----c--d------
     *          combine
     * ----1a-2a-2b-3b-3c-3d-4d--
     * ```
     *
     * Note: to minimize garbage collection, *combine* uses the same array
     * instance for each emission.  If you need to compare emissions over time,
     * cache the values with `map` first:
     *
     * ```js
     * import pairwise from 'xstream/extra/pairwise'
     *
     * const stream1 = xs.of(1);
     * const stream2 = xs.of(2);
     *
     * xs.combine(stream1, stream2).map(
     *   combinedEmissions => ([ ...combinedEmissions ])
     * ).compose(pairwise)
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to combine together with other streams.
     * @param {Stream} stream2 A stream to combine together with other streams.
     * Multiple streams, not just two, may be given as arguments.
     * @return {Stream}
     */
    Stream.combine = function combine() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new Combine(streams));
    };
    return Stream;
}());
exports.Stream = Stream;
var MemoryStream = (function (_super) {
    __extends(MemoryStream, _super);
    function MemoryStream(producer) {
        _super.call(this, producer);
        this._has = false;
    }
    MemoryStream.prototype._n = function (x) {
        this._v = x;
        this._has = true;
        _super.prototype._n.call(this, x);
    };
    MemoryStream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1) {
            if (this._has)
                il._n(this._v);
            return;
        }
        if (this._stopID !== NO) {
            if (this._has)
                il._n(this._v);
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else if (this._has)
            il._n(this._v);
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    MemoryStream.prototype._stopNow = function () {
        this._has = false;
        _super.prototype._stopNow.call(this);
    };
    MemoryStream.prototype._x = function () {
        this._has = false;
        _super.prototype._x.call(this);
    };
    MemoryStream.prototype.map = function (project) {
        return this._map(project);
    };
    MemoryStream.prototype.mapTo = function (projectedValue) {
        return _super.prototype.mapTo.call(this, projectedValue);
    };
    MemoryStream.prototype.take = function (amount) {
        return _super.prototype.take.call(this, amount);
    };
    MemoryStream.prototype.endWhen = function (other) {
        return _super.prototype.endWhen.call(this, other);
    };
    MemoryStream.prototype.replaceError = function (replace) {
        return _super.prototype.replaceError.call(this, replace);
    };
    MemoryStream.prototype.remember = function () {
        return this;
    };
    MemoryStream.prototype.debug = function (labelOrSpy) {
        return _super.prototype.debug.call(this, labelOrSpy);
    };
    return MemoryStream;
}(Stream));
exports.MemoryStream = MemoryStream;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Stream;

},{"symbol-observable":4}],11:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Functor = require("../Data.Functor");
var Data_Semigroup = require("../Data.Semigroup");
var Alt = function (__superclass_Data$dotFunctor$dotFunctor_0, alt) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.alt = alt;
};
var altArray = new Alt(function () {
    return Data_Functor.functorArray;
}, Data_Semigroup.append(Data_Semigroup.semigroupArray));
var alt = function (dict) {
    return dict.alt;
};
module.exports = {
    Alt: Alt, 
    alt: alt, 
    altArray: altArray
};

},{"../Data.Functor":93,"../Data.Semigroup":123}],12:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Alternative = function (__superclass_Control$dotApplicative$dotApplicative_0, __superclass_Control$dotPlus$dotPlus_1) {
    this["__superclass_Control.Applicative.Applicative_0"] = __superclass_Control$dotApplicative$dotApplicative_0;
    this["__superclass_Control.Plus.Plus_1"] = __superclass_Control$dotPlus$dotPlus_1;
};
var alternativeArray = new Alternative(function () {
    return Control_Applicative.applicativeArray;
}, function () {
    return Control_Plus.plusArray;
});
module.exports = {
    Alternative: Alternative, 
    alternativeArray: alternativeArray
};

},{"../Control.Alt":11,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Plus":62,"../Data.Functor":93}],13:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Applicative = function (__superclass_Control$dotApply$dotApply_0, pure) {
    this["__superclass_Control.Apply.Apply_0"] = __superclass_Control$dotApply$dotApply_0;
    this.pure = pure;
};
var pure = function (dict) {
    return dict.pure;
};
var unless = function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (!v) {
                return v1;
            };
            if (v) {
                return pure(dictApplicative)(Data_Unit.unit);
            };
            throw new Error("Failed pattern match at Control.Applicative line 63, column 1 - line 63, column 19: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var when = function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v) {
                return v1;
            };
            if (!v) {
                return pure(dictApplicative)(Data_Unit.unit);
            };
            throw new Error("Failed pattern match at Control.Applicative line 58, column 1 - line 58, column 16: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var liftA1 = function (dictApplicative) {
    return function (f) {
        return function (a) {
            return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(pure(dictApplicative)(f))(a);
        };
    };
};
var applicativeFn = new Applicative(function () {
    return Control_Apply.applyFn;
}, function (x) {
    return function (v) {
        return x;
    };
});
var applicativeArray = new Applicative(function () {
    return Control_Apply.applyArray;
}, function (x) {
    return [ x ];
});
module.exports = {
    Applicative: Applicative, 
    liftA1: liftA1, 
    pure: pure, 
    unless: unless, 
    when: when, 
    applicativeFn: applicativeFn, 
    applicativeArray: applicativeArray
};

},{"../Control.Apply":15,"../Data.Functor":93,"../Data.Unit":140}],14:[function(require,module,exports){
"use strict";

exports.arrayApply = function (fs) {
  return function (xs) {
    var result = [];
    var n = 0;
    for (var i = 0, l = fs.length; i < l; i++) {
      for (var j = 0, k = xs.length; j < k; j++) {
        result[n++] = fs[i](xs[j]);
      }
    }
    return result;
  };
};

},{}],15:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var Apply = function (__superclass_Data$dotFunctor$dotFunctor_0, apply) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.apply = apply;
};
var applyFn = new Apply(function () {
    return Data_Functor.functorFn;
}, function (f) {
    return function (g) {
        return function (x) {
            return f(x)(g(x));
        };
    };
});
var applyArray = new Apply(function () {
    return Data_Functor.functorArray;
}, $foreign.arrayApply);
var apply = function (dict) {
    return dict.apply;
};
var applyFirst = function (dictApply) {
    return function (a) {
        return function (b) {
            return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Data_Function["const"])(a))(b);
        };
    };
};
var applySecond = function (dictApply) {
    return function (a) {
        return function (b) {
            return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(a))(b);
        };
    };
};
var lift2 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b);
            };
        };
    };
};
var lift3 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b))(c);
                };
            };
        };
    };
};
var lift4 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return apply(dictApply)(apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b))(c))(d);
                    };
                };
            };
        };
    };
};
var lift5 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return apply(dictApply)(apply(dictApply)(apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b))(c))(d))(e);
                        };
                    };
                };
            };
        };
    };
};
module.exports = {
    Apply: Apply, 
    apply: apply, 
    applyFirst: applyFirst, 
    applySecond: applySecond, 
    lift2: lift2, 
    lift3: lift3, 
    lift4: lift4, 
    lift5: lift5, 
    applyFn: applyFn, 
    applyArray: applyArray
};

},{"../Control.Category":20,"../Data.Function":89,"../Data.Functor":93,"./foreign":14}],16:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Biapply = require("../Control.Biapply");
var Biapplicative = function (__superclass_Control$dotBiapply$dotBiapply_0, bipure) {
    this["__superclass_Control.Biapply.Biapply_0"] = __superclass_Control$dotBiapply$dotBiapply_0;
    this.bipure = bipure;
};
var bipure = function (dict) {
    return dict.bipure;
};
module.exports = {
    Biapplicative: Biapplicative, 
    bipure: bipure
};

},{"../Control.Biapply":17}],17:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Function = require("../Data.Function");
var Data_Bifunctor = require("../Data.Bifunctor");
var Control_Category = require("../Control.Category");
var Biapply = function (__superclass_Data$dotBifunctor$dotBifunctor_0, biapply) {
    this["__superclass_Data.Bifunctor.Bifunctor_0"] = __superclass_Data$dotBifunctor$dotBifunctor_0;
    this.biapply = biapply;
};
var biapply = function (dict) {
    return dict.biapply;
};
var biapplyFirst = function (dictBiapply) {
    return function (a) {
        return function (b) {
            return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(Data_Function["const"](Control_Category.id(Control_Category.categoryFn))))(a))(b);
        };
    };
};
var biapplySecond = function (dictBiapply) {
    return function (a) {
        return function (b) {
            return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(Data_Function["const"])(Data_Function["const"]))(a))(b);
        };
    };
};
var bilift2 = function (dictBiapply) {
    return function (f) {
        return function (g) {
            return function (a) {
                return function (b) {
                    return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(f)(g))(a))(b);
                };
            };
        };
    };
};
var bilift3 = function (dictBiapply) {
    return function (f) {
        return function (g) {
            return function (a) {
                return function (b) {
                    return function (c) {
                        return biapply(dictBiapply)(biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(f)(g))(a))(b))(c);
                    };
                };
            };
        };
    };
};
module.exports = {
    Biapply: Biapply, 
    biapply: biapply, 
    biapplyFirst: biapplyFirst, 
    biapplySecond: biapplySecond, 
    bilift2: bilift2, 
    bilift3: bilift3
};

},{"../Control.Category":20,"../Data.Bifunctor":71,"../Data.Function":89}],18:[function(require,module,exports){
"use strict";

exports.arrayBind = function (arr) {
  return function (f) {
    var result = [];
    for (var i = 0, l = arr.length; i < l; i++) {
      Array.prototype.push.apply(result, f(arr[i]));
    }
    return result;
  };
};

},{}],19:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Bind = function (__superclass_Control$dotApply$dotApply_0, bind) {
    this["__superclass_Control.Apply.Apply_0"] = __superclass_Control$dotApply$dotApply_0;
    this.bind = bind;
};
var bindFn = new Bind(function () {
    return Control_Apply.applyFn;
}, function (m) {
    return function (f) {
        return function (x) {
            return f(m(x))(x);
        };
    };
});
var bindArray = new Bind(function () {
    return Control_Apply.applyArray;
}, $foreign.arrayBind);
var bind = function (dict) {
    return dict.bind;
};
var bindFlipped = function (dictBind) {
    return Data_Function.flip(bind(dictBind));
};
var composeKleisliFlipped = function (dictBind) {
    return function (f) {
        return function (g) {
            return function (a) {
                return bindFlipped(dictBind)(f)(g(a));
            };
        };
    };
};
var composeKleisli = function (dictBind) {
    return function (f) {
        return function (g) {
            return function (a) {
                return bind(dictBind)(f(a))(g);
            };
        };
    };
};
var ifM = function (dictBind) {
    return function (cond) {
        return function (t) {
            return function (f) {
                return bind(dictBind)(cond)(function (cond$prime) {
                    if (cond$prime) {
                        return t;
                    };
                    if (!cond$prime) {
                        return f;
                    };
                    throw new Error("Failed pattern match at Control.Bind line 103, column 35 - line 103, column 56: " + [ cond$prime.constructor.name ]);
                });
            };
        };
    };
};
var join = function (dictBind) {
    return function (m) {
        return bind(dictBind)(m)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Bind: Bind, 
    bind: bind, 
    bindFlipped: bindFlipped, 
    composeKleisli: composeKleisli, 
    composeKleisliFlipped: composeKleisliFlipped, 
    ifM: ifM, 
    join: join, 
    bindFn: bindFn, 
    bindArray: bindArray
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Data.Function":89,"../Data.Functor":93,"./foreign":18}],20:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Category = function (__superclass_Control$dotSemigroupoid$dotSemigroupoid_0, id) {
    this["__superclass_Control.Semigroupoid.Semigroupoid_0"] = __superclass_Control$dotSemigroupoid$dotSemigroupoid_0;
    this.id = id;
};
var id = function (dict) {
    return dict.id;
};
var categoryFn = new Category(function () {
    return Control_Semigroupoid.semigroupoidFn;
}, function (x) {
    return x;
});
module.exports = {
    Category: Category, 
    id: id, 
    categoryFn: categoryFn
};

},{"../Control.Semigroupoid":63}],21:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Extend = require("../Control.Extend");
var Data_Functor = require("../Data.Functor");
var Comonad = function (__superclass_Control$dotExtend$dotExtend_0, extract) {
    this["__superclass_Control.Extend.Extend_0"] = __superclass_Control$dotExtend$dotExtend_0;
    this.extract = extract;
};
var extract = function (dict) {
    return dict.extract;
};
module.exports = {
    Comonad: Comonad, 
    extract: extract
};

},{"../Control.Extend":24,"../Data.Functor":93}],22:[function(require,module,exports){
var Cycle = require('@cycle/xstream-run');
var xs = require('xstream').default;

function makeDriver(eff) {
  return function (sink) {
    return eff(sink)();
  };
}

exports._run1 = function (_main, _driver) {
  return function () {
    const stream = xs.create();

    const observer = {
      next: function (x) { stream.shamefullySendNext(x); },
      error: function (err) { stream.shamefullySendError(err); },
      complete: function () { stream.shamefullySendComplete(); },
    };

    var source = _driver(stream)();

    var sink = _main(source);

    sink.addListener(observer);
  };
};

exports._run2 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b);
      return {
        a: sinks.value0,
        b: sinks.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

exports._run3 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c);
      return {
        a: sinks.value0,
        b: sinks.value1.value0,
        c: sinks.value1.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0),
      c: makeDriver(_drivers.value1.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

exports._run4 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c)(sources.d);
      return {
        a: sinks.value0,
        b: sinks.value1.value0,
        c: sinks.value1.value1.value0,
        d: sinks.value1.value1.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0),
      c: makeDriver(_drivers.value1.value1.value0),
      d: makeDriver(_drivers.value1.value1.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

exports._run5 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c)(sources.d)(sources.e);
      return {
        a: sinks.value0,
        b: sinks.value1.value0,
        c: sinks.value1.value1.value0,
        d: sinks.value1.value1.value1.value0,
        e: sinks.value1.value1.value1.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0),
      c: makeDriver(_drivers.value1.value1.value0),
      d: makeDriver(_drivers.value1.value1.value1.value0),
      e: makeDriver(_drivers.value1.value1.value1.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

},{"@cycle/xstream-run":3,"xstream":10}],23:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_XStream = require("../Control.XStream");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Tuple_Nested = require("../Data.Tuple.Nested");
var run5 = function (main) {
    return function (drivers) {
        return $foreign._run5(main, drivers);
    };
};
var run4 = function (main) {
    return function (drivers) {
        return $foreign._run4(main, drivers);
    };
};
var run3 = function (main) {
    return function (drivers) {
        return $foreign._run3(main, drivers);
    };
};
var run2 = function (main) {
    return function (drivers) {
        return $foreign._run2(main, drivers);
    };
};
var run1 = function (main) {
    return function (drivers) {
        return $foreign._run1(main, drivers);
    };
};
var run = run1;
module.exports = {
    run: run, 
    run1: run1, 
    run2: run2, 
    run3: run3, 
    run4: run4, 
    run5: run5
};

},{"../Control.Monad.Eff":44,"../Control.XStream":65,"../Data.Function.Uncurried":88,"../Data.Tuple.Nested":135,"../Prelude":148,"./foreign":22}],24:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Category = require("../Control.Category");
var Data_Functor = require("../Data.Functor");
var Data_Semigroup = require("../Data.Semigroup");
var Extend = function (__superclass_Data$dotFunctor$dotFunctor_0, extend) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.extend = extend;
};
var extendFn = function (dictSemigroup) {
    return new Extend(function () {
        return Data_Functor.functorFn;
    }, function (f) {
        return function (g) {
            return function (w) {
                return f(function (w$prime) {
                    return g(Data_Semigroup.append(dictSemigroup)(w)(w$prime));
                });
            };
        };
    });
};
var extend = function (dict) {
    return dict.extend;
};
var extendFlipped = function (dictExtend) {
    return function (w) {
        return function (f) {
            return extend(dictExtend)(f)(w);
        };
    };
};
var duplicate = function (dictExtend) {
    return extend(dictExtend)(Control_Category.id(Control_Category.categoryFn));
};
var composeCoKleisliFlipped = function (dictExtend) {
    return function (f) {
        return function (g) {
            return function (w) {
                return f(extend(dictExtend)(g)(w));
            };
        };
    };
};
var composeCoKleisli = function (dictExtend) {
    return function (f) {
        return function (g) {
            return function (w) {
                return g(extend(dictExtend)(f)(w));
            };
        };
    };
};
module.exports = {
    Extend: Extend, 
    composeCoKleisli: composeCoKleisli, 
    composeCoKleisliFlipped: composeCoKleisliFlipped, 
    duplicate: duplicate, 
    extend: extend, 
    extendFlipped: extendFlipped, 
    extendFn: extendFn
};

},{"../Control.Category":20,"../Data.Functor":93,"../Data.Semigroup":123}],25:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Unit = require("../Data.Unit");
var Lazy = function (defer) {
    this.defer = defer;
};
var defer = function (dict) {
    return dict.defer;
};
var fix = function (dictLazy) {
    return function (f) {
        return defer(dictLazy)(function (v) {
            return f(fix(dictLazy)(f));
        });
    };
};
module.exports = {
    Lazy: Lazy, 
    defer: defer, 
    fix: fix
};

},{"../Data.Unit":140}],26:[function(require,module,exports){
"use strict";

exports._makeVar = function (nonCanceler) {
  return function (success) {
    success({
      consumers: [],
      producers: [],
      error: undefined
    });
    return nonCanceler;
  };
};

exports._takeVar = function (nonCanceler, avar) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else if (avar.producers.length > 0) {
      avar.producers.shift()(success, error);
    } else {
      avar.consumers.push({ peek: false, success: success, error: error });
    }

    return nonCanceler;
  };
};

exports._peekVar = function (nonCanceler, avar) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else if (avar.producers.length > 0) {
      avar.producers[0](success, error);
    } else {
      avar.consumers.push({ peek: true, success: success, error: error });
    }
    return nonCanceler;
  };
};

exports._putVar = function (nonCanceler, avar, a) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else {
      var shouldQueue = true;
      var consumers = [];
      var consumer;

      while (true) {
        consumer = avar.consumers.shift();
        if (consumer) {
          consumers.push(consumer);
          if (consumer.peek) {
            continue;
          } else {
            shouldQueue = false;
          }
        }
        break;
      }

      if (shouldQueue) {
        avar.producers.push(function (success) {
          success(a);
          return nonCanceler;
        });
      }

      for (var i = 0; i < consumers.length; i++) {
        consumers[i].success(a);
      }

      success({});
    }

    return nonCanceler;
  };
};

exports._killVar = function (nonCanceler, avar, e) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else {
      avar.error = e;
      while (avar.consumers.length) {
        avar.consumers.shift().error(e);
      }
      success({});
    }

    return nonCanceler;
  };
};

},{}],27:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
module.exports = {
    _killVar: $foreign._killVar, 
    _makeVar: $foreign._makeVar, 
    _peekVar: $foreign._peekVar, 
    _putVar: $foreign._putVar, 
    _takeVar: $foreign._takeVar
};

},{"../Control.Monad.Eff.Exception":36,"../Data.Function.Uncurried":88,"../Prelude":148,"./foreign":26}],28:[function(require,module,exports){
/* globals setTimeout, clearTimeout, setImmediate, clearImmediate */
"use strict";

exports._cancelWith = function (nonCanceler, aff, canceler1) {
  return function (success, error) {
    var canceler2 = aff(success, error);

    return function (e) {
      return function (success, error) {
        var cancellations = 0;
        var result = false;
        var errored = false;

        var s = function (bool) {
          cancellations = cancellations + 1;
          result = result || bool;

          if (cancellations === 2 && !errored) {
            success(result);
          }
        };

        var f = function (err) {
          if (!errored) {
            errored = true;
            error(err);
          }
        };

        canceler2(e)(s, f);
        canceler1(e)(s, f);

        return nonCanceler;
      };
    };
  };
};

exports._setTimeout = function (nonCanceler, millis, aff) {
  var set = setTimeout;
  var clear = clearTimeout;
  if (millis <= 0 && typeof setImmediate === "function") {
    set = setImmediate;
    clear = clearImmediate;
  }
  return function (success, error) {
    var canceler;

    var timeout = set(function () {
      canceler = aff(success, error);
    }, millis);

    return function (e) {
      return function (s, f) {
        if (canceler !== undefined) {
          return canceler(e)(s, f);
        } else {
          clear(timeout);
          s(true);
          return nonCanceler;
        }
      };
    };
  };
};

exports._unsafeInterleaveAff = function (aff) {
  return aff;
};

exports._forkAff = function (nonCanceler, aff) {
  var voidF = function () {};

  return function (success) {
    var canceler = aff(voidF, voidF);
    success(canceler);
    return nonCanceler;
  };
};

exports._forkAll = function (nonCanceler, foldl, affs) {
  var voidF = function () {};

  return function (success) {
    var cancelers = foldl(function (acc) {
      return function (aff) {
        acc.push(aff(voidF, voidF));
        return acc;
      };
    })([])(affs);

    var canceler = function (e) {
      return function (success, error) {
        var cancellations = 0;
        var result        = false;
        var errored       = false;

        var s = function (bool) {
          cancellations = cancellations + 1;
          result        = result || bool;

          if (cancellations === cancelers.length && !errored) {
            success(result);
          }
        };

        var f = function (err) {
          if (!errored) {
            errored = true;
            error(err);
          }
        };

        for (var i = 0; i < cancelers.length; i++) {
          cancelers[i](e)(s, f);
        }

        return nonCanceler;
      };
    };

    success(canceler);
    return nonCanceler;
  };
};

exports._makeAff = function (cb) {
  return function (success, error) {
    try {
      return cb(function (e) {
        return function () {
          error(e);
        };
      })(function (v) {
        return function () {
          success(v);
        };
      })();
    } catch (err) {
      error(err);
    }
  };
};

exports._pure = function (nonCanceler, v) {
  return function (success) {
    success(v);
    return nonCanceler;
  };
};

exports._throwError = function (nonCanceler, e) {
  return function (success, error) {
    error(e);
    return nonCanceler;
  };
};

exports._fmap = function (f, aff) {
  return function (success, error) {
    return aff(function (v) {
      success(f(v));
    }, error);
  };
};

exports._bind = function (alwaysCanceler, aff, f) {
  return function (success, error) {
    var canceler1, canceler2;

    var isCanceled    = false;
    var requestCancel = false;

    var onCanceler = function () {};

    canceler1 = aff(function (v) {
      if (requestCancel) {
        isCanceled = true;

        return alwaysCanceler;
      } else {
        canceler2 = f(v)(success, error);

        onCanceler(canceler2);

        return canceler2;
      }
    }, error);

    return function (e) {
      return function (s, f) {
        requestCancel = true;

        if (canceler2 !== undefined) {
          return canceler2(e)(s, f);
        } else {
          return canceler1(e)(function (bool) {
            if (bool || isCanceled) {
              s(true);
            } else {
              onCanceler = function (canceler) {
                canceler(e)(s, f);
              };
            }
          }, f);
        }
      };
    };
  };
};

exports._attempt = function (Left, Right, aff) {
  return function (success) {
    return aff(function (v) {
      success(Right(v));
    }, function (e) {
      success(Left(e));
    });
  };
};

exports._runAff = function (errorT, successT, aff) {
  // If errorT or successT throw, and an Aff is comprised only of synchronous
  // effects, then it's possible for makeAff/liftEff to accidentally catch
  // it, which may end up rerunning the Aff depending on error recovery
  // behavior. To mitigate this, we observe synchronicity using mutation. If
  // an Aff is observed to be synchronous, we let the stack reset and run the
  // handlers outside of the normal callback flow.
  return function () {
    var status = 0;
    var result, success;

    var canceler = aff(function (v) {
      if (status === 2) {
        successT(v)();
      } else {
        status = 1;
        result = v;
        success = true;
      }
    }, function (e) {
      if (status === 2) {
        errorT(e)();
      } else {
        status = 1;
        result = e;
        success = false;
      }
    });

    if (status === 1) {
      if (success) {
        successT(result)();
      } else {
        errorT(result)();
      }
    } else {
      status = 2;
    }

    return canceler;
  };
};

exports._liftEff = function (nonCanceler, e) {
  return function (success, error) {
    var result;
    try {
      result = e();
    } catch (err) {
      error(err);
      return nonCanceler;
    }

    success(result);
    return nonCanceler;
  };
};

exports._tailRecM = function (isLeft, f, a) {
  return function (success, error) {
    return function go (acc) {
      var result, status, canceler;

      // Observes synchronous effects using a flag.
      //   status = 0 (unresolved status)
      //   status = 1 (synchronous effect)
      //   status = 2 (asynchronous effect)

      var csuccess = function (v) {
        // If the status is still unresolved, we have observed a
        // synchronous effect. Otherwise, the status will be `2`.
        if (status === 0) {
          // Store the result for further synchronous processing.
          result = v;
          status = 1;
        } else {
          // When we have observed an asynchronous effect, we use normal
          // recursion. This is safe because we will be on a new stack.
          if (isLeft(v)) {
            go(v.value0);
          } else {
            success(v.value0);
          }
        }
      };

      while (true) {
        status = 0;
        canceler = f(acc)(csuccess, error);

        // If the status has already resolved to `1` by our Aff handler, then
        // we have observed a synchronous effect. Otherwise it will still be
        // `0`.
        if (status === 1) {
          // When we have observed a synchronous effect, we merely swap out the
          // accumulator and continue the loop, preserving stack.
          if (isLeft(result)) {
            acc = result.value0;
            continue;
          } else {
            success(result.value0);
          }
        } else {
          // If the status has not resolved yet, then we have observed an
          // asynchronous effect.
          status = 2;
        }
        return canceler;
      }

    }(a);
  };
};

},{}],29:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Aff_Internal = require("../Control.Monad.Aff.Internal");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_Parallel = require("../Control.Parallel");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Foldable = require("../Data.Foldable");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Tuple = require("../Data.Tuple");
var Unsafe_Coerce = require("../Unsafe.Coerce");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Function = require("../Data.Function");
var Control_MonadZero = require("../Control.MonadZero");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Eq = require("../Data.Eq");
var Data_Semiring = require("../Data.Semiring");
var Control_Parallel_Class = require("../Control.Parallel.Class");
var Data_Unit = require("../Data.Unit");
var ParAff = function (x) {
    return x;
};
var Canceler = function (x) {
    return x;
};
var runAff = function (ex) {
    return function (f) {
        return function (aff) {
            return $foreign._runAff(ex, f, aff);
        };
    };
};
var newtypeParAff = new Data_Newtype.Newtype(function (n) {
    return n;
}, ParAff);
var makeAff$prime = function (h) {
    return $foreign._makeAff(h);
};
var functorAff = new Data_Functor.Functor(function (f) {
    return function (fa) {
        return $foreign._fmap(f, fa);
    };
});
var functorParAff = functorAff;
var fromAVBox = Unsafe_Coerce.unsafeCoerce;
var cancel = function (v) {
    return v;
};
var launchAff = (function () {
    var lowerEx = Data_Functor.map(Control_Monad_Eff.functorEff)(function ($51) {
        return Canceler(Data_Functor.map(Data_Functor.functorFn)($foreign._unsafeInterleaveAff)(cancel($51)));
    });
    return function ($52) {
        return lowerEx(runAff(Control_Monad_Eff_Exception.throwException)(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))($foreign._unsafeInterleaveAff($52)));
    };
})();
var attempt = function (aff) {
    return $foreign._attempt(Data_Either.Left.create, Data_Either.Right.create, aff);
};
var apathize = function (a) {
    return Data_Functor.map(functorAff)(Data_Function["const"](Data_Unit.unit))(attempt(a));
};
var applyAff = new Control_Apply.Apply(function () {
    return functorAff;
}, function (ff) {
    return function (fa) {
        return $foreign._bind(alwaysCanceler, ff, function (f) {
            return Data_Functor.map(functorAff)(f)(fa);
        });
    };
});
var applicativeAff = new Control_Applicative.Applicative(function () {
    return applyAff;
}, function (v) {
    return $foreign._pure(nonCanceler, v);
});
var nonCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(false));
var alwaysCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(true));
var cancelWith = function (aff) {
    return function (c) {
        return $foreign._cancelWith(nonCanceler, aff, c);
    };
};
var forkAff = function (aff) {
    return $foreign._forkAff(nonCanceler, aff);
};
var forkAll = function (dictFoldable) {
    return function (affs) {
        return $foreign._forkAll(nonCanceler, Data_Foldable.foldl(dictFoldable), affs);
    };
};
var killVar = function (q) {
    return function (e) {
        return fromAVBox(Control_Monad_Aff_Internal._killVar(nonCanceler, q, e));
    };
};
var later$prime = function (n) {
    return function (aff) {
        return $foreign._setTimeout(nonCanceler, n, aff);
    };
};
var later = later$prime(0);
var liftEff$prime = function (eff) {
    return attempt($foreign._unsafeInterleaveAff($foreign._liftEff(nonCanceler, eff)));
};
var makeAff = function (h) {
    return makeAff$prime(function (e) {
        return function (a) {
            return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Function["const"](nonCanceler))(h(e)(a));
        };
    });
};
var makeVar = fromAVBox(Control_Monad_Aff_Internal._makeVar(nonCanceler));
var putVar = function (q) {
    return function (a) {
        return fromAVBox(Control_Monad_Aff_Internal._putVar(nonCanceler, q, a));
    };
};
var takeVar = function (q) {
    return fromAVBox(Control_Monad_Aff_Internal._takeVar(nonCanceler, q));
};
var semigroupAff = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (a) {
        return function (b) {
            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(Data_Semigroup.append(dictSemigroup))(a))(b);
        };
    });
};
var monoidAff = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupAff(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Control_Applicative.pure(applicativeAff)(Data_Monoid.mempty(dictMonoid)));
};
var semigroupCanceler = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        return function (e) {
            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(Data_HeytingAlgebra.disj(Data_HeytingAlgebra.heytingAlgebraBoolean))(v(e)))(v1(e));
        };
    };
});
var monoidCanceler = new Data_Monoid.Monoid(function () {
    return semigroupCanceler;
}, Data_Function["const"](Control_Applicative.pure(applicativeAff)(true)));
var bindAff = new Control_Bind.Bind(function () {
    return applyAff;
}, function (fa) {
    return function (f) {
        return $foreign._bind(alwaysCanceler, fa, f);
    };
});
var applyParAff = new Control_Apply.Apply(function () {
    return functorParAff;
}, function (v) {
    return function (v1) {
        var putOrKill = function (v2) {
            return Data_Either.either(killVar(v2))(putVar(v2));
        };
        return Control_Bind.bind(bindAff)(makeVar)(function (v2) {
            return Control_Bind.bind(bindAff)(makeVar)(function (v3) {
                return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v2))(attempt(v))))(function (v4) {
                    return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v3))(attempt(v1))))(function (v5) {
                        return cancelWith(Control_Apply.apply(applyAff)(takeVar(v2))(takeVar(v3)))(Data_Semigroup.append(semigroupCanceler)(v4)(v5));
                    });
                });
            });
        });
    };
});
var applicativeParAff = new Control_Applicative.Applicative(function () {
    return applyParAff;
}, function ($53) {
    return ParAff(Control_Applicative.pure(applicativeAff)($53));
});
var semigroupParAff = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (a) {
        return function (b) {
            return Control_Apply.apply(applyParAff)(Data_Functor.map(functorParAff)(Data_Semigroup.append(dictSemigroup))(a))(b);
        };
    });
};
var monoidParAff = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupParAff(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Control_Applicative.pure(applicativeParAff)(Data_Monoid.mempty(dictMonoid)));
};
var monadAff = new Control_Monad.Monad(function () {
    return applicativeAff;
}, function () {
    return bindAff;
});
var monadEffAff = new Control_Monad_Eff_Class.MonadEff(function () {
    return monadAff;
}, function (eff) {
    return $foreign._liftEff(nonCanceler, eff);
});
var monadRecAff = new Control_Monad_Rec_Class.MonadRec(function () {
    return monadAff;
}, function (f) {
    return function (a) {
        var isLoop = function (v) {
            if (v instanceof Control_Monad_Rec_Class.Loop) {
                return true;
            };
            return false;
        };
        return $foreign._tailRecM(isLoop, f, a);
    };
});
var parallelParAff = new Control_Parallel_Class.Parallel(function () {
    return applicativeParAff;
}, function () {
    return monadAff;
}, ParAff, function (v) {
    return v;
});
var monadErrorAff = new Control_Monad_Error_Class.MonadError(function () {
    return monadAff;
}, function (aff) {
    return function (ex) {
        return Control_Bind.bind(bindAff)(attempt(aff))(Data_Either.either(ex)(Control_Applicative.pure(applicativeAff)));
    };
}, function (e) {
    return $foreign._throwError(nonCanceler, e);
});
var $$finally = function (aff1) {
    return function (aff2) {
        return Control_Bind.bind(bindAff)(attempt(aff1))(function (v) {
            return Control_Bind.bind(bindAff)(aff2)(function () {
                return Data_Either.either(Control_Monad_Error_Class.throwError(monadErrorAff))(Control_Applicative.pure(applicativeAff))(v);
            });
        });
    };
};
var altParAff = new Control_Alt.Alt(function () {
    return functorParAff;
}, function (v) {
    return function (v1) {
        var maybeKill = function (va) {
            return function (ve) {
                return function (err) {
                    return Control_Bind.bind(bindAff)(takeVar(ve))(function (v2) {
                        return Control_Bind.bind(bindAff)(Control_Applicative.when(applicativeAff)(v2 === 1)(killVar(va)(err)))(function () {
                            return putVar(ve)(v2 + 1 | 0);
                        });
                    });
                };
            };
        };
        var done = function (cs) {
            return function (get) {
                return function (va) {
                    return function (x) {
                        return Control_Bind.bind(bindAff)(putVar(va)(x))(function () {
                            return Control_Bind.bind(bindAff)(Data_Functor.map(functorAff)(get)(takeVar(cs)))(function (v2) {
                                return Data_Functor["void"](functorAff)(cancel(v2)(Control_Monad_Eff_Exception.error("Alt early exit")));
                            });
                        });
                    };
                };
            };
        };
        return Control_Bind.bind(bindAff)(makeVar)(function (v2) {
            return Control_Bind.bind(bindAff)(makeVar)(function (v3) {
                return Control_Bind.bind(bindAff)(makeVar)(function (v4) {
                    return Control_Bind.bind(bindAff)(putVar(v3)(0))(function () {
                        return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(Data_Either.either(maybeKill(v2)(v3))(done(v4)(Data_Tuple.snd)(v2)))(attempt(v))))(function (v5) {
                            return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(Data_Either.either(maybeKill(v2)(v3))(done(v4)(Data_Tuple.fst)(v2)))(attempt(v1))))(function (v6) {
                                return Control_Bind.bind(bindAff)(putVar(v4)(new Data_Tuple.Tuple(v5, v6)))(function () {
                                    return cancelWith(takeVar(v2))(Data_Semigroup.append(semigroupCanceler)(v5)(v6));
                                });
                            });
                        });
                    });
                });
            });
        });
    };
});
var altAff = new Control_Alt.Alt(function () {
    return functorAff;
}, function (a1) {
    return function (a2) {
        return Control_Bind.bind(bindAff)(attempt(a1))(Data_Either.either(Data_Function["const"](a2))(Control_Applicative.pure(applicativeAff)));
    };
});
var plusAff = new Control_Plus.Plus(function () {
    return altAff;
}, Control_Monad_Error_Class.throwError(monadErrorAff)(Control_Monad_Eff_Exception.error("Always fails")));
var alternativeAff = new Control_Alternative.Alternative(function () {
    return applicativeAff;
}, function () {
    return plusAff;
});
var monadZero = new Control_MonadZero.MonadZero(function () {
    return alternativeAff;
}, function () {
    return monadAff;
});
var monadPlusAff = new Control_MonadPlus.MonadPlus(function () {
    return monadZero;
});
var plusParAff = new Control_Plus.Plus(function () {
    return altParAff;
}, Control_Plus.empty(plusAff));
var alternativeParAff = new Control_Alternative.Alternative(function () {
    return applicativeParAff;
}, function () {
    return plusParAff;
});
module.exports = {
    Canceler: Canceler, 
    ParAff: ParAff, 
    apathize: apathize, 
    attempt: attempt, 
    cancel: cancel, 
    cancelWith: cancelWith, 
    "finally": $$finally, 
    forkAff: forkAff, 
    forkAll: forkAll, 
    later: later, 
    "later'": later$prime, 
    launchAff: launchAff, 
    "liftEff'": liftEff$prime, 
    makeAff: makeAff, 
    "makeAff'": makeAff$prime, 
    nonCanceler: nonCanceler, 
    runAff: runAff, 
    semigroupAff: semigroupAff, 
    monoidAff: monoidAff, 
    functorAff: functorAff, 
    applyAff: applyAff, 
    applicativeAff: applicativeAff, 
    bindAff: bindAff, 
    monadAff: monadAff, 
    monadEffAff: monadEffAff, 
    monadErrorAff: monadErrorAff, 
    altAff: altAff, 
    plusAff: plusAff, 
    alternativeAff: alternativeAff, 
    monadZero: monadZero, 
    monadPlusAff: monadPlusAff, 
    monadRecAff: monadRecAff, 
    semigroupCanceler: semigroupCanceler, 
    monoidCanceler: monoidCanceler, 
    newtypeParAff: newtypeParAff, 
    semigroupParAff: semigroupParAff, 
    monoidParAff: monoidParAff, 
    functorParAff: functorParAff, 
    applyParAff: applyParAff, 
    applicativeParAff: applicativeParAff, 
    altParAff: altParAff, 
    plusParAff: plusParAff, 
    alternativeParAff: alternativeParAff, 
    parallelParAff: parallelParAff
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Control.Monad.Aff.Internal":27,"../Control.Monad.Eff":44,"../Control.Monad.Eff.Class":32,"../Control.Monad.Eff.Exception":36,"../Control.Monad.Error.Class":45,"../Control.Monad.Rec.Class":50,"../Control.MonadPlus":58,"../Control.MonadZero":59,"../Control.Parallel":61,"../Control.Parallel.Class":60,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Either":79,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Function.Uncurried":88,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Tuple":136,"../Data.Unit":140,"../Prelude":148,"../Unsafe.Coerce":151,"./foreign":28}],30:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var MonadCont = function (__superclass_Control$dotMonad$dotMonad_0, callCC) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.callCC = callCC;
};
var callCC = function (dict) {
    return dict.callCC;
};
module.exports = {
    MonadCont: MonadCont, 
    callCC: callCC
};

},{"../Prelude":148}],31:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Data_Newtype = require("../Data.Newtype");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var ContT = function (x) {
    return x;
};
var withContT = function (f) {
    return function (v) {
        return function (k) {
            return v(f(k));
        };
    };
};
var runContT = function (v) {
    return function (k) {
        return v(k);
    };
};
var newtypeContT = new Data_Newtype.Newtype(function (n) {
    return n;
}, ContT);
var monadTransContT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function (m) {
        return function (k) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(m)(k);
        };
    };
});
var mapContT = function (f) {
    return function (v) {
        return function (k) {
            return f(v(k));
        };
    };
};
var functorContT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return function (k) {
                return v(function (a) {
                    return k(f(a));
                });
            };
        };
    });
};
var applyContT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorContT(dictApply["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return function (k) {
                return v(function (g) {
                    return v1(function (a) {
                        return k(g(a));
                    });
                });
            };
        };
    });
};
var bindContT = function (dictBind) {
    return new Control_Bind.Bind(function () {
        return applyContT(dictBind["__superclass_Control.Apply.Apply_0"]());
    }, function (v) {
        return function (k) {
            return function (k$prime) {
                return v(function (a) {
                    var $36 = k(a);
                    return $36(k$prime);
                });
            };
        };
    });
};
var applicativeContT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyContT(dictApplicative["__superclass_Control.Apply.Apply_0"]());
    }, function (a) {
        return function (k) {
            return k(a);
        };
    });
};
var monadContT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeContT(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return bindContT(dictMonad["__superclass_Control.Bind.Bind_1"]());
    });
};
var monadAskContT = function (dictMonadAsk) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadContT(dictMonadAsk["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Trans_Class.lift(monadTransContT)(dictMonadAsk["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
};
var monadReaderContT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskContT(dictMonadReader["__superclass_Control.Monad.Reader.Class.MonadAsk_0"]());
    }, function (f) {
        return function (v) {
            return function (k) {
                return Control_Bind.bind(((dictMonadReader["__superclass_Control.Monad.Reader.Class.MonadAsk_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Reader_Class.ask(dictMonadReader["__superclass_Control.Monad.Reader.Class.MonadAsk_0"]()))(function (v1) {
                    return Control_Monad_Reader_Class.local(dictMonadReader)(f)(v(function ($42) {
                        return Control_Monad_Reader_Class.local(dictMonadReader)(Data_Function["const"](v1))(k($42));
                    }));
                });
            };
        };
    });
};
var monadContContT = function (dictMonad) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadContT(dictMonad);
    }, function (f) {
        return function (k) {
            var $41 = f(function (a) {
                return function (v) {
                    return k(a);
                };
            });
            return $41(k);
        };
    });
};
var monadEffContT = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadContT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($43) {
        return Control_Monad_Trans_Class.lift(monadTransContT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($43));
    });
};
var monadStateContT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadContT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function ($44) {
        return Control_Monad_Trans_Class.lift(monadTransContT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)($44));
    });
};
module.exports = {
    ContT: ContT, 
    mapContT: mapContT, 
    runContT: runContT, 
    withContT: withContT, 
    newtypeContT: newtypeContT, 
    monadContContT: monadContContT, 
    functorContT: functorContT, 
    applyContT: applyContT, 
    applicativeContT: applicativeContT, 
    bindContT: bindContT, 
    monadContT: monadContT, 
    monadTransContT: monadTransContT, 
    monadEffContT: monadEffContT, 
    monadAskContT: monadAskContT, 
    monadReaderContT: monadReaderContT, 
    monadStateContT: monadStateContT
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Control.Monad.Cont.Class":30,"../Control.Monad.Eff.Class":32,"../Control.Monad.Reader.Class":48,"../Control.Monad.State.Class":53,"../Control.Monad.Trans.Class":54,"../Control.Semigroupoid":63,"../Data.Function":89,"../Data.Functor":93,"../Data.Newtype":113,"../Prelude":148}],32:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var MonadEff = function (__superclass_Control$dotMonad$dotMonad_0, liftEff) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.liftEff = liftEff;
};
var monadEffEff = new MonadEff(function () {
    return Control_Monad_Eff.monadEff;
}, Control_Category.id(Control_Category.categoryFn));
var liftEff = function (dict) {
    return dict.liftEff;
};
module.exports = {
    MonadEff: MonadEff, 
    liftEff: liftEff, 
    monadEffEff: monadEffEff
};

},{"../Control.Category":20,"../Control.Monad":57,"../Control.Monad.Eff":44}],33:[function(require,module,exports){
"use strict";

exports.log = function (s) {
  return function () {
    console.log(s);
    return {};
  };
};

exports.warn = function (s) {
  return function () {
    console.warn(s);
    return {};
  };
};

exports.error = function (s) {
  return function () {
    console.error(s);
    return {};
  };
};

exports.info = function (s) {
  return function () {
    console.info(s);
    return {};
  };
};

},{}],34:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var warnShow = function (dictShow) {
    return function (a) {
        return $foreign.warn(Data_Show.show(dictShow)(a));
    };
};
var logShow = function (dictShow) {
    return function (a) {
        return $foreign.log(Data_Show.show(dictShow)(a));
    };
};
var infoShow = function (dictShow) {
    return function (a) {
        return $foreign.info(Data_Show.show(dictShow)(a));
    };
};
var errorShow = function (dictShow) {
    return function (a) {
        return $foreign.error(Data_Show.show(dictShow)(a));
    };
};
module.exports = {
    errorShow: errorShow, 
    infoShow: infoShow, 
    logShow: logShow, 
    warnShow: warnShow, 
    error: $foreign.error, 
    info: $foreign.info, 
    log: $foreign.log, 
    warn: $foreign.warn
};

},{"../Control.Monad.Eff":44,"../Data.Show":128,"../Data.Unit":140,"./foreign":33}],35:[function(require,module,exports){
"use strict";

exports.showErrorImpl = function (err) {
  return err.stack || err.toString();
};

exports.error = function (msg) {
  return new Error(msg);
};

exports.message = function (e) {
  return e.message;
};

exports.stackImpl = function (just) {
  return function (nothing) {
    return function (e) {
      return e.stack ? just(e.stack) : nothing;
    };
  };
};

exports.throwException = function (e) {
  return function () {
    throw e;
  };
};

exports.catchException = function (c) {
  return function (t) {
    return function () {
      try {
        return t();
      } catch (e) {
        if (e instanceof Error || Object.prototype.toString.call(e) === "[object Error]") {
          return c(e)();
        } else {
          return c(new Error(e.toString()))();
        }
      }
    };
  };
};

},{}],36:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Either = require("../Data.Either");
var Data_Maybe = require("../Data.Maybe");
var Data_Show = require("../Data.Show");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Applicative = require("../Control.Applicative");
var Data_Functor = require("../Data.Functor");
var $$try = function (action) {
    return $foreign.catchException(function ($0) {
        return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Either.Left.create($0));
    })(Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Either.Right.create)(action));
};
var $$throw = function ($1) {
    return $foreign.throwException($foreign.error($1));
};
var stack = $foreign.stackImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var showError = new Data_Show.Show($foreign.showErrorImpl);
module.exports = {
    stack: stack, 
    "throw": $$throw, 
    "try": $$try, 
    showError: showError, 
    catchException: $foreign.catchException, 
    error: $foreign.error, 
    message: $foreign.message, 
    throwException: $foreign.throwException
};

},{"../Control.Applicative":13,"../Control.Monad.Eff":44,"../Control.Semigroupoid":63,"../Data.Either":79,"../Data.Functor":93,"../Data.Maybe":104,"../Data.Show":128,"../Prelude":148,"./foreign":35}],37:[function(require,module,exports){
"use strict";

exports.newRef = function (val) {
  return function () {
    return { value: val };
  };
};

exports.readRef = function (ref) {
  return function () {
    return ref.value;
  };
};

exports["modifyRef'"] = function (ref) {
  return function (f) {
    return function () {
      var t = f(ref.value);
      ref.value = t.state;
      return t.value;
    };
  };
};

exports.writeRef = function (ref) {
  return function (val) {
    return function () {
      ref.value = val;
      return {};
    };
  };
};

},{}],38:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Unit = require("../Data.Unit");
var modifyRef = function (ref) {
    return function (f) {
        return $foreign["modifyRef'"](ref)(function (s) {
            return {
                state: f(s), 
                value: Data_Unit.unit
            };
        });
    };
};
module.exports = {
    modifyRef: modifyRef, 
    "modifyRef'": $foreign["modifyRef'"], 
    newRef: $foreign.newRef, 
    readRef: $foreign.readRef, 
    writeRef: $foreign.writeRef
};

},{"../Control.Monad.Eff":44,"../Data.Unit":140,"../Prelude":148,"./foreign":37}],39:[function(require,module,exports){
/* global exports */
"use strict";

exports.setTimeout = function (ms) {
  return function (fn) {
    return function () {
      return setTimeout(fn, ms);
    };
  };
};

exports.clearTimeout = function (id) {
  return function () {
    clearTimeout(id);
  };
};

exports.setInterval = function (ms) {
  return function (fn) {
    return function () {
      return setInterval(fn, ms);
    };
  };
};

exports.clearInterval = function (id) {
  return function () {
    clearInterval(id);
  };
};

},{}],40:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var TimeoutId = function (x) {
    return x;
};
var IntervalId = function (x) {
    return x;
};
var eqTimeoutId = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordTimeoutId = new Data_Ord.Ord(function () {
    return eqTimeoutId;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
    };
});
var eqIntervalId = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordIntervalId = new Data_Ord.Ord(function () {
    return eqIntervalId;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
    };
});
module.exports = {
    eqTimeoutId: eqTimeoutId, 
    ordTimeoutId: ordTimeoutId, 
    eqIntervalId: eqIntervalId, 
    ordIntervalId: ordIntervalId, 
    clearInterval: $foreign.clearInterval, 
    clearTimeout: $foreign.clearTimeout, 
    setInterval: $foreign.setInterval, 
    setTimeout: $foreign.setTimeout
};

},{"../Control.Monad.Eff":44,"../Data.Eq":81,"../Data.Ord":118,"../Prelude":148,"./foreign":39}],41:[function(require,module,exports){
"use strict";

exports.unsafeCoerceEff = function (f) {
  return f;
};

},{}],42:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var unsafePerformEff = function ($0) {
    return Control_Monad_Eff.runPure($foreign.unsafeCoerceEff($0));
};
module.exports = {
    unsafePerformEff: unsafePerformEff, 
    unsafeCoerceEff: $foreign.unsafeCoerceEff
};

},{"../Control.Monad.Eff":44,"../Control.Semigroupoid":63,"./foreign":41}],43:[function(require,module,exports){
"use strict";

exports.pureE = function (a) {
  return function () {
    return a;
  };
};

exports.bindE = function (a) {
  return function (f) {
    return function () {
      return f(a())();
    };
  };
};

exports.runPure = function (f) {
  return f();
};

exports.untilE = function (f) {
  return function () {
    while (!f());
    return {};
  };
};

exports.whileE = function (f) {
  return function (a) {
    return function () {
      while (f()) {
        a();
      }
      return {};
    };
  };
};

exports.forE = function (lo) {
  return function (hi) {
    return function (f) {
      return function () {
        for (var i = lo; i < hi; i++) {
          f(i)();
        }
      };
    };
  };
};

exports.foreachE = function (as) {
  return function (f) {
    return function () {
      for (var i = 0, l = as.length; i < l; i++) {
        f(as[i])();
      }
    };
  };
};

},{}],44:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var monadEff = new Control_Monad.Monad(function () {
    return applicativeEff;
}, function () {
    return bindEff;
});
var bindEff = new Control_Bind.Bind(function () {
    return applyEff;
}, $foreign.bindE);
var applyEff = new Control_Apply.Apply(function () {
    return functorEff;
}, Control_Monad.ap(monadEff));
var applicativeEff = new Control_Applicative.Applicative(function () {
    return applyEff;
}, $foreign.pureE);
var functorEff = new Data_Functor.Functor(Control_Applicative.liftA1(applicativeEff));
module.exports = {
    functorEff: functorEff, 
    applyEff: applyEff, 
    applicativeEff: applicativeEff, 
    bindEff: bindEff, 
    monadEff: monadEff, 
    forE: $foreign.forE, 
    foreachE: $foreign.foreachE, 
    runPure: $foreign.runPure, 
    untilE: $foreign.untilE, 
    whileE: $foreign.whileE
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Data.Functor":93,"../Data.Unit":140,"./foreign":43}],45:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Maybe = require("../Data.Maybe");
var Data_Either = require("../Data.Either");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var MonadError = function (__superclass_Control$dotMonad$dotMonad_0, catchError, throwError) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.catchError = catchError;
    this.throwError = throwError;
};
var throwError = function (dict) {
    return dict.throwError;
};
var monadErrorMaybe = new MonadError(function () {
    return Data_Maybe.monadMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Maybe.Nothing) {
            return v1(Data_Unit.unit);
        };
        if (v instanceof Data_Maybe.Just) {
            return new Data_Maybe.Just(v.value0);
        };
        throw new Error("Failed pattern match at Control.Monad.Error.Class line 55, column 3 - line 55, column 33: " + [ v.constructor.name, v1.constructor.name ]);
    };
}, Data_Function["const"](Data_Maybe.Nothing.value));
var monadErrorEither = new MonadError(function () {
    return Data_Either.monadEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Either.Left) {
            return v1(v.value0);
        };
        if (v instanceof Data_Either.Right) {
            return new Data_Either.Right(v.value0);
        };
        throw new Error("Failed pattern match at Control.Monad.Error.Class line 50, column 3 - line 50, column 30: " + [ v.constructor.name, v1.constructor.name ]);
    };
}, Data_Either.Left.create);
var catchError = function (dict) {
    return dict.catchError;
};
var catchJust = function (dictMonadError) {
    return function (p) {
        return function (act) {
            return function (handler) {
                var handle = function (e) {
                    var $12 = p(e);
                    if ($12 instanceof Data_Maybe.Nothing) {
                        return throwError(dictMonadError)(e);
                    };
                    if ($12 instanceof Data_Maybe.Just) {
                        return handler($12.value0);
                    };
                    throw new Error("Failed pattern match at Control.Monad.Error.Class line 44, column 5 - line 46, column 26: " + [ $12.constructor.name ]);
                };
                return catchError(dictMonadError)(act)(handle);
            };
        };
    };
};
module.exports = {
    MonadError: MonadError, 
    catchError: catchError, 
    catchJust: catchJust, 
    throwError: throwError, 
    monadErrorEither: monadErrorEither, 
    monadErrorMaybe: monadErrorMaybe
};

},{"../Data.Either":79,"../Data.Function":89,"../Data.Maybe":104,"../Data.Unit":140,"../Prelude":148}],46:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Tuple = require("../Data.Tuple");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Monad = require("../Control.Monad");
var Control_Applicative = require("../Control.Applicative");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var ExceptT = function (x) {
    return x;
};
var withExceptT = function (dictFunctor) {
    return function (f) {
        return function (v) {
            var mapLeft = function (v1) {
                return function (v2) {
                    if (v2 instanceof Data_Either.Right) {
                        return new Data_Either.Right(v2.value0);
                    };
                    if (v2 instanceof Data_Either.Left) {
                        return new Data_Either.Left(v1(v2.value0));
                    };
                    throw new Error("Failed pattern match at Control.Monad.Except.Trans line 44, column 3 - line 44, column 32: " + [ v1.constructor.name, v2.constructor.name ]);
                };
            };
            return ExceptT(Data_Functor.map(dictFunctor)(mapLeft(f))(v));
        };
    };
};
var runExceptT = function (v) {
    return v;
};
var newtypeExceptT = new Data_Newtype.Newtype(function (n) {
    return n;
}, ExceptT);
var monadTransExceptT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function (m) {
        return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
            return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(v));
        });
    };
});
var mapExceptT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorExceptT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return mapExceptT(Data_Functor.map(dictFunctor)(Data_Functor.map(Data_Either.functorEither)(f)));
    });
};
var except = function (dictApplicative) {
    return function ($87) {
        return ExceptT(Control_Applicative.pure(dictApplicative)($87));
    };
};
var monadExceptT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeExceptT(dictMonad);
    }, function () {
        return bindExceptT(dictMonad);
    });
};
var bindExceptT = function (dictMonad) {
    return new Control_Bind.Bind(function () {
        return applyExceptT(dictMonad);
    }, function (v) {
        return function (k) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(Data_Either.either(function ($88) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Left.create($88));
            })(function (a) {
                var $56 = k(a);
                return $56;
            }));
        };
    });
};
var applyExceptT = function (dictMonad) {
    return new Control_Apply.Apply(function () {
        return functorExceptT(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
    }, Control_Monad.ap(monadExceptT(dictMonad)));
};
var applicativeExceptT = function (dictMonad) {
    return new Control_Applicative.Applicative(function () {
        return applyExceptT(dictMonad);
    }, function ($89) {
        return ExceptT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Right.create($89)));
    });
};
var monadAskExceptT = function (dictMonadAsk) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadExceptT(dictMonadAsk["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadAsk["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
};
var monadReaderExceptT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskExceptT(dictMonadReader["__superclass_Control.Monad.Reader.Class.MonadAsk_0"]());
    }, function (f) {
        return mapExceptT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
    });
};
var monadContExceptT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadExceptT(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return ExceptT(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
            var $57 = f(function (a) {
                return ExceptT(c(new Data_Either.Right(a)));
            });
            return $57;
        }));
    });
};
var monadEffExceptT = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadExceptT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($90) {
        return Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($90));
    });
};
var monadErrorExceptT = function (dictMonad) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadExceptT(dictMonad);
    }, function (v) {
        return function (k) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(Data_Either.either(function (a) {
                var $60 = k(a);
                return $60;
            })(function ($91) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Right.create($91));
            }));
        };
    }, function ($92) {
        return ExceptT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Left.create($92)));
    });
};
var monadRecExceptT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadExceptT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function ($93) {
            return ExceptT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())((function () {
                    var $61 = f(a);
                    return $61;
                })())(function (m$prime) {
                    return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                        if (m$prime instanceof Data_Either.Left) {
                            return new Control_Monad_Rec_Class.Done(new Data_Either.Left(m$prime.value0));
                        };
                        if (m$prime instanceof Data_Either.Right && m$prime.value0 instanceof Control_Monad_Rec_Class.Loop) {
                            return new Control_Monad_Rec_Class.Loop(m$prime.value0.value0);
                        };
                        if (m$prime instanceof Data_Either.Right && m$prime.value0 instanceof Control_Monad_Rec_Class.Done) {
                            return new Control_Monad_Rec_Class.Done(new Data_Either.Right(m$prime.value0.value0));
                        };
                        throw new Error("Failed pattern match at Control.Monad.Except.Trans line 76, column 9 - line 79, column 43: " + [ m$prime.constructor.name ]);
                    })());
                });
            })($93));
        };
    });
};
var monadStateExceptT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadExceptT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)(f));
    });
};
var monadTellExceptT = function (dictMonadTell) {
    return new Control_Monad_Writer_Class.MonadTell(function () {
        return monadExceptT(dictMonadTell["__superclass_Control.Monad.Monad_0"]());
    }, function ($94) {
        return Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadTell["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Writer_Class.tell(dictMonadTell)($94));
    });
};
var monadWriterExceptT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadTellExceptT(dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]());
    }, mapExceptT(function (m) {
        return Control_Bind.bind(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Writer_Class.listen(dictMonadWriter)(m))(function (v) {
            return Control_Applicative.pure(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Functor.map(Data_Either.functorEither)(function (r) {
                return new Data_Tuple.Tuple(r, v.value1);
            })(v.value0));
        });
    }), mapExceptT(function (m) {
        return Control_Monad_Writer_Class.pass(dictMonadWriter)(Control_Bind.bind(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
            return Control_Applicative.pure(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                if (v instanceof Data_Either.Left) {
                    return new Data_Tuple.Tuple(new Data_Either.Left(v.value0), Control_Category.id(Control_Category.categoryFn));
                };
                if (v instanceof Data_Either.Right) {
                    return new Data_Tuple.Tuple(new Data_Either.Right(v.value0.value0), v.value0.value1);
                };
                throw new Error("Failed pattern match at Control.Monad.Except.Trans line 136, column 5 - line 138, column 44: " + [ v.constructor.name ]);
            })());
        }));
    }));
};
var altExceptT = function (dictSemigroup) {
    return function (dictMonad) {
        return new Control_Alt.Alt(function () {
            return functorExceptT(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
        }, function (v) {
            return function (v1) {
                return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v2) {
                    if (v2 instanceof Data_Either.Right) {
                        return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(v2.value0));
                    };
                    if (v2 instanceof Data_Either.Left) {
                        return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v1)(function (v3) {
                            if (v3 instanceof Data_Either.Right) {
                                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(v3.value0));
                            };
                            if (v3 instanceof Data_Either.Left) {
                                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(Data_Semigroup.append(dictSemigroup)(v2.value0)(v3.value0)));
                            };
                            throw new Error("Failed pattern match at Control.Monad.Except.Trans line 88, column 9 - line 90, column 49: " + [ v3.constructor.name ]);
                        });
                    };
                    throw new Error("Failed pattern match at Control.Monad.Except.Trans line 84, column 5 - line 90, column 49: " + [ v2.constructor.name ]);
                });
            };
        });
    };
};
var plusExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Plus.Plus(function () {
            return altExceptT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictMonad);
        }, Control_Monad_Error_Class.throwError(monadErrorExceptT(dictMonad))(Data_Monoid.mempty(dictMonoid)));
    };
};
var alternativeExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Alternative.Alternative(function () {
            return applicativeExceptT(dictMonad);
        }, function () {
            return plusExceptT(dictMonoid)(dictMonad);
        });
    };
};
var monadZeroExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_MonadZero.MonadZero(function () {
            return alternativeExceptT(dictMonoid)(dictMonad);
        }, function () {
            return monadExceptT(dictMonad);
        });
    };
};
var monadPlusExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_MonadPlus.MonadPlus(function () {
            return monadZeroExceptT(dictMonoid)(dictMonad);
        });
    };
};
module.exports = {
    ExceptT: ExceptT, 
    except: except, 
    mapExceptT: mapExceptT, 
    runExceptT: runExceptT, 
    withExceptT: withExceptT, 
    newtypeExceptT: newtypeExceptT, 
    functorExceptT: functorExceptT, 
    applyExceptT: applyExceptT, 
    applicativeExceptT: applicativeExceptT, 
    bindExceptT: bindExceptT, 
    monadExceptT: monadExceptT, 
    monadRecExceptT: monadRecExceptT, 
    altExceptT: altExceptT, 
    plusExceptT: plusExceptT, 
    alternativeExceptT: alternativeExceptT, 
    monadPlusExceptT: monadPlusExceptT, 
    monadZeroExceptT: monadZeroExceptT, 
    monadTransExceptT: monadTransExceptT, 
    monadEffExceptT: monadEffExceptT, 
    monadContExceptT: monadContExceptT, 
    monadErrorExceptT: monadErrorExceptT, 
    monadAskExceptT: monadAskExceptT, 
    monadReaderExceptT: monadReaderExceptT, 
    monadStateExceptT: monadStateExceptT, 
    monadTellExceptT: monadTellExceptT, 
    monadWriterExceptT: monadWriterExceptT
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Monad":57,"../Control.Monad.Cont.Class":30,"../Control.Monad.Eff.Class":32,"../Control.Monad.Error.Class":45,"../Control.Monad.Reader.Class":48,"../Control.Monad.Rec.Class":50,"../Control.Monad.State.Class":53,"../Control.Monad.Trans.Class":54,"../Control.Monad.Writer.Class":55,"../Control.MonadPlus":58,"../Control.MonadZero":59,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Either":79,"../Data.Function":89,"../Data.Functor":93,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Semigroup":123,"../Data.Tuple":136,"../Prelude":148}],47:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Maybe = require("../Data.Maybe");
var Data_Newtype = require("../Data.Newtype");
var Data_Tuple = require("../Data.Tuple");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Monad = require("../Control.Monad");
var Control_Applicative = require("../Control.Applicative");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var MaybeT = function (x) {
    return x;
};
var runMaybeT = function (v) {
    return v;
};
var newtypeMaybeT = new Data_Newtype.Newtype(function (n) {
    return n;
}, MaybeT);
var monadTransMaybeT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function ($66) {
        return MaybeT(Control_Monad.liftM1(dictMonad)(Data_Maybe.Just.create)($66));
    };
});
var mapMaybeT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorMaybeT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return Data_Functor.map(dictFunctor)(Data_Functor.map(Data_Maybe.functorMaybe)(f))(v);
        };
    });
};
var monadMaybeT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeMaybeT(dictMonad);
    }, function () {
        return bindMaybeT(dictMonad);
    });
};
var bindMaybeT = function (dictMonad) {
    return new Control_Bind.Bind(function () {
        return applyMaybeT(dictMonad);
    }, function (v) {
        return function (f) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                if (v1 instanceof Data_Maybe.Nothing) {
                    return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Nothing.value);
                };
                if (v1 instanceof Data_Maybe.Just) {
                    var $42 = f(v1.value0);
                    return $42;
                };
                throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 55, column 5 - line 57, column 42: " + [ v1.constructor.name ]);
            });
        };
    });
};
var applyMaybeT = function (dictMonad) {
    return new Control_Apply.Apply(function () {
        return functorMaybeT(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
    }, Control_Monad.ap(monadMaybeT(dictMonad)));
};
var applicativeMaybeT = function (dictMonad) {
    return new Control_Applicative.Applicative(function () {
        return applyMaybeT(dictMonad);
    }, function ($67) {
        return MaybeT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Just.create($67)));
    });
};
var monadAskMaybeT = function (dictMonadAsk) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadMaybeT(dictMonadAsk["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadAsk["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
};
var monadReaderMaybeT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskMaybeT(dictMonadReader["__superclass_Control.Monad.Reader.Class.MonadAsk_0"]());
    }, function (f) {
        return mapMaybeT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
    });
};
var monadContMaybeT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadMaybeT(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return MaybeT(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
            var $44 = f(function (a) {
                return MaybeT(c(new Data_Maybe.Just(a)));
            });
            return $44;
        }));
    });
};
var monadEffMaybe = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadMaybeT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($68) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($68));
    });
};
var monadErrorMaybeT = function (dictMonadError) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadMaybeT(dictMonadError["__superclass_Control.Monad.Monad_0"]());
    }, function (v) {
        return function (h) {
            return MaybeT(Control_Monad_Error_Class.catchError(dictMonadError)(v)(function (a) {
                var $47 = h(a);
                return $47;
            }));
        };
    }, function (e) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadError["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Error_Class.throwError(dictMonadError)(e));
    });
};
var monadRecMaybeT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadMaybeT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function ($69) {
            return MaybeT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())((function () {
                    var $48 = f(a);
                    return $48;
                })())(function (m$prime) {
                    return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                        if (m$prime instanceof Data_Maybe.Nothing) {
                            return new Control_Monad_Rec_Class.Done(Data_Maybe.Nothing.value);
                        };
                        if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Control_Monad_Rec_Class.Loop) {
                            return new Control_Monad_Rec_Class.Loop(m$prime.value0.value0);
                        };
                        if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Control_Monad_Rec_Class.Done) {
                            return new Control_Monad_Rec_Class.Done(new Data_Maybe.Just(m$prime.value0.value0));
                        };
                        throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 85, column 11 - line 88, column 43: " + [ m$prime.constructor.name ]);
                    })());
                });
            })($69));
        };
    });
};
var monadStateMaybeT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadMaybeT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)(f));
    });
};
var monadTellMaybeT = function (dictMonadTell) {
    return new Control_Monad_Writer_Class.MonadTell(function () {
        return monadMaybeT(dictMonadTell["__superclass_Control.Monad.Monad_0"]());
    }, function ($70) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadTell["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Writer_Class.tell(dictMonadTell)($70));
    });
};
var monadWriterMaybeT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadTellMaybeT(dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]());
    }, mapMaybeT(function (m) {
        return Control_Bind.bind(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Writer_Class.listen(dictMonadWriter)(m))(function (v) {
            return Control_Applicative.pure(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Functor.map(Data_Maybe.functorMaybe)(function (r) {
                return new Data_Tuple.Tuple(r, v.value1);
            })(v.value0));
        });
    }), mapMaybeT(function (m) {
        return Control_Monad_Writer_Class.pass(dictMonadWriter)(Control_Bind.bind(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
            return Control_Applicative.pure(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Tuple.Tuple(Data_Maybe.Nothing.value, Control_Category.id(Control_Category.categoryFn));
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Tuple.Tuple(new Data_Maybe.Just(v.value0.value0), v.value0.value1);
                };
                throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 120, column 5 - line 122, column 42: " + [ v.constructor.name ]);
            })());
        }));
    }));
};
var altMaybeT = function (dictMonad) {
    return new Control_Alt.Alt(function () {
        return functorMaybeT(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v2) {
                if (v2 instanceof Data_Maybe.Nothing) {
                    return v1;
                };
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v2);
            });
        };
    });
};
var plusMaybeT = function (dictMonad) {
    return new Control_Plus.Plus(function () {
        return altMaybeT(dictMonad);
    }, Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Nothing.value));
};
var alternativeMaybeT = function (dictMonad) {
    return new Control_Alternative.Alternative(function () {
        return applicativeMaybeT(dictMonad);
    }, function () {
        return plusMaybeT(dictMonad);
    });
};
var monadZeroMaybeT = function (dictMonad) {
    return new Control_MonadZero.MonadZero(function () {
        return alternativeMaybeT(dictMonad);
    }, function () {
        return monadMaybeT(dictMonad);
    });
};
var monadPlusMaybeT = function (dictMonad) {
    return new Control_MonadPlus.MonadPlus(function () {
        return monadZeroMaybeT(dictMonad);
    });
};
module.exports = {
    MaybeT: MaybeT, 
    mapMaybeT: mapMaybeT, 
    runMaybeT: runMaybeT, 
    newtypeMaybeT: newtypeMaybeT, 
    functorMaybeT: functorMaybeT, 
    applyMaybeT: applyMaybeT, 
    applicativeMaybeT: applicativeMaybeT, 
    bindMaybeT: bindMaybeT, 
    monadMaybeT: monadMaybeT, 
    monadTransMaybeT: monadTransMaybeT, 
    altMaybeT: altMaybeT, 
    plusMaybeT: plusMaybeT, 
    alternativeMaybeT: alternativeMaybeT, 
    monadPlusMaybeT: monadPlusMaybeT, 
    monadZeroMaybeT: monadZeroMaybeT, 
    monadRecMaybeT: monadRecMaybeT, 
    monadEffMaybe: monadEffMaybe, 
    monadContMaybeT: monadContMaybeT, 
    monadErrorMaybeT: monadErrorMaybeT, 
    monadAskMaybeT: monadAskMaybeT, 
    monadReaderMaybeT: monadReaderMaybeT, 
    monadStateMaybeT: monadStateMaybeT, 
    monadTellMaybeT: monadTellMaybeT, 
    monadWriterMaybeT: monadWriterMaybeT
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Monad":57,"../Control.Monad.Cont.Class":30,"../Control.Monad.Eff.Class":32,"../Control.Monad.Error.Class":45,"../Control.Monad.Reader.Class":48,"../Control.Monad.Rec.Class":50,"../Control.Monad.State.Class":53,"../Control.Monad.Trans.Class":54,"../Control.Monad.Writer.Class":55,"../Control.MonadPlus":58,"../Control.MonadZero":59,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Function":89,"../Data.Functor":93,"../Data.Maybe":104,"../Data.Newtype":113,"../Data.Tuple":136,"../Prelude":148}],48:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Category = require("../Control.Category");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Monad = require("../Control.Monad");
var Data_Functor = require("../Data.Functor");
var MonadAsk = function (__superclass_Control$dotMonad$dotMonad_0, ask) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.ask = ask;
};
var MonadReader = function (__superclass_Control$dotMonad$dotReader$dotClass$dotMonadAsk_0, local) {
    this["__superclass_Control.Monad.Reader.Class.MonadAsk_0"] = __superclass_Control$dotMonad$dotReader$dotClass$dotMonadAsk_0;
    this.local = local;
};
var monadAskFun = new MonadAsk(function () {
    return Control_Monad.monadFn;
}, Control_Category.id(Control_Category.categoryFn));
var monadReaderFun = new MonadReader(function () {
    return monadAskFun;
}, Control_Semigroupoid.composeFlipped(Control_Semigroupoid.semigroupoidFn));
var local = function (dict) {
    return dict.local;
};
var ask = function (dict) {
    return dict.ask;
};
var asks = function (dictMonadAsk) {
    return function (f) {
        return Data_Functor.map((((dictMonadAsk["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(f)(ask(dictMonadAsk));
    };
};
module.exports = {
    MonadAsk: MonadAsk, 
    MonadReader: MonadReader, 
    ask: ask, 
    asks: asks, 
    local: local, 
    monadAskFun: monadAskFun, 
    monadReaderFun: monadReaderFun
};

},{"../Control.Category":20,"../Control.Monad":57,"../Control.Semigroupoid":63,"../Data.Functor":93,"../Prelude":148}],49:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Distributive = require("../Data.Distributive");
var Data_Newtype = require("../Data.Newtype");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Data_Function = require("../Data.Function");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var ReaderT = function (x) {
    return x;
};
var withReaderT = function (f) {
    return function (v) {
        return function ($53) {
            return v(f($53));
        };
    };
};
var runReaderT = function (v) {
    return v;
};
var newtypeReaderT = new Data_Newtype.Newtype(function (n) {
    return n;
}, ReaderT);
var monadTransReaderT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function ($54) {
        return ReaderT(Data_Function["const"]($54));
    };
});
var mapReaderT = function (f) {
    return function (v) {
        return function ($55) {
            return f(v($55));
        };
    };
};
var functorReaderT = function (dictFunctor) {
    return new Data_Functor.Functor(function ($56) {
        return mapReaderT(Data_Functor.map(dictFunctor)($56));
    });
};
var distributiveReaderT = function (dictDistributive) {
    return new Data_Distributive.Distributive(function () {
        return functorReaderT(dictDistributive["__superclass_Data.Functor.Functor_0"]());
    }, function (dictFunctor) {
        return function (f) {
            return function ($57) {
                return Data_Distributive.distribute(distributiveReaderT(dictDistributive))(dictFunctor)(Data_Functor.map(dictFunctor)(f)($57));
            };
        };
    }, function (dictFunctor) {
        return function (a) {
            return function (e) {
                return Data_Distributive.collect(dictDistributive)(dictFunctor)(function (r) {
                    return r(e);
                })(a);
            };
        };
    });
};
var applyReaderT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorReaderT(dictApply["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return Control_Apply.apply(dictApply)(v(r))(v1(r));
            };
        };
    });
};
var bindReaderT = function (dictBind) {
    return new Control_Bind.Bind(function () {
        return applyReaderT(dictBind["__superclass_Control.Apply.Apply_0"]());
    }, function (v) {
        return function (k) {
            return function (r) {
                return Control_Bind.bind(dictBind)(v(r))(function (a) {
                    var $45 = k(a);
                    return $45(r);
                });
            };
        };
    });
};
var applicativeReaderT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyReaderT(dictApplicative["__superclass_Control.Apply.Apply_0"]());
    }, function ($58) {
        return ReaderT(Data_Function["const"](Control_Applicative.pure(dictApplicative)($58)));
    });
};
var monadReaderT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeReaderT(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return bindReaderT(dictMonad["__superclass_Control.Bind.Bind_1"]());
    });
};
var monadAskReaderT = function (dictMonad) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadReaderT(dictMonad);
    }, Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()));
};
var monadReaderReaderT = function (dictMonad) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskReaderT(dictMonad);
    }, withReaderT);
};
var monadContReaderT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadReaderT(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function (r) {
            return Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
                var $46 = f(function ($59) {
                    return ReaderT(Data_Function["const"](c($59)));
                });
                return $46(r);
            });
        };
    });
};
var monadEffReader = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadReaderT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($60) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($60));
    });
};
var monadErrorReaderT = function (dictMonadError) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadReaderT(dictMonadError["__superclass_Control.Monad.Monad_0"]());
    }, function (v) {
        return function (h) {
            return function (r) {
                return Control_Monad_Error_Class.catchError(dictMonadError)(v(r))(function (e) {
                    var $49 = h(e);
                    return $49(r);
                });
            };
        };
    }, function ($61) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadError["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Error_Class.throwError(dictMonadError)($61));
    });
};
var monadRecReaderT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadReaderT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
    }, function (k) {
        return function (a) {
            var k$prime = function (r) {
                return function (a$prime) {
                    var $50 = k(a$prime);
                    return Control_Bind.bindFlipped((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]()))($50(r));
                };
            };
            return function (r) {
                return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(k$prime(r))(a);
            };
        };
    });
};
var monadStateReaderT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadReaderT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function ($62) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)($62));
    });
};
var monadTellReaderT = function (dictMonadTell) {
    return new Control_Monad_Writer_Class.MonadTell(function () {
        return monadReaderT(dictMonadTell["__superclass_Control.Monad.Monad_0"]());
    }, function ($63) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadTell["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Writer_Class.tell(dictMonadTell)($63));
    });
};
var monadWriterReaderT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadTellReaderT(dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]());
    }, mapReaderT(Control_Monad_Writer_Class.listen(dictMonadWriter)), mapReaderT(Control_Monad_Writer_Class.pass(dictMonadWriter)));
};
var altReaderT = function (dictAlt) {
    return new Control_Alt.Alt(function () {
        return functorReaderT(dictAlt["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return Control_Alt.alt(dictAlt)(v(r))(v1(r));
            };
        };
    });
};
var plusReaderT = function (dictPlus) {
    return new Control_Plus.Plus(function () {
        return altReaderT(dictPlus["__superclass_Control.Alt.Alt_0"]());
    }, Data_Function["const"](Control_Plus.empty(dictPlus)));
};
var alternativeReaderT = function (dictAlternative) {
    return new Control_Alternative.Alternative(function () {
        return applicativeReaderT(dictAlternative["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return plusReaderT(dictAlternative["__superclass_Control.Plus.Plus_1"]());
    });
};
var monadZeroReaderT = function (dictMonadZero) {
    return new Control_MonadZero.MonadZero(function () {
        return alternativeReaderT(dictMonadZero["__superclass_Control.Alternative.Alternative_1"]());
    }, function () {
        return monadReaderT(dictMonadZero["__superclass_Control.Monad.Monad_0"]());
    });
};
var monadPlusReaderT = function (dictMonadPlus) {
    return new Control_MonadPlus.MonadPlus(function () {
        return monadZeroReaderT(dictMonadPlus["__superclass_Control.MonadZero.MonadZero_0"]());
    });
};
module.exports = {
    ReaderT: ReaderT, 
    mapReaderT: mapReaderT, 
    runReaderT: runReaderT, 
    withReaderT: withReaderT, 
    newtypeReaderT: newtypeReaderT, 
    functorReaderT: functorReaderT, 
    applyReaderT: applyReaderT, 
    applicativeReaderT: applicativeReaderT, 
    altReaderT: altReaderT, 
    plusReaderT: plusReaderT, 
    alternativeReaderT: alternativeReaderT, 
    bindReaderT: bindReaderT, 
    monadReaderT: monadReaderT, 
    monadZeroReaderT: monadZeroReaderT, 
    monadPlusReaderT: monadPlusReaderT, 
    monadTransReaderT: monadTransReaderT, 
    monadEffReader: monadEffReader, 
    monadContReaderT: monadContReaderT, 
    monadErrorReaderT: monadErrorReaderT, 
    monadAskReaderT: monadAskReaderT, 
    monadReaderReaderT: monadReaderReaderT, 
    monadStateReaderT: monadStateReaderT, 
    monadTellReaderT: monadTellReaderT, 
    monadWriterReaderT: monadWriterReaderT, 
    distributiveReaderT: distributiveReaderT, 
    monadRecReaderT: monadRecReaderT
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Control.Monad.Cont.Class":30,"../Control.Monad.Eff.Class":32,"../Control.Monad.Error.Class":45,"../Control.Monad.Reader.Class":48,"../Control.Monad.Rec.Class":50,"../Control.Monad.State.Class":53,"../Control.Monad.Trans.Class":54,"../Control.Monad.Writer.Class":55,"../Control.MonadPlus":58,"../Control.MonadZero":59,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Distributive":78,"../Data.Function":89,"../Data.Functor":93,"../Data.Newtype":113,"../Prelude":148}],50:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Unsafe = require("../Control.Monad.Eff.Unsafe");
var Control_Monad_ST = require("../Control.Monad.ST");
var Data_Either = require("../Data.Either");
var Data_Identity = require("../Data.Identity");
var Data_Bifunctor = require("../Data.Bifunctor");
var Partial_Unsafe = require("../Partial.Unsafe");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Control_Applicative = require("../Control.Applicative");
var Data_Unit = require("../Data.Unit");
var Loop = (function () {
    function Loop(value0) {
        this.value0 = value0;
    };
    Loop.create = function (value0) {
        return new Loop(value0);
    };
    return Loop;
})();
var Done = (function () {
    function Done(value0) {
        this.value0 = value0;
    };
    Done.create = function (value0) {
        return new Done(value0);
    };
    return Done;
})();
var MonadRec = function (__superclass_Control$dotMonad$dotMonad_0, tailRecM) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.tailRecM = tailRecM;
};
var tailRecM = function (dict) {
    return dict.tailRecM;
};
var tailRecM2 = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (b) {
                return tailRecM(dictMonadRec)(function (o) {
                    return f(o.a)(o.b);
                })({
                    a: a, 
                    b: b
                });
            };
        };
    };
};
var tailRecM3 = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return tailRecM(dictMonadRec)(function (o) {
                        return f(o.a)(o.b)(o.c);
                    })({
                        a: a, 
                        b: b, 
                        c: c
                    });
                };
            };
        };
    };
};
var tailRecEff = function (f) {
    return function (a) {
        var fromDone = Partial_Unsafe.unsafePartial(function (dictPartial) {
            return function (v) {
                var __unused = function (dictPartial1) {
                    return function ($dollar15) {
                        return $dollar15;
                    };
                };
                return __unused(dictPartial)((function () {
                    if (v instanceof Done) {
                        return v.value0;
                    };
                    throw new Error("Failed pattern match at Control.Monad.Rec.Class line 130, column 14 - line 130, column 42: " + [ v.constructor.name ]);
                })());
            };
        });
        var f$prime = function ($47) {
            return Control_Monad_Eff_Unsafe.unsafeCoerceEff(f($47));
        };
        return function __do() {
            var v = f$prime(a)();
            var v1 = {
                value: v
            };
            (function () {
                while (!(function __do() {
                    var v2 = v1.value;
                    if (v2 instanceof Loop) {
                        var v3 = f$prime(v2.value0)();
                        v1.value = v3;
                        return false;
                    };
                    if (v2 instanceof Done) {
                        return true;
                    };
                    throw new Error("Failed pattern match at Control.Monad.Rec.Class line 119, column 5 - line 124, column 26: " + [ v2.constructor.name ]);
                })()) {

                };
                return {};
            })();
            return Data_Functor.map(Control_Monad_Eff.functorEff)(fromDone)(Control_Monad_ST.readSTRef(v1))();
        };
    };
};
var tailRec = function (f) {
    var go = function (__copy_v) {
        var v = __copy_v;
        tco: while (true) {
            if (v instanceof Loop) {
                var __tco_v = f(v.value0);
                v = __tco_v;
                continue tco;
            };
            if (v instanceof Done) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 93, column 1 - line 96, column 18: " + [ v.constructor.name ]);
        };
    };
    return function ($48) {
        return go(f($48));
    };
};
var monadRecIdentity = new MonadRec(function () {
    return Data_Identity.monadIdentity;
}, function (f) {
    var runIdentity = function (v) {
        return v;
    };
    return function ($49) {
        return Data_Identity.Identity(tailRec(function ($50) {
            return runIdentity(f($50));
        })($49));
    };
});
var monadRecEither = new MonadRec(function () {
    return Data_Either.monadEither;
}, function (f) {
    return function (a0) {
        var g = function (v) {
            if (v instanceof Data_Either.Left) {
                return new Done(new Data_Either.Left(v.value0));
            };
            if (v instanceof Data_Either.Right && v.value0 instanceof Loop) {
                return new Loop(f(v.value0.value0));
            };
            if (v instanceof Data_Either.Right && v.value0 instanceof Done) {
                return new Done(new Data_Either.Right(v.value0.value0));
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 108, column 7 - line 108, column 33: " + [ v.constructor.name ]);
        };
        return tailRec(g)(f(a0));
    };
});
var monadRecEff = new MonadRec(function () {
    return Control_Monad_Eff.monadEff;
}, tailRecEff);
var functorStep = new Data_Functor.Functor(function (f) {
    return function (v) {
        if (v instanceof Loop) {
            return new Loop(v.value0);
        };
        if (v instanceof Done) {
            return new Done(f(v.value0));
        };
        throw new Error("Failed pattern match at Control.Monad.Rec.Class line 28, column 3 - line 28, column 26: " + [ f.constructor.name, v.constructor.name ]);
    };
});
var forever = function (dictMonadRec) {
    return function (ma) {
        return tailRecM(dictMonadRec)(function (u) {
            return Data_Functor.voidRight((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(new Loop(u))(ma);
        })(Data_Unit.unit);
    };
};
var bifunctorStep = new Data_Bifunctor.Bifunctor(function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Loop) {
                return new Loop(v(v2.value0));
            };
            if (v2 instanceof Done) {
                return new Done(v1(v2.value0));
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 32, column 3 - line 32, column 34: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
});
module.exports = {
    Loop: Loop, 
    Done: Done, 
    MonadRec: MonadRec, 
    forever: forever, 
    tailRec: tailRec, 
    tailRecM: tailRecM, 
    tailRecM2: tailRecM2, 
    tailRecM3: tailRecM3, 
    functorStep: functorStep, 
    bifunctorStep: bifunctorStep, 
    monadRecIdentity: monadRecIdentity, 
    monadRecEff: monadRecEff, 
    monadRecEither: monadRecEither
};

},{"../Control.Applicative":13,"../Control.Bind":19,"../Control.Monad.Eff":44,"../Control.Monad.Eff.Unsafe":42,"../Control.Monad.ST":52,"../Control.Semigroupoid":63,"../Data.Bifunctor":71,"../Data.Either":79,"../Data.Functor":93,"../Data.Identity":98,"../Data.Unit":140,"../Partial.Unsafe":145,"../Prelude":148}],51:[function(require,module,exports){
"use strict";

exports.newSTRef = function (val) {
  return function () {
    return { value: val };
  };
};

exports.readSTRef = function (ref) {
  return function () {
    return ref.value;
  };
};

exports.modifySTRef = function (ref) {
  return function (f) {
    return function () {
      /* jshint boss: true */
      return ref.value = f(ref.value);
    };
  };
};

exports.writeSTRef = function (ref) {
  return function (a) {
    return function () {
      /* jshint boss: true */
      return ref.value = a;
    };
  };
};

exports.runST = function (f) {
  return f;
};

},{}],52:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var pureST = function (st) {
    return Control_Monad_Eff.runPure($foreign.runST(st));
};
module.exports = {
    pureST: pureST, 
    modifySTRef: $foreign.modifySTRef, 
    newSTRef: $foreign.newSTRef, 
    readSTRef: $foreign.readSTRef, 
    runST: $foreign.runST, 
    writeSTRef: $foreign.writeSTRef
};

},{"../Control.Monad.Eff":44,"./foreign":51}],53:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var MonadState = function (__superclass_Control$dotMonad$dotMonad_0, state) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.state = state;
};
var state = function (dict) {
    return dict.state;
};
var put = function (dictMonadState) {
    return function (s) {
        return state(dictMonadState)(function (v) {
            return new Data_Tuple.Tuple(Data_Unit.unit, s);
        });
    };
};
var modify = function (dictMonadState) {
    return function (f) {
        return state(dictMonadState)(function (s) {
            return new Data_Tuple.Tuple(Data_Unit.unit, f(s));
        });
    };
};
var gets = function (dictMonadState) {
    return function (f) {
        return state(dictMonadState)(function (s) {
            return new Data_Tuple.Tuple(f(s), s);
        });
    };
};
var get = function (dictMonadState) {
    return state(dictMonadState)(function (s) {
        return new Data_Tuple.Tuple(s, s);
    });
};
module.exports = {
    MonadState: MonadState, 
    get: get, 
    gets: gets, 
    modify: modify, 
    put: put, 
    state: state
};

},{"../Data.Tuple":136,"../Data.Unit":140,"../Prelude":148}],54:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var MonadTrans = function (lift) {
    this.lift = lift;
};
var lift = function (dict) {
    return dict.lift;
};
module.exports = {
    MonadTrans: MonadTrans, 
    lift: lift
};

},{"../Prelude":148}],55:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Tuple = require("../Data.Tuple");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Control_Applicative = require("../Control.Applicative");
var MonadTell = function (__superclass_Control$dotMonad$dotMonad_0, tell) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.tell = tell;
};
var MonadWriter = function (__superclass_Control$dotMonad$dotWriter$dotClass$dotMonadTell_0, listen, pass) {
    this["__superclass_Control.Monad.Writer.Class.MonadTell_0"] = __superclass_Control$dotMonad$dotWriter$dotClass$dotMonadTell_0;
    this.listen = listen;
    this.pass = pass;
};
var tell = function (dict) {
    return dict.tell;
};
var pass = function (dict) {
    return dict.pass;
};
var listen = function (dict) {
    return dict.listen;
};
var listens = function (dictMonadWriter) {
    return function (f) {
        return function (m) {
            return Control_Bind.bind(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(listen(dictMonadWriter)(m))(function (v) {
                return Control_Applicative.pure(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Tuple.Tuple(v.value0, f(v.value1)));
            });
        };
    };
};
var censor = function (dictMonadWriter) {
    return function (f) {
        return function (m) {
            return pass(dictMonadWriter)(Control_Bind.bind(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
                return Control_Applicative.pure(((dictMonadWriter["__superclass_Control.Monad.Writer.Class.MonadTell_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Data_Tuple.Tuple(v, f));
            }));
        };
    };
};
module.exports = {
    MonadTell: MonadTell, 
    MonadWriter: MonadWriter, 
    censor: censor, 
    listen: listen, 
    listens: listens, 
    pass: pass, 
    tell: tell
};

},{"../Control.Applicative":13,"../Control.Bind":19,"../Data.Function":89,"../Data.Tuple":136,"../Prelude":148}],56:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Tuple = require("../Data.Tuple");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Apply = require("../Control.Apply");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Unit = require("../Data.Unit");
var WriterT = function (x) {
    return x;
};
var runWriterT = function (v) {
    return v;
};
var newtypeWriterT = new Data_Newtype.Newtype(function (n) {
    return n;
}, WriterT);
var monadTransWriterT = function (dictMonoid) {
    return new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
        return function (m) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Tuple.Tuple(v, Data_Monoid.mempty(dictMonoid)));
            });
        };
    });
};
var mapWriterT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorWriterT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return mapWriterT(Data_Functor.map(dictFunctor)(function (v) {
            return new Data_Tuple.Tuple(f(v.value0), v.value1);
        }));
    });
};
var execWriterT = function (dictFunctor) {
    return function (v) {
        return Data_Functor.map(dictFunctor)(Data_Tuple.snd)(v);
    };
};
var applyWriterT = function (dictSemigroup) {
    return function (dictApply) {
        return new Control_Apply.Apply(function () {
            return functorWriterT(dictApply["__superclass_Data.Functor.Functor_0"]());
        }, function (v) {
            return function (v1) {
                var k = function (v3) {
                    return function (v4) {
                        return new Data_Tuple.Tuple(v3.value0(v4.value0), Data_Semigroup.append(dictSemigroup)(v3.value1)(v4.value1));
                    };
                };
                return Control_Apply.apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(k)(v))(v1);
            };
        });
    };
};
var bindWriterT = function (dictSemigroup) {
    return function (dictBind) {
        return new Control_Bind.Bind(function () {
            return applyWriterT(dictSemigroup)(dictBind["__superclass_Control.Apply.Apply_0"]());
        }, function (v) {
            return function (k) {
                return WriterT(Control_Bind.bind(dictBind)(v)(function (v1) {
                    var $81 = k(v1.value0);
                    return Data_Functor.map((dictBind["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(function (v2) {
                        return new Data_Tuple.Tuple(v2.value0, Data_Semigroup.append(dictSemigroup)(v1.value1)(v2.value1));
                    })($81);
                }));
            };
        });
    };
};
var applicativeWriterT = function (dictMonoid) {
    return function (dictApplicative) {
        return new Control_Applicative.Applicative(function () {
            return applyWriterT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictApplicative["__superclass_Control.Apply.Apply_0"]());
        }, function (a) {
            return WriterT(Control_Applicative.pure(dictApplicative)(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
        });
    };
};
var monadWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad.Monad(function () {
            return applicativeWriterT(dictMonoid)(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
        }, function () {
            return bindWriterT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictMonad["__superclass_Control.Bind.Bind_1"]());
        });
    };
};
var monadAskWriterT = function (dictMonoid) {
    return function (dictMonadAsk) {
        return new Control_Monad_Reader_Class.MonadAsk(function () {
            return monadWriterT(dictMonoid)(dictMonadAsk["__superclass_Control.Monad.Monad_0"]());
        }, Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadAsk["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
    };
};
var monadReaderWriterT = function (dictMonoid) {
    return function (dictMonadReader) {
        return new Control_Monad_Reader_Class.MonadReader(function () {
            return monadAskWriterT(dictMonoid)(dictMonadReader["__superclass_Control.Monad.Reader.Class.MonadAsk_0"]());
        }, function (f) {
            return mapWriterT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
        });
    };
};
var monadContWriterT = function (dictMonoid) {
    return function (dictMonadCont) {
        return new Control_Monad_Cont_Class.MonadCont(function () {
            return monadWriterT(dictMonoid)(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return WriterT(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
                var $87 = f(function (a) {
                    return WriterT(c(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
                });
                return $87;
            }));
        });
    };
};
var monadEffWriter = function (dictMonoid) {
    return function (dictMonadEff) {
        return new Control_Monad_Eff_Class.MonadEff(function () {
            return monadWriterT(dictMonoid)(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
        }, function ($113) {
            return Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($113));
        });
    };
};
var monadErrorWriterT = function (dictMonoid) {
    return function (dictMonadError) {
        return new Control_Monad_Error_Class.MonadError(function () {
            return monadWriterT(dictMonoid)(dictMonadError["__superclass_Control.Monad.Monad_0"]());
        }, function (v) {
            return function (h) {
                return WriterT(Control_Monad_Error_Class.catchError(dictMonadError)(v)(function (e) {
                    var $90 = h(e);
                    return $90;
                }));
            };
        }, function (e) {
            return Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadError["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Error_Class.throwError(dictMonadError)(e));
        });
    };
};
var monadRecWriterT = function (dictMonoid) {
    return function (dictMonadRec) {
        return new Control_Monad_Rec_Class.MonadRec(function () {
            return monadWriterT(dictMonoid)(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return function (a) {
                var f$prime = function (v) {
                    return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())((function () {
                        var $92 = f(v.value0);
                        return $92;
                    })())(function (v1) {
                        return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                            if (v1.value0 instanceof Control_Monad_Rec_Class.Loop) {
                                return new Control_Monad_Rec_Class.Loop(new Data_Tuple.Tuple(v1.value0.value0, Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v.value1)(v1.value1)));
                            };
                            if (v1.value0 instanceof Control_Monad_Rec_Class.Done) {
                                return new Control_Monad_Rec_Class.Done(new Data_Tuple.Tuple(v1.value0.value0, Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v.value1)(v1.value1)));
                            };
                            throw new Error("Failed pattern match at Control.Monad.Writer.Trans line 85, column 11 - line 87, column 47: " + [ v1.value0.constructor.name ]);
                        })());
                    });
                };
                return WriterT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(f$prime)(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
            };
        });
    };
};
var monadStateWriterT = function (dictMonoid) {
    return function (dictMonadState) {
        return new Control_Monad_State_Class.MonadState(function () {
            return monadWriterT(dictMonoid)(dictMonadState["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)(f));
        });
    };
};
var monadTellWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad_Writer_Class.MonadTell(function () {
            return monadWriterT(dictMonoid)(dictMonad);
        }, function ($114) {
            return WriterT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Tuple.Tuple.create(Data_Unit.unit)($114)));
        });
    };
};
var monadWriterWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad_Writer_Class.MonadWriter(function () {
            return monadTellWriterT(dictMonoid)(dictMonad);
        }, function (v) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Tuple.Tuple(new Data_Tuple.Tuple(v1.value0, v1.value1), v1.value1));
            });
        }, function (v) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Tuple.Tuple(v1.value0.value0, v1.value0.value1(v1.value1)));
            });
        });
    };
};
var altWriterT = function (dictAlt) {
    return new Control_Alt.Alt(function () {
        return functorWriterT(dictAlt["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return Control_Alt.alt(dictAlt)(v)(v1);
        };
    });
};
var plusWriterT = function (dictPlus) {
    return new Control_Plus.Plus(function () {
        return altWriterT(dictPlus["__superclass_Control.Alt.Alt_0"]());
    }, Control_Plus.empty(dictPlus));
};
var alternativeWriterT = function (dictMonoid) {
    return function (dictAlternative) {
        return new Control_Alternative.Alternative(function () {
            return applicativeWriterT(dictMonoid)(dictAlternative["__superclass_Control.Applicative.Applicative_0"]());
        }, function () {
            return plusWriterT(dictAlternative["__superclass_Control.Plus.Plus_1"]());
        });
    };
};
var monadZeroWriterT = function (dictMonoid) {
    return function (dictMonadZero) {
        return new Control_MonadZero.MonadZero(function () {
            return alternativeWriterT(dictMonoid)(dictMonadZero["__superclass_Control.Alternative.Alternative_1"]());
        }, function () {
            return monadWriterT(dictMonoid)(dictMonadZero["__superclass_Control.Monad.Monad_0"]());
        });
    };
};
var monadPlusWriterT = function (dictMonoid) {
    return function (dictMonadPlus) {
        return new Control_MonadPlus.MonadPlus(function () {
            return monadZeroWriterT(dictMonoid)(dictMonadPlus["__superclass_Control.MonadZero.MonadZero_0"]());
        });
    };
};
module.exports = {
    WriterT: WriterT, 
    execWriterT: execWriterT, 
    mapWriterT: mapWriterT, 
    runWriterT: runWriterT, 
    newtypeWriterT: newtypeWriterT, 
    functorWriterT: functorWriterT, 
    applyWriterT: applyWriterT, 
    applicativeWriterT: applicativeWriterT, 
    altWriterT: altWriterT, 
    plusWriterT: plusWriterT, 
    alternativeWriterT: alternativeWriterT, 
    bindWriterT: bindWriterT, 
    monadWriterT: monadWriterT, 
    monadRecWriterT: monadRecWriterT, 
    monadZeroWriterT: monadZeroWriterT, 
    monadPlusWriterT: monadPlusWriterT, 
    monadTransWriterT: monadTransWriterT, 
    monadEffWriter: monadEffWriter, 
    monadContWriterT: monadContWriterT, 
    monadErrorWriterT: monadErrorWriterT, 
    monadAskWriterT: monadAskWriterT, 
    monadReaderWriterT: monadReaderWriterT, 
    monadStateWriterT: monadStateWriterT, 
    monadTellWriterT: monadTellWriterT, 
    monadWriterWriterT: monadWriterWriterT
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Control.Monad.Cont.Class":30,"../Control.Monad.Eff.Class":32,"../Control.Monad.Error.Class":45,"../Control.Monad.Reader.Class":48,"../Control.Monad.Rec.Class":50,"../Control.Monad.State.Class":53,"../Control.Monad.Trans.Class":54,"../Control.Monad.Writer.Class":55,"../Control.MonadPlus":58,"../Control.MonadZero":59,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Function":89,"../Data.Functor":93,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Semigroup":123,"../Data.Tuple":136,"../Data.Unit":140,"../Prelude":148}],57:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Monad = function (__superclass_Control$dotApplicative$dotApplicative_0, __superclass_Control$dotBind$dotBind_1) {
    this["__superclass_Control.Applicative.Applicative_0"] = __superclass_Control$dotApplicative$dotApplicative_0;
    this["__superclass_Control.Bind.Bind_1"] = __superclass_Control$dotBind$dotBind_1;
};
var whenM = function (dictMonad) {
    return function (mb) {
        return function (m) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(mb)(function (v) {
                return Control_Applicative.when(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v)(m);
            });
        };
    };
};
var unlessM = function (dictMonad) {
    return function (mb) {
        return function (m) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(mb)(function (v) {
                return Control_Applicative.unless(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v)(m);
            });
        };
    };
};
var monadFn = new Monad(function () {
    return Control_Applicative.applicativeFn;
}, function () {
    return Control_Bind.bindFn;
});
var monadArray = new Monad(function () {
    return Control_Applicative.applicativeArray;
}, function () {
    return Control_Bind.bindArray;
});
var liftM1 = function (dictMonad) {
    return function (f) {
        return function (a) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(a)(function (v) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(f(v));
            });
        };
    };
};
var ap = function (dictMonad) {
    return function (f) {
        return function (a) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(f)(function (v) {
                return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(a)(function (v1) {
                    return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v(v1));
                });
            });
        };
    };
};
module.exports = {
    Monad: Monad, 
    ap: ap, 
    liftM1: liftM1, 
    unlessM: unlessM, 
    whenM: whenM, 
    monadFn: monadFn, 
    monadArray: monadArray
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Data.Functor":93,"../Data.Unit":140}],58:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var MonadPlus = function (__superclass_Control$dotMonadZero$dotMonadZero_0) {
    this["__superclass_Control.MonadZero.MonadZero_0"] = __superclass_Control$dotMonadZero$dotMonadZero_0;
};
var monadPlusArray = new MonadPlus(function () {
    return Control_MonadZero.monadZeroArray;
});
module.exports = {
    MonadPlus: MonadPlus, 
    monadPlusArray: monadPlusArray
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Control.MonadZero":59,"../Control.Plus":62,"../Data.Functor":93}],59:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var MonadZero = function (__superclass_Control$dotAlternative$dotAlternative_1, __superclass_Control$dotMonad$dotMonad_0) {
    this["__superclass_Control.Alternative.Alternative_1"] = __superclass_Control$dotAlternative$dotAlternative_1;
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
};
var monadZeroArray = new MonadZero(function () {
    return Control_Alternative.alternativeArray;
}, function () {
    return Control_Monad.monadArray;
});
var guard = function (dictMonadZero) {
    return function (v) {
        if (v) {
            return Control_Applicative.pure((dictMonadZero["__superclass_Control.Alternative.Alternative_1"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Unit.unit);
        };
        if (!v) {
            return Control_Plus.empty((dictMonadZero["__superclass_Control.Alternative.Alternative_1"]())["__superclass_Control.Plus.Plus_1"]());
        };
        throw new Error("Failed pattern match at Control.MonadZero line 52, column 1 - line 52, column 23: " + [ v.constructor.name ]);
    };
};
module.exports = {
    MonadZero: MonadZero, 
    guard: guard, 
    monadZeroArray: monadZeroArray
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad":57,"../Control.Plus":62,"../Data.Functor":93,"../Data.Unit":140}],60:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Trans = require("../Control.Monad.Cont.Trans");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Ref = require("../Control.Monad.Eff.Ref");
var Control_Monad_Eff_Unsafe = require("../Control.Monad.Eff.Unsafe");
var Control_Monad_Except_Trans = require("../Control.Monad.Except.Trans");
var Control_Monad_Maybe_Trans = require("../Control.Monad.Maybe.Trans");
var Control_Monad_Reader_Trans = require("../Control.Monad.Reader.Trans");
var Control_Monad_Writer_Trans = require("../Control.Monad.Writer.Trans");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Functor_Compose = require("../Data.Functor.Compose");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Apply = require("../Control.Apply");
var Data_Function = require("../Data.Function");
var Control_Bind = require("../Control.Bind");
var Control_Applicative = require("../Control.Applicative");
var Data_Unit = require("../Data.Unit");
var ParCont = function (x) {
    return x;
};
var Parallel = function (__superclass_Control$dotApplicative$dotApplicative_1, __superclass_Control$dotMonad$dotMonad_0, parallel, sequential) {
    this["__superclass_Control.Applicative.Applicative_1"] = __superclass_Control$dotApplicative$dotApplicative_1;
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.parallel = parallel;
    this.sequential = sequential;
};
var unsafeWithRef = Control_Monad_Eff_Unsafe.unsafeCoerceEff;
var sequential = function (dict) {
    return dict.sequential;
};
var parallel = function (dict) {
    return dict.parallel;
};
var newtypeParCont = new Data_Newtype.Newtype(function (n) {
    return n;
}, ParCont);
var monadParWriterT = function (dictMonoid) {
    return function (dictParallel) {
        return new Parallel(function () {
            return Control_Monad_Writer_Trans.applicativeWriterT(dictMonoid)(dictParallel["__superclass_Control.Applicative.Applicative_1"]());
        }, function () {
            return Control_Monad_Writer_Trans.monadWriterT(dictMonoid)(dictParallel["__superclass_Control.Monad.Monad_0"]());
        }, Control_Monad_Writer_Trans.mapWriterT(parallel(dictParallel)), Control_Monad_Writer_Trans.mapWriterT(sequential(dictParallel)));
    };
};
var monadParReaderT = function (dictParallel) {
    return new Parallel(function () {
        return Control_Monad_Reader_Trans.applicativeReaderT(dictParallel["__superclass_Control.Applicative.Applicative_1"]());
    }, function () {
        return Control_Monad_Reader_Trans.monadReaderT(dictParallel["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Reader_Trans.mapReaderT(parallel(dictParallel)), Control_Monad_Reader_Trans.mapReaderT(sequential(dictParallel)));
};
var monadParMaybeT = function (dictParallel) {
    return new Parallel(function () {
        return Data_Functor_Compose.applicativeCompose(dictParallel["__superclass_Control.Applicative.Applicative_1"]())(Data_Maybe.applicativeMaybe);
    }, function () {
        return Control_Monad_Maybe_Trans.monadMaybeT(dictParallel["__superclass_Control.Monad.Monad_0"]());
    }, function (v) {
        return parallel(dictParallel)(v);
    }, function (v) {
        return sequential(dictParallel)(v);
    });
};
var monadParExceptT = function (dictParallel) {
    return new Parallel(function () {
        return Data_Functor_Compose.applicativeCompose(dictParallel["__superclass_Control.Applicative.Applicative_1"]())(Data_Either.applicativeEither);
    }, function () {
        return Control_Monad_Except_Trans.monadExceptT(dictParallel["__superclass_Control.Monad.Monad_0"]());
    }, function (v) {
        return parallel(dictParallel)(v);
    }, function (v) {
        return sequential(dictParallel)(v);
    });
};
var monadParParCont = function (dictMonadEff) {
    return new Parallel(function () {
        return applicativeParCont(dictMonadEff);
    }, function () {
        return Control_Monad_Cont_Trans.monadContT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, ParCont, function (v) {
        return v;
    });
};
var functorParCont = function (dictMonadEff) {
    return new Data_Functor.Functor(function (f) {
        return function ($55) {
            return parallel(monadParParCont(dictMonadEff))(Data_Functor.map(Control_Monad_Cont_Trans.functorContT((((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]()))(f)(sequential(monadParParCont(dictMonadEff))($55)));
        };
    });
};
var applyParCont = function (dictMonadEff) {
    return new Control_Apply.Apply(function () {
        return functorParCont(dictMonadEff);
    }, function (v) {
        return function (v1) {
            return ParCont(function (k) {
                return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value))))(function (v2) {
                    return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value))))(function (v3) {
                        return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Cont_Trans.runContT(v)(function (a) {
                            return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v3))))(function (v4) {
                                if (v4 instanceof Data_Maybe.Nothing) {
                                    return Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v2)(new Data_Maybe.Just(a))));
                                };
                                if (v4 instanceof Data_Maybe.Just) {
                                    return k(a(v4.value0));
                                };
                                throw new Error("Failed pattern match at Control.Parallel.Class line 81, column 7 - line 83, column 26: " + [ v4.constructor.name ]);
                            });
                        }))(function () {
                            return Control_Monad_Cont_Trans.runContT(v1)(function (b) {
                                return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v2))))(function (v4) {
                                    if (v4 instanceof Data_Maybe.Nothing) {
                                        return Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v3)(new Data_Maybe.Just(b))));
                                    };
                                    if (v4 instanceof Data_Maybe.Just) {
                                        return k(v4.value0(b));
                                    };
                                    throw new Error("Failed pattern match at Control.Parallel.Class line 87, column 7 - line 89, column 26: " + [ v4.constructor.name ]);
                                });
                            });
                        });
                    });
                });
            });
        };
    });
};
var applicativeParCont = function (dictMonadEff) {
    return new Control_Applicative.Applicative(function () {
        return applyParCont(dictMonadEff);
    }, function ($56) {
        return parallel(monadParParCont(dictMonadEff))(Control_Applicative.pure(Control_Monad_Cont_Trans.applicativeContT((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]()))($56));
    });
};
var altParCont = function (dictMonadEff) {
    return new Control_Alt.Alt(function () {
        return functorParCont(dictMonadEff);
    }, function (v) {
        return function (v1) {
            return ParCont(function (k) {
                return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.newRef(false))))(function (v2) {
                    return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Cont_Trans.runContT(v)(function (a) {
                        return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v2))))(function (v3) {
                            if (v3) {
                                return Control_Applicative.pure((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Unit.unit);
                            };
                            if (!v3) {
                                return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v2)(true))))(function () {
                                    return k(a);
                                });
                            };
                            throw new Error("Failed pattern match at Control.Parallel.Class line 100, column 7 - line 104, column 14: " + [ v3.constructor.name ]);
                        });
                    }))(function () {
                        return Control_Monad_Cont_Trans.runContT(v1)(function (a) {
                            return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v2))))(function (v3) {
                                if (v3) {
                                    return Control_Applicative.pure((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Unit.unit);
                                };
                                if (!v3) {
                                    return Control_Bind.bind((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v2)(true))))(function () {
                                        return k(a);
                                    });
                                };
                                throw new Error("Failed pattern match at Control.Parallel.Class line 108, column 7 - line 112, column 14: " + [ v3.constructor.name ]);
                            });
                        });
                    });
                });
            });
        };
    });
};
var plusParCont = function (dictMonadEff) {
    return new Control_Plus.Plus(function () {
        return altParCont(dictMonadEff);
    }, ParCont(function (v) {
        return Control_Applicative.pure((dictMonadEff["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Unit.unit);
    }));
};
var alternativeParCont = function (dictMonadEff) {
    return new Control_Alternative.Alternative(function () {
        return applicativeParCont(dictMonadEff);
    }, function () {
        return plusParCont(dictMonadEff);
    });
};
module.exports = {
    ParCont: ParCont, 
    Parallel: Parallel, 
    parallel: parallel, 
    sequential: sequential, 
    monadParExceptT: monadParExceptT, 
    monadParReaderT: monadParReaderT, 
    monadParWriterT: monadParWriterT, 
    monadParMaybeT: monadParMaybeT, 
    newtypeParCont: newtypeParCont, 
    functorParCont: functorParCont, 
    applyParCont: applyParCont, 
    applicativeParCont: applicativeParCont, 
    altParCont: altParCont, 
    plusParCont: plusParCont, 
    alternativeParCont: alternativeParCont, 
    monadParParCont: monadParParCont
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Monad.Cont.Trans":31,"../Control.Monad.Eff":44,"../Control.Monad.Eff.Class":32,"../Control.Monad.Eff.Ref":38,"../Control.Monad.Eff.Unsafe":42,"../Control.Monad.Except.Trans":46,"../Control.Monad.Maybe.Trans":47,"../Control.Monad.Reader.Trans":49,"../Control.Monad.Writer.Trans":56,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Either":79,"../Data.Function":89,"../Data.Functor":93,"../Data.Functor.Compose":90,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Unit":140,"../Prelude":148}],61:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Parallel_Class = require("../Control.Parallel.Class");
var Data_Foldable = require("../Data.Foldable");
var Data_Traversable = require("../Data.Traversable");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Category = require("../Control.Category");
var parTraverse_ = function (dictParallel) {
    return function (dictFoldable) {
        return function (f) {
            return function ($8) {
                return Control_Parallel_Class.sequential(dictParallel)(Data_Foldable.traverse_(dictParallel["__superclass_Control.Applicative.Applicative_1"]())(dictFoldable)(function ($9) {
                    return Control_Parallel_Class.parallel(dictParallel)(f($9));
                })($8));
            };
        };
    };
};
var parTraverse = function (dictParallel) {
    return function (dictTraversable) {
        return function (f) {
            return function ($10) {
                return Control_Parallel_Class.sequential(dictParallel)(Data_Traversable.traverse(dictTraversable)(dictParallel["__superclass_Control.Applicative.Applicative_1"]())(function ($11) {
                    return Control_Parallel_Class.parallel(dictParallel)(f($11));
                })($10));
            };
        };
    };
};
var parSequence_ = function (dictParallel) {
    return function (dictTraversable) {
        return parTraverse_(dictParallel)(dictTraversable["__superclass_Data.Foldable.Foldable_1"]())(Control_Category.id(Control_Category.categoryFn));
    };
};
var parSequence = function (dictParallel) {
    return function (dictTraversable) {
        return parTraverse(dictParallel)(dictTraversable)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    parSequence: parSequence, 
    parSequence_: parSequence_, 
    parTraverse: parTraverse, 
    parTraverse_: parTraverse_
};

},{"../Control.Category":20,"../Control.Parallel.Class":60,"../Control.Semigroupoid":63,"../Data.Foldable":86,"../Data.Traversable":134,"../Prelude":148}],62:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Alt = require("../Control.Alt");
var Data_Functor = require("../Data.Functor");
var Plus = function (__superclass_Control$dotAlt$dotAlt_0, empty) {
    this["__superclass_Control.Alt.Alt_0"] = __superclass_Control$dotAlt$dotAlt_0;
    this.empty = empty;
};
var plusArray = new Plus(function () {
    return Control_Alt.altArray;
}, [  ]);
var empty = function (dict) {
    return dict.empty;
};
module.exports = {
    Plus: Plus, 
    empty: empty, 
    plusArray: plusArray
};

},{"../Control.Alt":11,"../Data.Functor":93}],63:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Semigroupoid = function (compose) {
    this.compose = compose;
};
var semigroupoidFn = new Semigroupoid(function (f) {
    return function (g) {
        return function (x) {
            return f(g(x));
        };
    };
});
var compose = function (dict) {
    return dict.compose;
};
var composeFlipped = function (dictSemigroupoid) {
    return function (f) {
        return function (g) {
            return compose(dictSemigroupoid)(g)(f);
        };
    };
};
module.exports = {
    Semigroupoid: Semigroupoid, 
    compose: compose, 
    composeFlipped: composeFlipped, 
    semigroupoidFn: semigroupoidFn
};

},{}],64:[function(require,module,exports){
var xs = require('xstream').default;
var flattenConcurrently = require('xstream/extra/flattenConcurrently').default;
var concat = require('xstream/extra/concat').default;
var delay = require('xstream/extra/delay').default;

exports._addListener = function (effL, s) {
  return function () {
    return s.addListener({
      next: function (a) {
        return effL.next(a)();
      },
      error: function (e) {
        return effL.error(e)();
      },
      complete: function () {
        return effL.complete()();
      }
    });
  };
};

exports._combine = function (p, s1, s2) {
  return xs.combine(
    s1,
    s2
  ).map(function (r) {
    return p(r[0])(r[1]);
  });
};

exports._concat = function (s1, s2) {
  return concat(s1, s2);
};

exports._delay = function (i, s) {
  return function () {
    return s.compose(delay(i));
  };
};

exports._drop = function (s, i) {
  return s.drop(i);
};

exports._fold = function (p, x, s) {
  return s.fold(function (b, a) {
    return p(b)(a);
  }, x);
};

exports._empty = xs.empty();

exports._endWhen = function (s1, s2) {
  return s1.endWhen(s2);
};

exports._filter = function(s, p) {
  return s.filter(p);
};

exports._flatMap = function (s, p) {
  return s.map(p).compose(flattenConcurrently);
};

exports._flatMapEff = function (s, effP) {
  return function () {
    return s.map(function (a) {
      var result = effP(a)();
      return result;
    }).compose(flattenConcurrently);
  };
};

exports._flatMapLatest = function (s, p) {
  return s.map(p).flatten();
};

exports._flatMapLatestEff = function (s, effP) {
  return function () {
    return s.map(function (a) {
      var result = effP(a)();
      return result;
    }).flatten();
  };
};

exports._imitate = function (s1, s2) {
  return function () {
    s1.imitate(s2);
  };
};

exports._last = function (s) {
  return s.last();
};

exports._map = function (p, s) {
  return s.map(p);
};

exports._mapTo = function (s, v) {
  return s.mapTo(v);
};

exports._merge = function (s1, s2) {
  return xs.merge(s1, s2);
};

exports._of = xs.of;

exports._startWith = function (s, x) {
  return s.startWith(x);
};

exports._replaceError = function (s, p) {
  return s.replaceError(p);
}

exports._take = function (s, i) {
  return s.take(i);
};

var adaptListenerToEff = function (l) {
  return {
    next: function (x) {
      return function () {
        l.next(x);
      }
    },
    error: function (e) {
      return function () {
        l.error(e);
      }
    },
    complete: function () {
      return function () {
        l.complete();
      }
    }
  };
};

var adaptEffProducer = function (p) {
  return {
    start: function (x) {
      return p.start(adaptListenerToEff(x))();
    },
    stop: function () {
      return p.stop()();
    }
  };
};

exports.create = function (p) {
  return function () {
    return xs.create(adaptEffProducer(p));
  };
};

exports["create'"] = function () {
  return function () {
    return xs.create();
  };
};

exports.createWithMemory = function (p) {
  return function () {
    return xs.createWithMemory(adaptEffProducer(p));
  };
};

exports.flatten = function (s) {
  return s.flatten();
};

exports.flattenEff = function (s) {
  return function () {
    return s.map(function (effS) {
      return effS();
    }).flatten();
  };
};

exports.fromArray = xs.fromArray;

exports.never = xs.never();

exports.periodic = function (t) {
  return function () {
    return xs.periodic(t);
  };
};

exports.remember = function (s) {
  return s.remember()
};

exports.throw = xs.throw;

exports.unsafeLog = function (a) {
  return function () {
    console.log(a);
  }
}

},{"xstream":10,"xstream/extra/concat":7,"xstream/extra/delay":8,"xstream/extra/flattenConcurrently":9}],65:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Monad_Aff = require("../Control.Monad.Aff");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Console = require("../Control.Monad.Eff.Console");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Control_Monad_Eff_Ref = require("../Control.Monad.Eff.Ref");
var Control_Monad_Eff_Timer = require("../Control.Monad.Eff.Timer");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var take = function (i) {
    return function (s) {
        return $foreign._take(s, i);
    };
};
var switchMapEff = function (s) {
    return function (effP) {
        return $foreign._flatMapLatestEff(s, effP);
    };
};
var switchMap = function (s) {
    return function (p) {
        return $foreign._flatMapLatest(s, p);
    };
};
var startWith = function (x) {
    return function (s) {
        return $foreign._startWith(s, x);
    };
};
var semigroupStream = new Data_Semigroup.Semigroup(Data_Function_Uncurried.runFn2($foreign._concat));
var replaceError = function (p) {
    return function (s) {
        return $foreign._replaceError(s, p);
    };
};
var monoidStream = new Data_Monoid.Monoid(function () {
    return semigroupStream;
}, $foreign._empty);
var mapTo = function (v) {
    return function (s) {
        return $foreign._mapTo(s, v);
    };
};
var last = function (s) {
    return $foreign._last(s);
};
var imitate = function (s1) {
    return function (s2) {
        return Control_Monad_Eff_Exception["try"]($foreign._imitate(s1, s2));
    };
};
var functorStream = new Data_Functor.Functor(Data_Function_Uncurried.runFn2($foreign._map));
var fromCallback = function (cb) {
    return $foreign.create({
        start: function (l) {
            return Data_Functor["void"](Control_Monad_Eff.functorEff)(cb(l.next));
        }, 
        stop: Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit))
    });
};
var fromAff = function (aff) {
    return function __do() {
        var v = Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value)();
        return $foreign.create({
            start: function (l) {
                return function __do() {
                    var v1 = Control_Monad_Aff.runAff(l.error)(function (a) {
                        return function __do() {
                            l.next(a)();
                            return l.complete(Data_Unit.unit)();
                        };
                    })(aff)();
                    return Control_Monad_Eff_Class.liftEff(Control_Monad_Eff_Class.monadEffEff)(Control_Monad_Eff_Ref.writeRef(v)(new Data_Maybe.Just(v1)))();
                };
            }, 
            stop: function (v1) {
                return function __do() {
                    var v2 = Control_Monad_Eff_Ref.readRef(v)();
                    if (v2 instanceof Data_Maybe.Just) {
                        return Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Monad_Aff.runAff(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))(Control_Monad_Aff.cancel(v2.value0)(Control_Monad_Eff_Exception.error("Unsubscribed"))))();
                    };
                    if (v2 instanceof Data_Maybe.Nothing) {
                        return Data_Unit.unit;
                    };
                    throw new Error("Failed pattern match at Control.XStream line 174, column 9 - line 176, column 31: " + [ v2.constructor.name ]);
                };
            }
        })();
    };
};
var fold = function (p) {
    return function (x) {
        return function (s) {
            return $foreign._fold(p, x, s);
        };
    };
};
var filter = function (p) {
    return function (s) {
        return $foreign._filter(s, p);
    };
};
var endWhen = function (s1) {
    return function (s2) {
        return $foreign._endWhen(s1, s2);
    };
};
var drop = function (i) {
    return function (s) {
        return $foreign._drop(s, i);
    };
};
var delay = function (i) {
    return function (s) {
        return $foreign._delay(i, s);
    };
};
var defaultListener = {
    next: $foreign.unsafeLog, 
    error: function ($10) {
        return Control_Monad_Eff_Console.log(Control_Monad_Eff_Exception.message($10));
    }, 
    complete: Control_Applicative.pure(Control_Monad_Eff.applicativeEff)
};
var bindEff = function (s) {
    return function (effP) {
        return $foreign._flatMapEff(s, effP);
    };
};
var applyStream = new Control_Apply.Apply(function () {
    return functorStream;
}, Data_Function_Uncurried.runFn3($foreign._combine)(Control_Category.id(Control_Category.categoryFn)));
var bindStream = new Control_Bind.Bind(function () {
    return applyStream;
}, Data_Function_Uncurried.runFn2($foreign._flatMap));
var applicativeStream = new Control_Applicative.Applicative(function () {
    return applyStream;
}, $foreign._of);
var monadStream = new Control_Monad.Monad(function () {
    return applicativeStream;
}, function () {
    return bindStream;
});
var altStream = new Control_Alt.Alt(function () {
    return functorStream;
}, Data_Function_Uncurried.runFn2($foreign._merge));
var plusStream = new Control_Plus.Plus(function () {
    return altStream;
}, $foreign._empty);
var addListener = function (l) {
    return function (s) {
        return $foreign._addListener(l, s);
    };
};
module.exports = {
    addListener: addListener, 
    bindEff: bindEff, 
    defaultListener: defaultListener, 
    delay: delay, 
    drop: drop, 
    endWhen: endWhen, 
    filter: filter, 
    fold: fold, 
    fromAff: fromAff, 
    fromCallback: fromCallback, 
    imitate: imitate, 
    last: last, 
    mapTo: mapTo, 
    replaceError: replaceError, 
    startWith: startWith, 
    switchMap: switchMap, 
    switchMapEff: switchMapEff, 
    take: take, 
    functorStream: functorStream, 
    applyStream: applyStream, 
    applicativeStream: applicativeStream, 
    bindStream: bindStream, 
    monadStream: monadStream, 
    semigroupStream: semigroupStream, 
    altStream: altStream, 
    monoidStream: monoidStream, 
    plusStream: plusStream, 
    create: $foreign.create, 
    "create'": $foreign["create'"], 
    createWithMemory: $foreign.createWithMemory, 
    flatten: $foreign.flatten, 
    flattenEff: $foreign.flattenEff, 
    fromArray: $foreign.fromArray, 
    never: $foreign.never, 
    periodic: $foreign.periodic, 
    remember: $foreign.remember, 
    "throw": $foreign["throw"]
};

},{"../Control.Alt":11,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Monad":57,"../Control.Monad.Aff":29,"../Control.Monad.Eff":44,"../Control.Monad.Eff.Class":32,"../Control.Monad.Eff.Console":34,"../Control.Monad.Eff.Exception":36,"../Control.Monad.Eff.Ref":38,"../Control.Monad.Eff.Timer":40,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Either":79,"../Data.Function":89,"../Data.Function.Uncurried":88,"../Data.Functor":93,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Semigroup":123,"../Data.Unit":140,"../Prelude":148,"./foreign":64}],66:[function(require,module,exports){
"use strict";

exports.runSTArray = function (f) {
  return f;
};

exports.emptySTArray = function () {
  return [];
};

exports.peekSTArrayImpl = function (just) {
  return function (nothing) {
    return function (xs) {
      return function (i) {
        return function () {
          return i >= 0 && i < xs.length ? just(xs[i]) : nothing;
        };
      };
    };
  };
};

exports.pokeSTArray = function (xs) {
  return function (i) {
    return function (a) {
      return function () {
        var ret = i >= 0 && i < xs.length;
        if (ret) xs[i] = a;
        return ret;
      };
    };
  };
};

exports.pushAllSTArray = function (xs) {
  return function (as) {
    return function () {
      return xs.push.apply(xs, as);
    };
  };
};

exports.spliceSTArray = function (xs) {
  return function (i) {
    return function (howMany) {
      return function (bs) {
        return function () {
          return xs.splice.apply(xs, [i, howMany].concat(bs));
        };
      };
    };
  };
};

exports.copyImpl = function (xs) {
  return function () {
    return xs.slice();
  };
};

exports.toAssocArray = function (xs) {
  return function () {
    var n = xs.length;
    var as = new Array(n);
    for (var i = 0; i < n; i++) as[i] = { value: xs[i], index: i };
    return as;
  };
};

},{}],67:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_ST = require("../Control.Monad.ST");
var Data_Maybe = require("../Data.Maybe");
var thaw = $foreign.copyImpl;
var pushSTArray = function (arr) {
    return function (a) {
        return $foreign.pushAllSTArray(arr)([ a ]);
    };
};
var peekSTArray = $foreign.peekSTArrayImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var freeze = $foreign.copyImpl;
module.exports = {
    freeze: freeze, 
    peekSTArray: peekSTArray, 
    pushSTArray: pushSTArray, 
    thaw: thaw, 
    emptySTArray: $foreign.emptySTArray, 
    pokeSTArray: $foreign.pokeSTArray, 
    pushAllSTArray: $foreign.pushAllSTArray, 
    runSTArray: $foreign.runSTArray, 
    spliceSTArray: $foreign.spliceSTArray, 
    toAssocArray: $foreign.toAssocArray
};

},{"../Control.Monad.Eff":44,"../Control.Monad.ST":52,"../Data.Maybe":104,"./foreign":66}],68:[function(require,module,exports){
"use strict";

//------------------------------------------------------------------------------
// Array creation --------------------------------------------------------------
//------------------------------------------------------------------------------

exports.range = function (start) {
  return function (end) {
    var step = start > end ? -1 : 1;
    var result = [];
    for (var i = start, n = 0; i !== end; i += step) {
      result[n++] = i;
    }
    result[n] = i;
    return result;
  };
};

exports.replicate = function (count) {
  return function (value) {
    var result = [];
    var n = 0;
    for (var i = 0; i < count; i++) {
      result[n++] = value;
    }
    return result;
  };
};

exports.fromFoldableImpl = (function () {
  // jshint maxparams: 2
  function Cons(head, tail) {
    this.head = head;
    this.tail = tail;
  }
  var emptyList = {};

  function curryCons(head) {
    return function (tail) {
      return new Cons(head, tail);
    };
  }

  function listToArray(list) {
    var result = [];
    var count = 0;
    while (list !== emptyList) {
      result[count++] = list.head;
      list = list.tail;
    }
    return result;
  }

  return function (foldr) {
    return function (xs) {
      return listToArray(foldr(curryCons)(emptyList)(xs));
    };
  };
})();

//------------------------------------------------------------------------------
// Array size ------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.length = function (xs) {
  return xs.length;
};

//------------------------------------------------------------------------------
// Extending arrays ------------------------------------------------------------
//------------------------------------------------------------------------------

exports.cons = function (e) {
  return function (l) {
    return [e].concat(l);
  };
};

exports.snoc = function (l) {
  return function (e) {
    var l1 = l.slice();
    l1.push(e);
    return l1;
  };
};

//------------------------------------------------------------------------------
// Non-indexed reads -----------------------------------------------------------
//------------------------------------------------------------------------------

exports["uncons'"] = function (empty) {
  return function (next) {
    return function (xs) {
      return xs.length === 0 ? empty({}) : next(xs[0])(xs.slice(1));
    };
  };
};

//------------------------------------------------------------------------------
// Indexed operations ----------------------------------------------------------
//------------------------------------------------------------------------------

exports.indexImpl = function (just) {
  return function (nothing) {
    return function (xs) {
      return function (i) {
        return i < 0 || i >= xs.length ? nothing :  just(xs[i]);
      };
    };
  };
};

exports.findIndexImpl = function (just) {
  return function (nothing) {
    return function (f) {
      return function (xs) {
        for (var i = 0, l = xs.length; i < l; i++) {
          if (f(xs[i])) return just(i);
        }
        return nothing;
      };
    };
  };
};

exports.findLastIndexImpl = function (just) {
  return function (nothing) {
    return function (f) {
      return function (xs) {
        for (var i = xs.length - 1; i >= 0; i--) {
          if (f(xs[i])) return just(i);
        }
        return nothing;
      };
    };
  };
};

exports._insertAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (a) {
        return function (l) {
          if (i < 0 || i > l.length) return nothing;
          var l1 = l.slice();
          l1.splice(i, 0, a);
          return just(l1);
        };
      };
    };
  };
};

exports._deleteAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (l) {
        if (i < 0 || i >= l.length) return nothing;
        var l1 = l.slice();
        l1.splice(i, 1);
        return just(l1);
      };
    };
  };
};

exports._updateAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (a) {
        return function (l) {
          if (i < 0 || i >= l.length) return nothing;
          var l1 = l.slice();
          l1[i] = a;
          return just(l1);
        };
      };
    };
  };
};

//------------------------------------------------------------------------------
// Transformations -------------------------------------------------------------
//------------------------------------------------------------------------------

exports.reverse = function (l) {
  return l.slice().reverse();
};

exports.concat = function (xss) {
  var result = [];
  for (var i = 0, l = xss.length; i < l; i++) {
    var xs = xss[i];
    for (var j = 0, m = xs.length; j < m; j++) {
      result.push(xs[j]);
    }
  }
  return result;
};

exports.filter = function (f) {
  return function (xs) {
    return xs.filter(f);
  };
};

exports.partition = function (f) {
  return function (xs) {
    var yes = [];
    var no  = [];
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      if (f(x))
        yes.push(x);
      else
        no.push(x);
    }
    return { yes: yes, no: no };
  };
};

//------------------------------------------------------------------------------
// Sorting ---------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.sortImpl = function (f) {
  return function (l) {
    // jshint maxparams: 2
    return l.slice().sort(function (x, y) {
      return f(x)(y);
    });
  };
};

//------------------------------------------------------------------------------
// Subarrays -------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.slice = function (s) {
  return function (e) {
    return function (l) {
      return l.slice(s, e);
    };
  };
};

exports.take = function (n) {
  return function (l) {
    return n < 1 ? [] : l.slice(0, n);
  };
};

exports.drop = function (n) {
  return function (l) {
    return n < 1 ? l : l.slice(n);
  };
};

//------------------------------------------------------------------------------
// Zipping ---------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.zipWith = function (f) {
  return function (xs) {
    return function (ys) {
      var l = xs.length < ys.length ? xs.length : ys.length;
      var result = new Array(l);
      for (var i = 0; i < l; i++) {
        result[i] = f(xs[i])(ys[i]);
      }
      return result;
    };
  };
};

//------------------------------------------------------------------------------
// Partial ---------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.unsafeIndexImpl = function (xs) {
  return function (n) {
    return xs[n];
  };
};

},{}],69:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Data_Foldable = require("../Data.Foldable");
var Data_Maybe = require("../Data.Maybe");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Partial_Unsafe = require("../Partial.Unsafe");
var Data_Function = require("../Data.Function");
var Data_Ord = require("../Data.Ord");
var Data_Semiring = require("../Data.Semiring");
var Data_Boolean = require("../Data.Boolean");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Control_Applicative = require("../Control.Applicative");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Category = require("../Control.Category");
var zipWithA = function (dictApplicative) {
    return function (f) {
        return function (xs) {
            return function (ys) {
                return Data_Traversable.sequence(Data_Traversable.traversableArray)(dictApplicative)($foreign.zipWith(f)(xs)(ys));
            };
        };
    };
};
var zip = $foreign.zipWith(Data_Tuple.Tuple.create);
var updateAt = $foreign._updateAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var unzip = $foreign["uncons'"](function (v) {
    return new Data_Tuple.Tuple([  ], [  ]);
})(function (v) {
    return function (ts) {
        var $44 = unzip(ts);
        return new Data_Tuple.Tuple($foreign.cons(v.value0)($44.value0), $foreign.cons(v.value1)($44.value1));
    };
});
var unsafeIndex = function (dictPartial) {
    return $foreign.unsafeIndexImpl;
};
var uncons = $foreign["uncons'"](Data_Function["const"](Data_Maybe.Nothing.value))(function (x) {
    return function (xs) {
        return new Data_Maybe.Just({
            head: x, 
            tail: xs
        });
    };
});
var toUnfoldable = function (dictUnfoldable) {
    return function (xs) {
        var len = $foreign.length(xs);
        var f = function (i) {
            if (i < len) {
                return new Data_Maybe.Just(new Data_Tuple.Tuple(Partial_Unsafe.unsafePartial(function (dictPartial) {
                    return unsafeIndex(dictPartial)(xs)(i);
                }), i + 1 | 0));
            };
            if (Data_Boolean.otherwise) {
                return Data_Maybe.Nothing.value;
            };
            throw new Error("Failed pattern match at Data.Array line 133, column 1 - line 138, column 26: " + [ i.constructor.name ]);
        };
        return Data_Unfoldable.unfoldr(dictUnfoldable)(f)(0);
    };
};
var tail = $foreign["uncons'"](Data_Function["const"](Data_Maybe.Nothing.value))(function (v) {
    return function (xs) {
        return new Data_Maybe.Just(xs);
    };
});
var sortBy = function (comp) {
    return function (xs) {
        var comp$prime = function (x) {
            return function (y) {
                var $51 = comp(x)(y);
                if ($51 instanceof Data_Ordering.GT) {
                    return 1;
                };
                if ($51 instanceof Data_Ordering.EQ) {
                    return 0;
                };
                if ($51 instanceof Data_Ordering.LT) {
                    return -1;
                };
                throw new Error("Failed pattern match at Data.Array line 467, column 15 - line 472, column 1: " + [ $51.constructor.name ]);
            };
        };
        return $foreign.sortImpl(comp$prime)(xs);
    };
};
var sort = function (dictOrd) {
    return function (xs) {
        return sortBy(Data_Ord.compare(dictOrd))(xs);
    };
};
var singleton = function (a) {
    return [ a ];
};
var $$null = function (xs) {
    return $foreign.length(xs) === 0;
};
var nubBy = function (eq) {
    return function (xs) {
        var $52 = uncons(xs);
        if ($52 instanceof Data_Maybe.Just) {
            return $foreign.cons($52.value0.head)(nubBy(eq)($foreign.filter(function (y) {
                return !eq($52.value0.head)(y);
            })($52.value0.tail)));
        };
        if ($52 instanceof Data_Maybe.Nothing) {
            return [  ];
        };
        throw new Error("Failed pattern match at Data.Array line 568, column 3 - line 570, column 18: " + [ $52.constructor.name ]);
    };
};
var nub = function (dictEq) {
    return nubBy(Data_Eq.eq(dictEq));
};
var mapWithIndex = function (f) {
    return function (xs) {
        return $foreign.zipWith(f)($foreign.range(0)($foreign.length(xs) - 1))(xs);
    };
};
var some = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Apply.apply((dictAlternative["__superclass_Control.Applicative.Applicative_0"]())["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map(((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())["__superclass_Data.Functor.Functor_0"]())($foreign.cons)(v))(Control_Lazy.defer(dictLazy)(function (v1) {
                return many(dictAlternative)(dictLazy)(v);
            }));
        };
    };
};
var many = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Alt.alt((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())(some(dictAlternative)(dictLazy)(v))(Control_Applicative.pure(dictAlternative["__superclass_Control.Applicative.Applicative_0"]())([  ]));
        };
    };
};
var insertAt = $foreign._insertAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var init = function (xs) {
    if ($$null(xs)) {
        return Data_Maybe.Nothing.value;
    };
    if (Data_Boolean.otherwise) {
        return new Data_Maybe.Just($foreign.slice(0)($foreign.length(xs) - 1)(xs));
    };
    throw new Error("Failed pattern match at Data.Array line 249, column 1 - line 251, column 55: " + [ xs.constructor.name ]);
};
var index = $foreign.indexImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var last = function (xs) {
    return index(xs)($foreign.length(xs) - 1);
};
var unsnoc = function (xs) {
    return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(function (v) {
        return function (v1) {
            return {
                init: v, 
                last: v1
            };
        };
    })(init(xs)))(last(xs));
};
var modifyAt = function (i) {
    return function (f) {
        return function (xs) {
            var go = function (x) {
                return updateAt(i)(f(x))(xs);
            };
            return Data_Maybe.maybe(Data_Maybe.Nothing.value)(go)(index(xs)(i));
        };
    };
};
var span = function (p) {
    return function (arr) {
        var go = function (__copy_i) {
            var i = __copy_i;
            tco: while (true) {
                var $56 = index(arr)(i);
                if ($56 instanceof Data_Maybe.Just) {
                    var $57 = p($56.value0);
                    if ($57) {
                        var __tco_i = i + 1 | 0;
                        i = __tco_i;
                        continue tco;
                    };
                    if (!$57) {
                        return new Data_Maybe.Just(i);
                    };
                    throw new Error("Failed pattern match at Data.Array line 529, column 17 - line 529, column 49: " + [ $57.constructor.name ]);
                };
                if ($56 instanceof Data_Maybe.Nothing) {
                    return Data_Maybe.Nothing.value;
                };
                throw new Error("Failed pattern match at Data.Array line 528, column 5 - line 530, column 25: " + [ $56.constructor.name ]);
            };
        };
        var breakIndex = go(0);
        if (breakIndex instanceof Data_Maybe.Just && breakIndex.value0 === 0) {
            return {
                init: [  ], 
                rest: arr
            };
        };
        if (breakIndex instanceof Data_Maybe.Just) {
            return {
                init: $foreign.slice(0)(breakIndex.value0)(arr), 
                rest: $foreign.slice(breakIndex.value0)($foreign.length(arr))(arr)
            };
        };
        if (breakIndex instanceof Data_Maybe.Nothing) {
            return {
                init: arr, 
                rest: [  ]
            };
        };
        throw new Error("Failed pattern match at Data.Array line 515, column 3 - line 521, column 30: " + [ breakIndex.constructor.name ]);
    };
};
var takeWhile = function (p) {
    return function (xs) {
        return (span(p)(xs)).init;
    };
};
var head = function (xs) {
    return index(xs)(0);
};
var groupBy = function (op) {
    var go = function (__copy_acc) {
        return function (__copy_xs) {
            var acc = __copy_acc;
            var xs = __copy_xs;
            tco: while (true) {
                var $62 = uncons(xs);
                if ($62 instanceof Data_Maybe.Just) {
                    var sp = span(op($62.value0.head))($62.value0.tail);
                    var __tco_acc = $foreign.cons(new Data_NonEmpty.NonEmpty($62.value0.head, sp.init))(acc);
                    acc = __tco_acc;
                    xs = sp.rest;
                    continue tco;
                };
                if ($62 instanceof Data_Maybe.Nothing) {
                    return $foreign.reverse(acc);
                };
                throw new Error("Failed pattern match at Data.Array line 554, column 15 - line 558, column 27: " + [ $62.constructor.name ]);
            };
        };
    };
    return go([  ]);
};
var group = function (dictEq) {
    return function (xs) {
        return groupBy(Data_Eq.eq(dictEq))(xs);
    };
};
var group$prime = function (dictOrd) {
    return function ($77) {
        return group(dictOrd["__superclass_Data.Eq.Eq_0"]())(sort(dictOrd)($77));
    };
};
var fromFoldable = function (dictFoldable) {
    return $foreign.fromFoldableImpl(Data_Foldable.foldr(dictFoldable));
};
var foldRecM = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (array) {
                var go = function (res) {
                    return function (i) {
                        if (i >= $foreign.length(array)) {
                            return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Control_Monad_Rec_Class.Done(res));
                        };
                        if (Data_Boolean.otherwise) {
                            return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(f(res)(Partial_Unsafe.unsafePartial(function (dictPartial) {
                                return unsafeIndex(dictPartial)(array)(i);
                            })))(function (v) {
                                return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(new Control_Monad_Rec_Class.Loop({
                                    a: v, 
                                    b: i + 1 | 0
                                }));
                            });
                        };
                        throw new Error("Failed pattern match at Data.Array line 669, column 3 - line 673, column 42: " + [ res.constructor.name, i.constructor.name ]);
                    };
                };
                return Control_Monad_Rec_Class.tailRecM2(dictMonadRec)(go)(a)(0);
            };
        };
    };
};
var foldM = function (dictMonad) {
    return function (f) {
        return function (a) {
            return $foreign["uncons'"](function (v) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(a);
            })(function (b) {
                return function (bs) {
                    return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(f(a)(b))(function (a$prime) {
                        return foldM(dictMonad)(f)(a$prime)(bs);
                    });
                };
            });
        };
    };
};
var findLastIndex = $foreign.findLastIndexImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var insertBy = function (cmp) {
    return function (x) {
        return function (ys) {
            var i = Data_Maybe.maybe(0)(function (v) {
                return v + 1 | 0;
            })(findLastIndex(function (y) {
                return Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(x)(y))(Data_Ordering.GT.value);
            })(ys));
            return Partial_Unsafe.unsafePartial(function (dictPartial) {
                return Data_Maybe.fromJust(dictPartial)(insertAt(i)(x)(ys));
            });
        };
    };
};
var insert = function (dictOrd) {
    return insertBy(Data_Ord.compare(dictOrd));
};
var findIndex = $foreign.findIndexImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var intersectBy = function (eq) {
    return function (xs) {
        return function (ys) {
            return $foreign.filter(function (x) {
                return Data_Maybe.isJust(findIndex(eq(x))(ys));
            })(xs);
        };
    };
};
var intersect = function (dictEq) {
    return intersectBy(Data_Eq.eq(dictEq));
};
var elemLastIndex = function (dictEq) {
    return function (x) {
        return findLastIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var elemIndex = function (dictEq) {
    return function (x) {
        return findIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var dropWhile = function (p) {
    return function (xs) {
        return (span(p)(xs)).rest;
    };
};
var deleteAt = $foreign._deleteAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var deleteBy = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2.length === 0) {
                return [  ];
            };
            return Data_Maybe.maybe(v2)(function (i) {
                return Partial_Unsafe.unsafePartial(function (dictPartial) {
                    return Data_Maybe.fromJust(dictPartial)(deleteAt(i)(v2));
                });
            })(findIndex(v(v1))(v2));
        };
    };
};
var unionBy = function (eq) {
    return function (xs) {
        return function (ys) {
            return Data_Semigroup.append(Data_Semigroup.semigroupArray)(xs)(Data_Foldable.foldl(Data_Foldable.foldableArray)(Data_Function.flip(deleteBy(eq)))(nubBy(eq)(ys))(xs));
        };
    };
};
var union = function (dictEq) {
    return unionBy(Data_Eq.eq(dictEq));
};
var $$delete = function (dictEq) {
    return deleteBy(Data_Eq.eq(dictEq));
};
var difference = function (dictEq) {
    return Data_Foldable.foldr(Data_Foldable.foldableArray)($$delete(dictEq));
};
var concatMap = Data_Function.flip(Control_Bind.bind(Control_Bind.bindArray));
var mapMaybe = function (f) {
    return concatMap(function ($78) {
        return Data_Maybe.maybe([  ])(singleton)(f($78));
    });
};
var filterA = function (dictApplicative) {
    return function (p) {
        return function ($79) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(mapMaybe(function (v) {
                if (v.value1) {
                    return new Data_Maybe.Just(v.value0);
                };
                if (!v.value1) {
                    return Data_Maybe.Nothing.value;
                };
                throw new Error("Failed pattern match at Data.Array line 430, column 38 - line 430, column 67: " + [ v.value1.constructor.name ]);
            }))(Data_Traversable.traverse(Data_Traversable.traversableArray)(dictApplicative)(function (x) {
                return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Tuple.Tuple.create(x))(p(x));
            })($79));
        };
    };
};
var filterM = function (dictMonad) {
    return filterA(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
};
var catMaybes = mapMaybe(Control_Category.id(Control_Category.categoryFn));
var alterAt = function (i) {
    return function (f) {
        return function (xs) {
            var go = function (x) {
                var $75 = f(x);
                if ($75 instanceof Data_Maybe.Nothing) {
                    return deleteAt(i)(xs);
                };
                if ($75 instanceof Data_Maybe.Just) {
                    return updateAt(i)($75.value0)(xs);
                };
                throw new Error("Failed pattern match at Data.Array line 389, column 10 - line 391, column 32: " + [ $75.constructor.name ]);
            };
            return Data_Maybe.maybe(Data_Maybe.Nothing.value)(go)(index(xs)(i));
        };
    };
};
module.exports = {
    alterAt: alterAt, 
    catMaybes: catMaybes, 
    concatMap: concatMap, 
    "delete": $$delete, 
    deleteAt: deleteAt, 
    deleteBy: deleteBy, 
    difference: difference, 
    dropWhile: dropWhile, 
    elemIndex: elemIndex, 
    elemLastIndex: elemLastIndex, 
    filterA: filterA, 
    filterM: filterM, 
    findIndex: findIndex, 
    findLastIndex: findLastIndex, 
    foldM: foldM, 
    foldRecM: foldRecM, 
    fromFoldable: fromFoldable, 
    group: group, 
    "group'": group$prime, 
    groupBy: groupBy, 
    head: head, 
    index: index, 
    init: init, 
    insert: insert, 
    insertAt: insertAt, 
    insertBy: insertBy, 
    intersect: intersect, 
    intersectBy: intersectBy, 
    last: last, 
    many: many, 
    mapMaybe: mapMaybe, 
    mapWithIndex: mapWithIndex, 
    modifyAt: modifyAt, 
    nub: nub, 
    nubBy: nubBy, 
    "null": $$null, 
    singleton: singleton, 
    some: some, 
    sort: sort, 
    sortBy: sortBy, 
    span: span, 
    tail: tail, 
    takeWhile: takeWhile, 
    toUnfoldable: toUnfoldable, 
    uncons: uncons, 
    union: union, 
    unionBy: unionBy, 
    unsafeIndex: unsafeIndex, 
    unsnoc: unsnoc, 
    unzip: unzip, 
    updateAt: updateAt, 
    zip: zip, 
    zipWithA: zipWithA, 
    concat: $foreign.concat, 
    cons: $foreign.cons, 
    drop: $foreign.drop, 
    filter: $foreign.filter, 
    length: $foreign.length, 
    partition: $foreign.partition, 
    range: $foreign.range, 
    replicate: $foreign.replicate, 
    reverse: $foreign.reverse, 
    slice: $foreign.slice, 
    snoc: $foreign.snoc, 
    take: $foreign.take, 
    zipWith: $foreign.zipWith
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Lazy":25,"../Control.Monad.Rec.Class":50,"../Control.Semigroupoid":63,"../Data.Boolean":73,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.Maybe":104,"../Data.NonEmpty":114,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Traversable":134,"../Data.Tuple":136,"../Data.Unfoldable":138,"../Partial.Unsafe":145,"../Prelude":148,"./foreign":68}],70:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Apply = require("../Control.Apply");
var Data_Monoid = require("../Data.Monoid");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Endo = require("../Data.Monoid.Endo");
var Data_Newtype = require("../Data.Newtype");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Applicative = require("../Control.Applicative");
var Data_Unit = require("../Data.Unit");
var Control_Category = require("../Control.Category");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Function = require("../Data.Function");
var Bifoldable = function (bifoldMap, bifoldl, bifoldr) {
    this.bifoldMap = bifoldMap;
    this.bifoldl = bifoldl;
    this.bifoldr = bifoldr;
};
var bifoldr = function (dict) {
    return dict.bifoldr;
};
var bitraverse_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return function (f) {
            return function (g) {
                return bifoldr(dictBifoldable)(function ($18) {
                    return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(f($18));
                })(function ($19) {
                    return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(g($19));
                })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
            };
        };
    };
};
var bifor_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return function (g) {
                    return bitraverse_(dictBifoldable)(dictApplicative)(f)(g)(t);
                };
            };
        };
    };
};
var bisequence_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return bitraverse_(dictBifoldable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var bifoldl = function (dict) {
    return dict.bifoldl;
};
var bifoldMapDefaultR = function (dictBifoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (g) {
                return function (p) {
                    return bifoldr(dictBifoldable)(function ($20) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f($20));
                    })(function ($21) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(g($21));
                    })(Data_Monoid.mempty(dictMonoid))(p);
                };
            };
        };
    };
};
var bifoldMapDefaultL = function (dictBifoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (g) {
                return function (p) {
                    return bifoldl(dictBifoldable)(function (m) {
                        return function (a) {
                            return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(m)(f(a));
                        };
                    })(function (m) {
                        return function (b) {
                            return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(m)(g(b));
                        };
                    })(Data_Monoid.mempty(dictMonoid))(p);
                };
            };
        };
    };
};
var bifoldMap = function (dict) {
    return dict.bifoldMap;
};
var bifoldlDefault = function (dictBifoldable) {
    return function (f) {
        return function (g) {
            return function (z) {
                return function (p) {
                    return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(Data_Newtype.unwrap(Data_Monoid_Dual.newtypeDual)(bifoldMap(dictBifoldable)(Data_Monoid_Dual.monoidDual(Data_Monoid_Endo.monoidEndo))(function ($22) {
                        return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(f)($22)));
                    })(function ($23) {
                        return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(g)($23)));
                    })(p)))(z);
                };
            };
        };
    };
};
var bifoldrDefault = function (dictBifoldable) {
    return function (f) {
        return function (g) {
            return function (z) {
                return function (p) {
                    return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(bifoldMap(dictBifoldable)(Data_Monoid_Endo.monoidEndo)(function ($24) {
                        return Data_Monoid_Endo.Endo(f($24));
                    })(function ($25) {
                        return Data_Monoid_Endo.Endo(g($25));
                    })(p))(z);
                };
            };
        };
    };
};
var bifold = function (dictBifoldable) {
    return function (dictMonoid) {
        return bifoldMap(dictBifoldable)(dictMonoid)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var biany = function (dictBifoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function (q) {
                return function ($26) {
                    return Data_Newtype.unwrap(Data_Monoid_Disj.newtypeDisj)(bifoldMap(dictBifoldable)(Data_Monoid_Disj.monoidDisj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($27) {
                        return Data_Monoid_Disj.Disj(p($27));
                    })(function ($28) {
                        return Data_Monoid_Disj.Disj(q($28));
                    })($26));
                };
            };
        };
    };
};
var biall = function (dictBifoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function (q) {
                return function ($29) {
                    return Data_Newtype.unwrap(Data_Monoid_Conj.newtypeConj)(bifoldMap(dictBifoldable)(Data_Monoid_Conj.monoidConj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($30) {
                        return Data_Monoid_Conj.Conj(p($30));
                    })(function ($31) {
                        return Data_Monoid_Conj.Conj(q($31));
                    })($29));
                };
            };
        };
    };
};
module.exports = {
    Bifoldable: Bifoldable, 
    biall: biall, 
    biany: biany, 
    bifold: bifold, 
    bifoldMap: bifoldMap, 
    bifoldMapDefaultL: bifoldMapDefaultL, 
    bifoldMapDefaultR: bifoldMapDefaultR, 
    bifoldl: bifoldl, 
    bifoldlDefault: bifoldlDefault, 
    bifoldr: bifoldr, 
    bifoldrDefault: bifoldrDefault, 
    bifor_: bifor_, 
    bisequence_: bisequence_, 
    bitraverse_: bitraverse_
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Control.Semigroupoid":63,"../Data.Function":89,"../Data.Monoid":111,"../Data.Monoid.Conj":106,"../Data.Monoid.Disj":107,"../Data.Monoid.Dual":108,"../Data.Monoid.Endo":109,"../Data.Newtype":113,"../Data.Semigroup":123,"../Data.Unit":140,"../Prelude":148}],71:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Category = require("../Control.Category");
var Bifunctor = function (bimap) {
    this.bimap = bimap;
};
var bimap = function (dict) {
    return dict.bimap;
};
var lmap = function (dictBifunctor) {
    return function (f) {
        return bimap(dictBifunctor)(f)(Control_Category.id(Control_Category.categoryFn));
    };
};
var rmap = function (dictBifunctor) {
    return bimap(dictBifunctor)(Control_Category.id(Control_Category.categoryFn));
};
module.exports = {
    Bifunctor: Bifunctor, 
    bimap: bimap, 
    lmap: lmap, 
    rmap: rmap
};

},{"../Control.Category":20}],72:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Control_Category = require("../Control.Category");
var Bitraversable = function (__superclass_Data$dotBifoldable$dotBifoldable_1, __superclass_Data$dotBifunctor$dotBifunctor_0, bisequence, bitraverse) {
    this["__superclass_Data.Bifoldable.Bifoldable_1"] = __superclass_Data$dotBifoldable$dotBifoldable_1;
    this["__superclass_Data.Bifunctor.Bifunctor_0"] = __superclass_Data$dotBifunctor$dotBifunctor_0;
    this.bisequence = bisequence;
    this.bitraverse = bitraverse;
};
var bitraverse = function (dict) {
    return dict.bitraverse;
};
var bisequenceDefault = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return bitraverse(dictBitraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn))(t);
        };
    };
};
var bisequence = function (dict) {
    return dict.bisequence;
};
var bitraverseDefault = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (f) {
            return function (g) {
                return function (t) {
                    return bisequence(dictBitraversable)(dictApplicative)(Data_Bifunctor.bimap(dictBitraversable["__superclass_Data.Bifunctor.Bifunctor_0"]())(f)(g)(t));
                };
            };
        };
    };
};
var bifor = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return function (g) {
                    return bitraverse(dictBitraversable)(dictApplicative)(f)(g)(t);
                };
            };
        };
    };
};
module.exports = {
    Bitraversable: Bitraversable, 
    bifor: bifor, 
    bisequence: bisequence, 
    bisequenceDefault: bisequenceDefault, 
    bitraverse: bitraverse, 
    bitraverseDefault: bitraverseDefault
};

},{"../Control.Category":20,"../Data.Bifoldable":70,"../Data.Bifunctor":71,"../Prelude":148}],73:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var otherwise = true;
module.exports = {
    otherwise: otherwise
};

},{}],74:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Unit = require("../Data.Unit");
var BooleanAlgebra = function (__superclass_Data$dotHeytingAlgebra$dotHeytingAlgebra_0) {
    this["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"] = __superclass_Data$dotHeytingAlgebra$dotHeytingAlgebra_0;
};
var booleanAlgebraUnit = new BooleanAlgebra(function () {
    return Data_HeytingAlgebra.heytingAlgebraUnit;
});
var booleanAlgebraBoolean = new BooleanAlgebra(function () {
    return Data_HeytingAlgebra.heytingAlgebraBoolean;
});
module.exports = {
    BooleanAlgebra: BooleanAlgebra, 
    booleanAlgebraBoolean: booleanAlgebraBoolean, 
    booleanAlgebraUnit: booleanAlgebraUnit
};

},{"../Data.HeytingAlgebra":97,"../Data.Unit":140}],75:[function(require,module,exports){
"use strict";

exports.topInt = 2147483647;
exports.bottomInt = -2147483648;

exports.topChar = String.fromCharCode(65535);
exports.bottomChar = String.fromCharCode(0);

},{}],76:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Ord = require("../Data.Ord");
var Data_Unit = require("../Data.Unit");
var Data_Ordering = require("../Data.Ordering");
var Bounded = function (__superclass_Data$dotOrd$dotOrd_0, bottom, top) {
    this["__superclass_Data.Ord.Ord_0"] = __superclass_Data$dotOrd$dotOrd_0;
    this.bottom = bottom;
    this.top = top;
};
var top = function (dict) {
    return dict.top;
};
var boundedUnit = new Bounded(function () {
    return Data_Ord.ordUnit;
}, Data_Unit.unit, Data_Unit.unit);
var boundedOrdering = new Bounded(function () {
    return Data_Ord.ordOrdering;
}, Data_Ordering.LT.value, Data_Ordering.GT.value);
var boundedInt = new Bounded(function () {
    return Data_Ord.ordInt;
}, $foreign.bottomInt, $foreign.topInt);
var boundedChar = new Bounded(function () {
    return Data_Ord.ordChar;
}, $foreign.bottomChar, $foreign.topChar);
var boundedBoolean = new Bounded(function () {
    return Data_Ord.ordBoolean;
}, false, true);
var bottom = function (dict) {
    return dict.bottom;
};
module.exports = {
    Bounded: Bounded, 
    bottom: bottom, 
    top: top, 
    boundedBoolean: boundedBoolean, 
    boundedInt: boundedInt, 
    boundedChar: boundedChar, 
    boundedOrdering: boundedOrdering, 
    boundedUnit: boundedUnit
};

},{"../Data.Ord":118,"../Data.Ordering":119,"../Data.Unit":140,"./foreign":75}],77:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var CommutativeRing = function (__superclass_Data$dotRing$dotRing_0) {
    this["__superclass_Data.Ring.Ring_0"] = __superclass_Data$dotRing$dotRing_0;
};
var commutativeRingUnit = new CommutativeRing(function () {
    return Data_Ring.ringUnit;
});
var commutativeRingNumber = new CommutativeRing(function () {
    return Data_Ring.ringNumber;
});
var commutativeRingInt = new CommutativeRing(function () {
    return Data_Ring.ringInt;
});
module.exports = {
    CommutativeRing: CommutativeRing, 
    commutativeRingInt: commutativeRingInt, 
    commutativeRingNumber: commutativeRingNumber, 
    commutativeRingUnit: commutativeRingUnit
};

},{"../Data.Ring":121,"../Data.Semiring":125,"../Data.Unit":140}],78:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Identity = require("../Data.Identity");
var Data_Newtype = require("../Data.Newtype");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var Distributive = function (__superclass_Data$dotFunctor$dotFunctor_0, collect, distribute) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.collect = collect;
    this.distribute = distribute;
};
var distributiveIdentity = new Distributive(function () {
    return Data_Identity.functorIdentity;
}, function (dictFunctor) {
    return function (f) {
        return function ($11) {
            return Data_Identity.Identity(Data_Functor.map(dictFunctor)(function ($12) {
                return Data_Newtype.unwrap(Data_Identity.newtypeIdentity)(f($12));
            })($11));
        };
    };
}, function (dictFunctor) {
    return function ($13) {
        return Data_Identity.Identity(Data_Functor.map(dictFunctor)(Data_Newtype.unwrap(Data_Identity.newtypeIdentity))($13));
    };
});
var distribute = function (dict) {
    return dict.distribute;
};
var distributiveFunction = new Distributive(function () {
    return Data_Functor.functorFn;
}, function (dictFunctor) {
    return function (f) {
        return function ($14) {
            return distribute(distributiveFunction)(dictFunctor)(Data_Functor.map(dictFunctor)(f)($14));
        };
    };
}, function (dictFunctor) {
    return function (a) {
        return function (e) {
            return Data_Functor.map(dictFunctor)(function (v) {
                return v(e);
            })(a);
        };
    };
});
var cotraverse = function (dictDistributive) {
    return function (dictFunctor) {
        return function (f) {
            return function ($15) {
                return Data_Functor.map(dictDistributive["__superclass_Data.Functor.Functor_0"]())(f)(distribute(dictDistributive)(dictFunctor)($15));
            };
        };
    };
};
var collectDefault = function (dictDistributive) {
    return function (dictFunctor) {
        return function (f) {
            return function ($16) {
                return distribute(dictDistributive)(dictFunctor)(Data_Functor.map(dictFunctor)(f)($16));
            };
        };
    };
};
var collect = function (dict) {
    return dict.collect;
};
var distributeDefault = function (dictDistributive) {
    return function (dictFunctor) {
        return collect(dictDistributive)(dictFunctor)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Distributive: Distributive, 
    collect: collect, 
    collectDefault: collectDefault, 
    cotraverse: cotraverse, 
    distribute: distribute, 
    distributeDefault: distributeDefault, 
    distributiveIdentity: distributiveIdentity, 
    distributiveFunction: distributiveFunction
};

},{"../Control.Category":20,"../Control.Semigroupoid":63,"../Data.Function":89,"../Data.Functor":93,"../Data.Identity":98,"../Data.Newtype":113,"../Prelude":148}],79:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Extend = require("../Control.Extend");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bitraversable = require("../Data.Bitraversable");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Traversable = require("../Data.Traversable");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Bounded = require("../Data.Bounded");
var Data_Semiring = require("../Data.Semiring");
var Data_Function = require("../Data.Function");
var Left = (function () {
    function Left(value0) {
        this.value0 = value0;
    };
    Left.create = function (value0) {
        return new Left(value0);
    };
    return Left;
})();
var Right = (function () {
    function Right(value0) {
        this.value0 = value0;
    };
    Right.create = function (value0) {
        return new Right(value0);
    };
    return Right;
})();
var showEither = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            if (v instanceof Left) {
                return "(Left " + (Data_Show.show(dictShow)(v.value0) + ")");
            };
            if (v instanceof Right) {
                return "(Right " + (Data_Show.show(dictShow1)(v.value0) + ")");
            };
            throw new Error("Failed pattern match at Data.Either line 159, column 3 - line 160, column 3: " + [ v.constructor.name ]);
        });
    };
};
var functorEither = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Left) {
            return new Left(v1.value0);
        };
        if (v1 instanceof Right) {
            return new Right(v(v1.value0));
        };
        throw new Error("Failed pattern match at Data.Either line 35, column 3 - line 35, column 26: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var invariantEither = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorEither));
var fromRight = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar60) {
                return $dollar60;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Right) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Either line 247, column 1 - line 247, column 23: " + [ v.constructor.name ]);
        })());
    };
};
var fromLeft = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar64) {
                return $dollar64;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Left) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Either line 242, column 1 - line 242, column 22: " + [ v.constructor.name ]);
        })());
    };
};
var foldableEither = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            if (v instanceof Left) {
                return Data_Monoid.mempty(dictMonoid);
            };
            if (v instanceof Right) {
                return f(v.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 183, column 3 - line 183, column 31: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Left) {
                return z;
            };
            if (v1 instanceof Right) {
                return v(z)(v1.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 181, column 3 - line 181, column 26: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Left) {
                return z;
            };
            if (v1 instanceof Right) {
                return v(v1.value0)(z);
            };
            throw new Error("Failed pattern match at Data.Either line 179, column 3 - line 179, column 26: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
});
var traversableEither = new Data_Traversable.Traversable(function () {
    return foldableEither;
}, function () {
    return functorEither;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Left) {
            return Control_Applicative.pure(dictApplicative)(new Left(v.value0));
        };
        if (v instanceof Right) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Either line 197, column 3 - line 197, column 36: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Left) {
                return Control_Applicative.pure(dictApplicative)(new Left(v1.value0));
            };
            if (v1 instanceof Right) {
                return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Either line 195, column 3 - line 195, column 39: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
});
var extendEither = new Control_Extend.Extend(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v1 instanceof Left) {
            return new Left(v1.value0);
        };
        return new Right(v(v1));
    };
});
var eqEither = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (x) {
            return function (y) {
                if (x instanceof Left && y instanceof Left) {
                    return Data_Eq.eq(dictEq)(x.value0)(y.value0);
                };
                if (x instanceof Right && y instanceof Right) {
                    return Data_Eq.eq(dictEq1)(x.value0)(y.value0);
                };
                return false;
            };
        });
    };
};
var ordEither = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqEither(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
        }, function (x) {
            return function (y) {
                if (x instanceof Left && y instanceof Left) {
                    return Data_Ord.compare(dictOrd)(x.value0)(y.value0);
                };
                if (x instanceof Left) {
                    return Data_Ordering.LT.value;
                };
                if (y instanceof Left) {
                    return Data_Ordering.GT.value;
                };
                if (x instanceof Right && y instanceof Right) {
                    return Data_Ord.compare(dictOrd1)(x.value0)(y.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 172, column 1 - line 172, column 64: " + [ x.constructor.name, y.constructor.name ]);
            };
        });
    };
};
var either = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Left) {
                return v(v2.value0);
            };
            if (v2 instanceof Right) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 224, column 1 - line 224, column 26: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var isLeft = either(Data_Function["const"](true))(Data_Function["const"](false));
var isRight = either(Data_Function["const"](false))(Data_Function["const"](true));
var choose = function (dictAlt) {
    return function (a) {
        return function (b) {
            return Control_Alt.alt(dictAlt)(Data_Functor.map(dictAlt["__superclass_Data.Functor.Functor_0"]())(Left.create)(a))(Data_Functor.map(dictAlt["__superclass_Data.Functor.Functor_0"]())(Right.create)(b));
        };
    };
};
var boundedEither = function (dictBounded) {
    return function (dictBounded1) {
        return new Data_Bounded.Bounded(function () {
            return ordEither(dictBounded["__superclass_Data.Ord.Ord_0"]())(dictBounded1["__superclass_Data.Ord.Ord_0"]());
        }, new Left(Data_Bounded.bottom(dictBounded)), new Right(Data_Bounded.top(dictBounded1)));
    };
};
var bifunctorEither = new Data_Bifunctor.Bifunctor(function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Left) {
                return new Left(v(v2.value0));
            };
            if (v2 instanceof Right) {
                return new Right(v1(v2.value0));
            };
            throw new Error("Failed pattern match at Data.Either line 42, column 3 - line 42, column 34: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
});
var bifoldableEither = new Data_Bifoldable.Bifoldable(function (dictMonoid) {
    return function (v) {
        return function (v1) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(v2.value0);
                };
                if (v2 instanceof Right) {
                    return v1(v2.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 191, column 3 - line 191, column 31: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
            };
        };
    };
}, function (v) {
    return function (v1) {
        return function (z) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(z)(v2.value0);
                };
                if (v2 instanceof Right) {
                    return v1(z)(v2.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 189, column 3 - line 189, column 33: " + [ v.constructor.name, v1.constructor.name, z.constructor.name, v2.constructor.name ]);
            };
        };
    };
}, function (v) {
    return function (v1) {
        return function (z) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(v2.value0)(z);
                };
                if (v2 instanceof Right) {
                    return v1(v2.value0)(z);
                };
                throw new Error("Failed pattern match at Data.Either line 187, column 3 - line 187, column 33: " + [ v.constructor.name, v1.constructor.name, z.constructor.name, v2.constructor.name ]);
            };
        };
    };
});
var bitraversableEither = new Data_Bitraversable.Bitraversable(function () {
    return bifoldableEither;
}, function () {
    return bifunctorEither;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Left) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Left.create)(v.value0);
        };
        if (v instanceof Right) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Either line 203, column 3 - line 203, column 35: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Left.create)(v(v2.value0));
                };
                if (v2 instanceof Right) {
                    return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v1(v2.value0));
                };
                throw new Error("Failed pattern match at Data.Either line 201, column 3 - line 201, column 41: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
            };
        };
    };
});
var applyEither = new Control_Apply.Apply(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Left) {
            return new Left(v.value0);
        };
        if (v instanceof Right) {
            return Data_Functor.map(functorEither)(v.value0)(v1);
        };
        throw new Error("Failed pattern match at Data.Either line 78, column 3 - line 78, column 28: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindEither = new Control_Bind.Bind(function () {
    return applyEither;
}, either(function (e) {
    return function (v) {
        return new Left(e);
    };
})(function (a) {
    return function (f) {
        return f(a);
    };
}));
var semigroupEither = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semigroup.append(dictSemigroup))(x))(y);
        };
    });
};
var semiringEither = function (dictSemiring) {
    return new Data_Semiring.Semiring(function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semiring.add(dictSemiring))(x))(y);
        };
    }, function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semiring.mul(dictSemiring))(x))(y);
        };
    }, new Right(Data_Semiring.one(dictSemiring)), new Right(Data_Semiring.zero(dictSemiring)));
};
var applicativeEither = new Control_Applicative.Applicative(function () {
    return applyEither;
}, Right.create);
var monadEither = new Control_Monad.Monad(function () {
    return applicativeEither;
}, function () {
    return bindEither;
});
var altEither = new Control_Alt.Alt(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Left) {
            return v1;
        };
        return v;
    };
});
module.exports = {
    Left: Left, 
    Right: Right, 
    choose: choose, 
    either: either, 
    fromLeft: fromLeft, 
    fromRight: fromRight, 
    isLeft: isLeft, 
    isRight: isRight, 
    functorEither: functorEither, 
    invariantEither: invariantEither, 
    bifunctorEither: bifunctorEither, 
    applyEither: applyEither, 
    applicativeEither: applicativeEither, 
    altEither: altEither, 
    bindEither: bindEither, 
    monadEither: monadEither, 
    extendEither: extendEither, 
    showEither: showEither, 
    eqEither: eqEither, 
    ordEither: ordEither, 
    boundedEither: boundedEither, 
    foldableEither: foldableEither, 
    bifoldableEither: bifoldableEither, 
    traversableEither: traversableEither, 
    bitraversableEither: bitraversableEither, 
    semiringEither: semiringEither, 
    semigroupEither: semigroupEither
};

},{"../Control.Alt":11,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bifoldable":70,"../Data.Bifunctor":71,"../Data.Bitraversable":72,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Monoid":111,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.Traversable":134,"../Prelude":148}],80:[function(require,module,exports){
"use strict";

exports.refEq = function (r1) {
  return function (r2) {
    return r1 === r2;
  };
};

exports.refIneq = function (r1) {
  return function (r2) {
    return r1 !== r2;
  };
};

exports.eqArrayImpl = function (f) {
  return function (xs) {
    return function (ys) {
      if (xs.length !== ys.length) return false;
      for (var i = 0; i < xs.length; i++) {
        if (!f(xs[i])(ys[i])) return false;
      }
      return true;
    };
  };
};

},{}],81:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Eq = function (eq) {
    this.eq = eq;
};
var eqVoid = new Eq(function (v) {
    return function (v1) {
        return true;
    };
});
var eqUnit = new Eq(function (v) {
    return function (v1) {
        return true;
    };
});
var eqString = new Eq($foreign.refEq);
var eqNumber = new Eq($foreign.refEq);
var eqInt = new Eq($foreign.refEq);
var eqChar = new Eq($foreign.refEq);
var eqBoolean = new Eq($foreign.refEq);
var eq = function (dict) {
    return dict.eq;
};
var eqArray = function (dictEq) {
    return new Eq($foreign.eqArrayImpl(eq(dictEq)));
};
var notEq = function (dictEq) {
    return function (x) {
        return function (y) {
            return eq(eqBoolean)(eq(dictEq)(x)(y))(false);
        };
    };
};
module.exports = {
    Eq: Eq, 
    eq: eq, 
    notEq: notEq, 
    eqBoolean: eqBoolean, 
    eqInt: eqInt, 
    eqNumber: eqNumber, 
    eqChar: eqChar, 
    eqString: eqString, 
    eqUnit: eqUnit, 
    eqVoid: eqVoid, 
    eqArray: eqArray
};

},{"../Data.Unit":140,"../Data.Void":141,"./foreign":80}],82:[function(require,module,exports){
"use strict";

exports.intDegree = function (x) {
  return Math.abs(x);
};

exports.intDiv = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x / y | 0;
  };
};

exports.intMod = function (x) {
  return function (y) {
    return x % y;
  };
};

exports.numDiv = function (n1) {
  return function (n2) {
    return n1 / n2;
  };
};

},{}],83:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var EuclideanRing = function (__superclass_Data$dotCommutativeRing$dotCommutativeRing_0, degree, div, mod) {
    this["__superclass_Data.CommutativeRing.CommutativeRing_0"] = __superclass_Data$dotCommutativeRing$dotCommutativeRing_0;
    this.degree = degree;
    this.div = div;
    this.mod = mod;
};
var mod = function (dict) {
    return dict.mod;
};
var euclideanRingUnit = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingUnit;
}, function (v) {
    return 1;
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var euclideanRingNumber = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingNumber;
}, function (v) {
    return 1;
}, $foreign.numDiv, function (v) {
    return function (v1) {
        return 0.0;
    };
});
var euclideanRingInt = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingInt;
}, $foreign.intDegree, $foreign.intDiv, $foreign.intMod);
var div = function (dict) {
    return dict.div;
};
var degree = function (dict) {
    return dict.degree;
};
module.exports = {
    EuclideanRing: EuclideanRing, 
    degree: degree, 
    div: div, 
    mod: mod, 
    euclideanRingInt: euclideanRingInt, 
    euclideanRingNumber: euclideanRingNumber, 
    euclideanRingUnit: euclideanRingUnit
};

},{"../Data.CommutativeRing":77,"../Data.Ring":121,"../Data.Semiring":125,"../Data.Unit":140,"./foreign":82}],84:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Field = function (__superclass_Data$dotEuclideanRing$dotEuclideanRing_0) {
    this["__superclass_Data.EuclideanRing.EuclideanRing_0"] = __superclass_Data$dotEuclideanRing$dotEuclideanRing_0;
};
var fieldUnit = new Field(function () {
    return Data_EuclideanRing.euclideanRingUnit;
});
var fieldNumber = new Field(function () {
    return Data_EuclideanRing.euclideanRingNumber;
});
module.exports = {
    Field: Field, 
    fieldNumber: fieldNumber, 
    fieldUnit: fieldUnit
};

},{"../Data.CommutativeRing":77,"../Data.EuclideanRing":83,"../Data.Ring":121,"../Data.Semiring":125,"../Data.Unit":140}],85:[function(require,module,exports){
"use strict";

exports.foldrArray = function (f) {
  return function (init) {
    return function (xs) {
      var acc = init;
      var len = xs.length;
      for (var i = len - 1; i >= 0; i--) {
        acc = f(xs[i])(acc);
      }
      return acc;
    };
  };
};

exports.foldlArray = function (f) {
  return function (init) {
    return function (xs) {
      var acc = init;
      var len = xs.length;
      for (var i = 0; i < len; i++) {
        acc = f(acc)(xs[i]);
      }
      return acc;
    };
  };
};

},{}],86:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Plus = require("../Control.Plus");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Maybe_Last = require("../Data.Maybe.Last");
var Data_Monoid = require("../Data.Monoid");
var Data_Monoid_Additive = require("../Data.Monoid.Additive");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Endo = require("../Data.Monoid.Endo");
var Data_Monoid_Multiplicative = require("../Data.Monoid.Multiplicative");
var Data_Newtype = require("../Data.Newtype");
var Control_Alt = require("../Control.Alt");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Data_Unit = require("../Data.Unit");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_Ordering = require("../Data.Ordering");
var Data_Ord = require("../Data.Ord");
var Data_Semiring = require("../Data.Semiring");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Foldable = function (foldMap, foldl, foldr) {
    this.foldMap = foldMap;
    this.foldl = foldl;
    this.foldr = foldr;
};
var foldr = function (dict) {
    return dict.foldr;
};
var oneOf = function (dictFoldable) {
    return function (dictPlus) {
        return foldr(dictFoldable)(Control_Alt.alt(dictPlus["__superclass_Control.Alt.Alt_0"]()))(Control_Plus.empty(dictPlus));
    };
};
var traverse_ = function (dictApplicative) {
    return function (dictFoldable) {
        return function (f) {
            return foldr(dictFoldable)(function ($169) {
                return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(f($169));
            })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
        };
    };
};
var for_ = function (dictApplicative) {
    return function (dictFoldable) {
        return Data_Function.flip(traverse_(dictApplicative)(dictFoldable));
    };
};
var sequence_ = function (dictApplicative) {
    return function (dictFoldable) {
        return traverse_(dictApplicative)(dictFoldable)(Control_Category.id(Control_Category.categoryFn));
    };
};
var foldl = function (dict) {
    return dict.foldl;
};
var intercalate = function (dictFoldable) {
    return function (dictMonoid) {
        return function (sep) {
            return function (xs) {
                var go = function (v) {
                    return function (x) {
                        if (v.init) {
                            return {
                                init: false, 
                                acc: x
                            };
                        };
                        return {
                            init: false, 
                            acc: Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v.acc)(Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(sep)(x))
                        };
                    };
                };
                return (foldl(dictFoldable)(go)({
                    init: true, 
                    acc: Data_Monoid.mempty(dictMonoid)
                })(xs)).acc;
            };
        };
    };
};
var maximumBy = function (dictFoldable) {
    return function (cmp) {
        var max$prime = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Maybe.Just(v1);
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Maybe.Just((function () {
                        var $92 = Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1))(Data_Ordering.GT.value);
                        if ($92) {
                            return v.value0;
                        };
                        if (!$92) {
                            return v1;
                        };
                        throw new Error("Failed pattern match at Data.Foldable line 291, column 27 - line 291, column 57: " + [ $92.constructor.name ]);
                    })());
                };
                throw new Error("Failed pattern match at Data.Foldable line 290, column 3 - line 290, column 27: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
        return foldl(dictFoldable)(max$prime)(Data_Maybe.Nothing.value);
    };
};
var maximum = function (dictOrd) {
    return function (dictFoldable) {
        return maximumBy(dictFoldable)(Data_Ord.compare(dictOrd));
    };
};
var minimumBy = function (dictFoldable) {
    return function (cmp) {
        var min$prime = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Maybe.Just(v1);
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Maybe.Just((function () {
                        var $96 = Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1))(Data_Ordering.LT.value);
                        if ($96) {
                            return v.value0;
                        };
                        if (!$96) {
                            return v1;
                        };
                        throw new Error("Failed pattern match at Data.Foldable line 304, column 27 - line 304, column 57: " + [ $96.constructor.name ]);
                    })());
                };
                throw new Error("Failed pattern match at Data.Foldable line 303, column 3 - line 303, column 27: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
        return foldl(dictFoldable)(min$prime)(Data_Maybe.Nothing.value);
    };
};
var minimum = function (dictOrd) {
    return function (dictFoldable) {
        return minimumBy(dictFoldable)(Data_Ord.compare(dictOrd));
    };
};
var product = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(Data_Semiring.mul(dictSemiring))(Data_Semiring.one(dictSemiring));
    };
};
var sum = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(Data_Semiring.add(dictSemiring))(Data_Semiring.zero(dictSemiring));
    };
};
var foldableMultiplicative = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableMaybe = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            if (v instanceof Data_Maybe.Nothing) {
                return Data_Monoid.mempty(dictMonoid);
            };
            if (v instanceof Data_Maybe.Just) {
                return f(v.value0);
            };
            throw new Error("Failed pattern match at Data.Foldable line 126, column 3 - line 126, column 30: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return z;
            };
            if (v1 instanceof Data_Maybe.Just) {
                return v(z)(v1.value0);
            };
            throw new Error("Failed pattern match at Data.Foldable line 124, column 3 - line 124, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return z;
            };
            if (v1 instanceof Data_Maybe.Just) {
                return v(v1.value0)(z);
            };
            throw new Error("Failed pattern match at Data.Foldable line 122, column 3 - line 122, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
});
var foldableDual = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableDisj = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableConj = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableAdditive = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldMapDefaultR = function (dictFoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (xs) {
                return foldr(dictFoldable)(function (x) {
                    return function (acc) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(x))(acc);
                    };
                })(Data_Monoid.mempty(dictMonoid))(xs);
            };
        };
    };
};
var foldableArray = new Foldable(function (dictMonoid) {
    return foldMapDefaultR(foldableArray)(dictMonoid);
}, $foreign.foldlArray, $foreign.foldrArray);
var foldMapDefaultL = function (dictFoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (xs) {
                return foldl(dictFoldable)(function (acc) {
                    return function (x) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(x))(acc);
                    };
                })(Data_Monoid.mempty(dictMonoid))(xs);
            };
        };
    };
};
var foldMap = function (dict) {
    return dict.foldMap;
};
var foldableFirst = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return foldMap(foldableMaybe)(dictMonoid)(f)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldl(foldableMaybe)(f)(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldr(foldableMaybe)(f)(z)(v);
        };
    };
});
var foldableLast = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return foldMap(foldableMaybe)(dictMonoid)(f)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldl(foldableMaybe)(f)(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldr(foldableMaybe)(f)(z)(v);
        };
    };
});
var foldlDefault = function (dictFoldable) {
    return function (c) {
        return function (u) {
            return function (xs) {
                return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(Data_Newtype.unwrap(Data_Monoid_Dual.newtypeDual)(foldMap(dictFoldable)(Data_Monoid_Dual.monoidDual(Data_Monoid_Endo.monoidEndo))(function ($170) {
                    return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(c)($170)));
                })(xs)))(u);
            };
        };
    };
};
var foldrDefault = function (dictFoldable) {
    return function (c) {
        return function (u) {
            return function (xs) {
                return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(foldMap(dictFoldable)(Data_Monoid_Endo.monoidEndo)(function ($171) {
                    return Data_Monoid_Endo.Endo(c($171));
                })(xs))(u);
            };
        };
    };
};
var fold = function (dictFoldable) {
    return function (dictMonoid) {
        return foldMap(dictFoldable)(dictMonoid)(Control_Category.id(Control_Category.categoryFn));
    };
};
var findMap = function (dictFoldable) {
    return function (p) {
        var go = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return p(v1);
                };
                return v;
            };
        };
        return foldl(dictFoldable)(go)(Data_Maybe.Nothing.value);
    };
};
var find = function (dictFoldable) {
    return function (p) {
        var go = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing && p(v1)) {
                    return new Data_Maybe.Just(v1);
                };
                return v;
            };
        };
        return foldl(dictFoldable)(go)(Data_Maybe.Nothing.value);
    };
};
var any = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return function (p) {
            return Data_Newtype.alaF(Data_Functor.functorFn)(Data_Functor.functorFn)(Data_Monoid_Disj.newtypeDisj)(Data_Monoid_Disj.newtypeDisj)(Data_Monoid_Disj.Disj)(foldMap(dictFoldable)(Data_Monoid_Disj.monoidDisj(dictHeytingAlgebra)))(p);
        };
    };
};
var elem = function (dictFoldable) {
    return function (dictEq) {
        return function ($172) {
            return any(dictFoldable)(Data_HeytingAlgebra.heytingAlgebraBoolean)(Data_Eq.eq(dictEq)($172));
        };
    };
};
var notElem = function (dictFoldable) {
    return function (dictEq) {
        return function (x) {
            return function ($173) {
                return !elem(dictFoldable)(dictEq)(x)($173);
            };
        };
    };
};
var or = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return any(dictFoldable)(dictHeytingAlgebra)(Control_Category.id(Control_Category.categoryFn));
    };
};
var all = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return function (p) {
            return Data_Newtype.alaF(Data_Functor.functorFn)(Data_Functor.functorFn)(Data_Monoid_Conj.newtypeConj)(Data_Monoid_Conj.newtypeConj)(Data_Monoid_Conj.Conj)(foldMap(dictFoldable)(Data_Monoid_Conj.monoidConj(dictHeytingAlgebra)))(p);
        };
    };
};
var and = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return all(dictFoldable)(dictHeytingAlgebra)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Foldable: Foldable, 
    all: all, 
    and: and, 
    any: any, 
    elem: elem, 
    find: find, 
    findMap: findMap, 
    fold: fold, 
    foldMap: foldMap, 
    foldMapDefaultL: foldMapDefaultL, 
    foldMapDefaultR: foldMapDefaultR, 
    foldl: foldl, 
    foldlDefault: foldlDefault, 
    foldr: foldr, 
    foldrDefault: foldrDefault, 
    for_: for_, 
    intercalate: intercalate, 
    maximum: maximum, 
    maximumBy: maximumBy, 
    minimum: minimum, 
    minimumBy: minimumBy, 
    notElem: notElem, 
    oneOf: oneOf, 
    or: or, 
    product: product, 
    sequence_: sequence_, 
    sum: sum, 
    traverse_: traverse_, 
    foldableArray: foldableArray, 
    foldableMaybe: foldableMaybe, 
    foldableFirst: foldableFirst, 
    foldableLast: foldableLast, 
    foldableAdditive: foldableAdditive, 
    foldableDual: foldableDual, 
    foldableDisj: foldableDisj, 
    foldableConj: foldableConj, 
    foldableMultiplicative: foldableMultiplicative
};

},{"../Control.Alt":11,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Eq":81,"../Data.Function":89,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.Maybe":104,"../Data.Maybe.First":102,"../Data.Maybe.Last":103,"../Data.Monoid":111,"../Data.Monoid.Additive":105,"../Data.Monoid.Conj":106,"../Data.Monoid.Disj":107,"../Data.Monoid.Dual":108,"../Data.Monoid.Endo":109,"../Data.Monoid.Multiplicative":110,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Unit":140,"../Prelude":148,"./foreign":85}],87:[function(require,module,exports){
"use strict";

// module Data.Function.Uncurried

exports.mkFn0 = function (fn) {
  return function () {
    return fn({});
  };
};

exports.mkFn2 = function (fn) {
  /* jshint maxparams: 2 */
  return function (a, b) {
    return fn(a)(b);
  };
};

exports.mkFn3 = function (fn) {
  /* jshint maxparams: 3 */
  return function (a, b, c) {
    return fn(a)(b)(c);
  };
};

exports.mkFn4 = function (fn) {
  /* jshint maxparams: 4 */
  return function (a, b, c, d) {
    return fn(a)(b)(c)(d);
  };
};

exports.mkFn5 = function (fn) {
  /* jshint maxparams: 5 */
  return function (a, b, c, d, e) {
    return fn(a)(b)(c)(d)(e);
  };
};

exports.mkFn6 = function (fn) {
  /* jshint maxparams: 6 */
  return function (a, b, c, d, e, f) {
    return fn(a)(b)(c)(d)(e)(f);
  };
};

exports.mkFn7 = function (fn) {
  /* jshint maxparams: 7 */
  return function (a, b, c, d, e, f, g) {
    return fn(a)(b)(c)(d)(e)(f)(g);
  };
};

exports.mkFn8 = function (fn) {
  /* jshint maxparams: 8 */
  return function (a, b, c, d, e, f, g, h) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h);
  };
};

exports.mkFn9 = function (fn) {
  /* jshint maxparams: 9 */
  return function (a, b, c, d, e, f, g, h, i) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h)(i);
  };
};

exports.mkFn10 = function (fn) {
  /* jshint maxparams: 10 */
  return function (a, b, c, d, e, f, g, h, i, j) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h)(i)(j);
  };
};

exports.runFn0 = function (fn) {
  return fn();
};

exports.runFn2 = function (fn) {
  return function (a) {
    return function (b) {
      return fn(a, b);
    };
  };
};

exports.runFn3 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return fn(a, b, c);
      };
    };
  };
};

exports.runFn4 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return fn(a, b, c, d);
        };
      };
    };
  };
};

exports.runFn5 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return fn(a, b, c, d, e);
          };
        };
      };
    };
  };
};

exports.runFn6 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return fn(a, b, c, d, e, f);
            };
          };
        };
      };
    };
  };
};

exports.runFn7 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return fn(a, b, c, d, e, f, g);
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn8 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return fn(a, b, c, d, e, f, g, h);
                };
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn9 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return function (i) {
                    return fn(a, b, c, d, e, f, g, h, i);
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn10 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return function (i) {
                    return function (j) {
                      return fn(a, b, c, d, e, f, g, h, i, j);
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};

},{}],88:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var runFn1 = function (f) {
    return f;
};
var mkFn1 = function (f) {
    return f;
};
module.exports = {
    mkFn1: mkFn1, 
    runFn1: runFn1, 
    mkFn0: $foreign.mkFn0, 
    mkFn10: $foreign.mkFn10, 
    mkFn2: $foreign.mkFn2, 
    mkFn3: $foreign.mkFn3, 
    mkFn4: $foreign.mkFn4, 
    mkFn5: $foreign.mkFn5, 
    mkFn6: $foreign.mkFn6, 
    mkFn7: $foreign.mkFn7, 
    mkFn8: $foreign.mkFn8, 
    mkFn9: $foreign.mkFn9, 
    runFn0: $foreign.runFn0, 
    runFn10: $foreign.runFn10, 
    runFn2: $foreign.runFn2, 
    runFn3: $foreign.runFn3, 
    runFn4: $foreign.runFn4, 
    runFn5: $foreign.runFn5, 
    runFn6: $foreign.runFn6, 
    runFn7: $foreign.runFn7, 
    runFn8: $foreign.runFn8, 
    runFn9: $foreign.runFn9
};

},{"../Data.Unit":140,"./foreign":87}],89:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Category = require("../Control.Category");
var on = function (f) {
    return function (g) {
        return function (x) {
            return function (y) {
                return f(g(x))(g(y));
            };
        };
    };
};
var flip = function (f) {
    return function (b) {
        return function (a) {
            return f(a)(b);
        };
    };
};
var $$const = function (a) {
    return function (v) {
        return a;
    };
};
var applyFlipped = function (x) {
    return function (f) {
        return f(x);
    };
};
var apply = function (f) {
    return function (x) {
        return f(x);
    };
};
module.exports = {
    apply: apply, 
    applyFlipped: applyFlipped, 
    "const": $$const, 
    flip: flip, 
    on: on
};

},{"../Control.Category":20}],90:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Plus = require("../Control.Plus");
var Data_Foldable = require("../Data.Foldable");
var Data_Newtype = require("../Data.Newtype");
var Data_Traversable = require("../Data.Traversable");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Category = require("../Control.Category");
var Compose = function (x) {
    return x;
};
var showCompose = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Compose " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var ordCompose = function (dictOrd) {
    return dictOrd;
};
var newtypeCompose = new Data_Newtype.Newtype(function (n) {
    return n;
}, Compose);
var functorCompose = function (dictFunctor) {
    return function (dictFunctor1) {
        return new Data_Functor.Functor(function (f) {
            return function (v) {
                return Compose(Data_Functor.map(dictFunctor)(Data_Functor.map(dictFunctor1)(f))(v));
            };
        });
    };
};
var foldableCompose = function (dictFoldable) {
    return function (dictFoldable1) {
        return new Data_Foldable.Foldable(function (dictMonoid) {
            return function (f) {
                return function (v) {
                    return Data_Foldable.foldMap(dictFoldable)(dictMonoid)(Data_Foldable.foldMap(dictFoldable1)(dictMonoid)(f))(v);
                };
            };
        }, function (f) {
            return function (i) {
                return function (v) {
                    return Data_Foldable.foldl(dictFoldable)(Data_Foldable.foldl(dictFoldable1)(f))(i)(v);
                };
            };
        }, function (f) {
            return function (i) {
                return function (v) {
                    return Data_Foldable.foldr(dictFoldable)(Data_Function.flip(Data_Foldable.foldr(dictFoldable1)(f)))(i)(v);
                };
            };
        });
    };
};
var traversableCompose = function (dictTraversable) {
    return function (dictTraversable1) {
        return new Data_Traversable.Traversable(function () {
            return foldableCompose(dictTraversable["__superclass_Data.Foldable.Foldable_1"]())(dictTraversable1["__superclass_Data.Foldable.Foldable_1"]());
        }, function () {
            return functorCompose(dictTraversable["__superclass_Data.Functor.Functor_0"]())(dictTraversable1["__superclass_Data.Functor.Functor_0"]());
        }, function (dictApplicative) {
            return Data_Traversable.traverse(traversableCompose(dictTraversable)(dictTraversable1))(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
        }, function (dictApplicative) {
            return function (f) {
                return function (v) {
                    return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Compose)(Data_Traversable.traverse(dictTraversable)(dictApplicative)(Data_Traversable.traverse(dictTraversable1)(dictApplicative)(f))(v));
                };
            };
        });
    };
};
var eqCompose = function (dictEq) {
    return dictEq;
};
var bihoistCompose = function (dictFunctor) {
    return function (natF) {
        return function (natG) {
            return function (v) {
                return natF(Data_Functor.map(dictFunctor)(natG)(v));
            };
        };
    };
};
var applyCompose = function (dictApply) {
    return function (dictApply1) {
        return new Control_Apply.Apply(function () {
            return functorCompose(dictApply["__superclass_Data.Functor.Functor_0"]())(dictApply1["__superclass_Data.Functor.Functor_0"]());
        }, function (v) {
            return function (v1) {
                return Compose(Control_Apply.apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Control_Apply.apply(dictApply1))(v))(v1));
            };
        });
    };
};
var applicativeCompose = function (dictApplicative) {
    return function (dictApplicative1) {
        return new Control_Applicative.Applicative(function () {
            return applyCompose(dictApplicative["__superclass_Control.Apply.Apply_0"]())(dictApplicative1["__superclass_Control.Apply.Apply_0"]());
        }, function ($57) {
            return Compose(Control_Applicative.pure(dictApplicative)(Control_Applicative.pure(dictApplicative1)($57)));
        });
    };
};
var altCompose = function (dictAlt) {
    return function (dictFunctor) {
        return new Control_Alt.Alt(function () {
            return functorCompose(dictAlt["__superclass_Data.Functor.Functor_0"]())(dictFunctor);
        }, function (v) {
            return function (v1) {
                return Compose(Control_Alt.alt(dictAlt)(v)(v1));
            };
        });
    };
};
var plusCompose = function (dictPlus) {
    return function (dictFunctor) {
        return new Control_Plus.Plus(function () {
            return altCompose(dictPlus["__superclass_Control.Alt.Alt_0"]())(dictFunctor);
        }, Control_Plus.empty(dictPlus));
    };
};
var alternativeCompose = function (dictAlternative) {
    return function (dictApplicative) {
        return new Control_Alternative.Alternative(function () {
            return applicativeCompose(dictAlternative["__superclass_Control.Applicative.Applicative_0"]())(dictApplicative);
        }, function () {
            return plusCompose(dictAlternative["__superclass_Control.Plus.Plus_1"]())((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
        });
    };
};
module.exports = {
    Compose: Compose, 
    bihoistCompose: bihoistCompose, 
    newtypeCompose: newtypeCompose, 
    eqCompose: eqCompose, 
    ordCompose: ordCompose, 
    showCompose: showCompose, 
    functorCompose: functorCompose, 
    applyCompose: applyCompose, 
    applicativeCompose: applicativeCompose, 
    foldableCompose: foldableCompose, 
    traversableCompose: traversableCompose, 
    altCompose: altCompose, 
    plusCompose: plusCompose, 
    alternativeCompose: alternativeCompose
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Show":128,"../Data.Traversable":134,"../Prelude":148}],91:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Functor = require("../Data.Functor");
var Invariant = function (imap) {
    this.imap = imap;
};
var imapF = function (dictFunctor) {
    return function (f) {
        return function (v) {
            return Data_Functor.map(dictFunctor)(f);
        };
    };
};
var invariantArray = new Invariant(imapF(Data_Functor.functorArray));
var invariantFn = new Invariant(imapF(Data_Functor.functorFn));
var imap = function (dict) {
    return dict.imap;
};
module.exports = {
    Invariant: Invariant, 
    imap: imap, 
    imapF: imapF, 
    invariantFn: invariantFn, 
    invariantArray: invariantArray
};

},{"../Data.Functor":93}],92:[function(require,module,exports){
"use strict";

exports.arrayMap = function (f) {
  return function (arr) {
    var l = arr.length;
    var result = new Array(l);
    for (var i = 0; i < l; i++) {
      result[i] = f(arr[i]);
    }
    return result;
  };
};

},{}],93:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Functor = function (map) {
    this.map = map;
};
var map = function (dict) {
    return dict.map;
};
var mapFlipped = function (dictFunctor) {
    return function (fa) {
        return function (f) {
            return map(dictFunctor)(f)(fa);
        };
    };
};
var $$void = function (dictFunctor) {
    return map(dictFunctor)(Data_Function["const"](Data_Unit.unit));
};
var voidLeft = function (dictFunctor) {
    return function (f) {
        return function (x) {
            return map(dictFunctor)(Data_Function["const"](x))(f);
        };
    };
};
var voidRight = function (dictFunctor) {
    return function (x) {
        return map(dictFunctor)(Data_Function["const"](x));
    };
};
var functorFn = new Functor(Control_Semigroupoid.compose(Control_Semigroupoid.semigroupoidFn));
var functorArray = new Functor($foreign.arrayMap);
var flap = function (dictFunctor) {
    return function (ff) {
        return function (x) {
            return map(dictFunctor)(function (f) {
                return f(x);
            })(ff);
        };
    };
};
module.exports = {
    Functor: Functor, 
    flap: flap, 
    map: map, 
    mapFlipped: mapFlipped, 
    "void": $$void, 
    voidLeft: voidLeft, 
    voidRight: voidRight, 
    functorFn: functorFn, 
    functorArray: functorArray
};

},{"../Control.Semigroupoid":63,"../Data.Function":89,"../Data.Unit":140,"./foreign":92}],94:[function(require,module,exports){
"use strict";

// module Data.Generic

exports.zipAll = function (f) {
  return function (xs) {
    return function (ys) {
      var l = xs.length < ys.length ? xs.length : ys.length;
      for (var i = 0; i < l; i++) {
        if (!f(xs[i])(ys[i])) {
          return false;
        }
      }
      return true;
    };
  };
};

exports.zipCompare = function (f) {
  return function (xs) {
    return function (ys) {
      var i = 0;
      var xlen = xs.length;
      var ylen = ys.length;
      while (i < xlen && i < ylen) {
        var o = f(xs[i])(ys[i]);
        if (o !== 0) {
          return o;
        }
        i++;
      }
      if (xlen === ylen) {
        return 0;
      } else if (xlen > ylen) {
        return -1;
      } else {
        return 1;
      }
    };
  };
};

},{}],95:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Data_Array = require("../Data.Array");
var Data_Either = require("../Data.Either");
var Data_Foldable = require("../Data.Foldable");
var Data_Identity = require("../Data.Identity");
var Data_Maybe = require("../Data.Maybe");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_String = require("../Data.String");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Type_Proxy = require("../Type.Proxy");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Data_Ordering = require("../Data.Ordering");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Function = require("../Data.Function");
var Data_Monoid = require("../Data.Monoid");
var Data_Ring = require("../Data.Ring");
var Data_Boolean = require("../Data.Boolean");
var SProd = (function () {
    function SProd(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    SProd.create = function (value0) {
        return function (value1) {
            return new SProd(value0, value1);
        };
    };
    return SProd;
})();
var SRecord = (function () {
    function SRecord(value0) {
        this.value0 = value0;
    };
    SRecord.create = function (value0) {
        return new SRecord(value0);
    };
    return SRecord;
})();
var SNumber = (function () {
    function SNumber(value0) {
        this.value0 = value0;
    };
    SNumber.create = function (value0) {
        return new SNumber(value0);
    };
    return SNumber;
})();
var SBoolean = (function () {
    function SBoolean(value0) {
        this.value0 = value0;
    };
    SBoolean.create = function (value0) {
        return new SBoolean(value0);
    };
    return SBoolean;
})();
var SInt = (function () {
    function SInt(value0) {
        this.value0 = value0;
    };
    SInt.create = function (value0) {
        return new SInt(value0);
    };
    return SInt;
})();
var SString = (function () {
    function SString(value0) {
        this.value0 = value0;
    };
    SString.create = function (value0) {
        return new SString(value0);
    };
    return SString;
})();
var SChar = (function () {
    function SChar(value0) {
        this.value0 = value0;
    };
    SChar.create = function (value0) {
        return new SChar(value0);
    };
    return SChar;
})();
var SArray = (function () {
    function SArray(value0) {
        this.value0 = value0;
    };
    SArray.create = function (value0) {
        return new SArray(value0);
    };
    return SArray;
})();
var SUnit = (function () {
    function SUnit() {

    };
    SUnit.value = new SUnit();
    return SUnit;
})();
var SigProd = (function () {
    function SigProd(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    SigProd.create = function (value0) {
        return function (value1) {
            return new SigProd(value0, value1);
        };
    };
    return SigProd;
})();
var SigRecord = (function () {
    function SigRecord(value0) {
        this.value0 = value0;
    };
    SigRecord.create = function (value0) {
        return new SigRecord(value0);
    };
    return SigRecord;
})();
var SigNumber = (function () {
    function SigNumber() {

    };
    SigNumber.value = new SigNumber();
    return SigNumber;
})();
var SigBoolean = (function () {
    function SigBoolean() {

    };
    SigBoolean.value = new SigBoolean();
    return SigBoolean;
})();
var SigInt = (function () {
    function SigInt() {

    };
    SigInt.value = new SigInt();
    return SigInt;
})();
var SigString = (function () {
    function SigString() {

    };
    SigString.value = new SigString();
    return SigString;
})();
var SigChar = (function () {
    function SigChar() {

    };
    SigChar.value = new SigChar();
    return SigChar;
})();
var SigArray = (function () {
    function SigArray(value0) {
        this.value0 = value0;
    };
    SigArray.create = function (value0) {
        return new SigArray(value0);
    };
    return SigArray;
})();
var SigUnit = (function () {
    function SigUnit() {

    };
    SigUnit.value = new SigUnit();
    return SigUnit;
})();
var Generic = function (fromSpine, toSignature, toSpine) {
    this.fromSpine = fromSpine;
    this.toSignature = toSignature;
    this.toSpine = toSpine;
};
var toSpine = function (dict) {
    return dict.toSpine;
};
var toSignature = function (dict) {
    return dict.toSignature;
};
var showSuspended = function (dictShow) {
    return function (e) {
        return "\\_ -> " + Data_Show.show(dictShow)(e(Data_Unit.unit));
    };
};
var showArray = function (v) {
    return function (v1) {
        if (v1.length === 0) {
            return "[]";
        };
        return "[ " + (Data_Foldable.intercalate(Data_Foldable.foldableArray)(Data_Monoid.monoidString)(", ")(Data_Functor.map(Data_Functor.functorArray)(v)(v1)) + " ]");
    };
};
var showGenericSpine = new Data_Show.Show(function (v) {
    if (v instanceof SUnit) {
        return "SUnit";
    };
    if (v instanceof SChar) {
        return "SChar " + Data_Show.show(Data_Show.showChar)(v.value0);
    };
    if (v instanceof SString) {
        return "SString " + Data_Show.show(Data_Show.showString)(v.value0);
    };
    if (v instanceof SBoolean) {
        return "SBoolean " + Data_Show.show(Data_Show.showBoolean)(v.value0);
    };
    if (v instanceof SNumber) {
        return "SNumber " + Data_Show.show(Data_Show.showNumber)(v.value0);
    };
    if (v instanceof SInt) {
        return "SInt " + Data_Show.show(Data_Show.showInt)(v.value0);
    };
    if (v instanceof SArray) {
        return "SArray " + showArray(showSuspended(showGenericSpine))(v.value0);
    };
    if (v instanceof SProd) {
        return "SProd " + (Data_Show.show(Data_Show.showString)(v.value0) + (" " + showArray(showSuspended(showGenericSpine))(v.value1)));
    };
    if (v instanceof SRecord) {
        var showElt = function (v1) {
            return Data_Foldable.fold(Data_Foldable.foldableArray)(Data_Monoid.monoidString)([ "{ recLabel: ", Data_Show.show(Data_Show.showString)(v1.recLabel), ", recValue: ", showSuspended(showGenericSpine)(v1.recValue), " }" ]);
        };
        return "SRecord " + showArray(showElt)(v.value0);
    };
    throw new Error("Failed pattern match at Data.Generic line 227, column 9 - line 228, column 9: " + [ v.constructor.name ]);
});
var orderingToInt = function (v) {
    if (v instanceof Data_Ordering.EQ) {
        return 0;
    };
    if (v instanceof Data_Ordering.LT) {
        return 1;
    };
    if (v instanceof Data_Ordering.GT) {
        return -1;
    };
    throw new Error("Failed pattern match at Data.Generic line 493, column 17 - line 496, column 10: " + [ v.constructor.name ]);
};
var genericVoid = new Generic(function (v) {
    return Data_Maybe.Nothing.value;
}, function (v) {
    return new SigProd("Data.Void.Void", [  ]);
}, Data_Void.absurd);
var genericUnit = new Generic(function (v) {
    if (v instanceof SUnit) {
        return new Data_Maybe.Just(Data_Unit.unit);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigUnit.value;
}, function (v) {
    return SUnit.value;
});
var genericString = new Generic(function (v) {
    if (v instanceof SString) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigString.value;
}, SString.create);
var genericOrdering = new Generic(function (v) {
    if (v instanceof SProd && (v.value0 === "Data.Ordering.LT" && v.value1.length === 0)) {
        return new Data_Maybe.Just(Data_Ordering.LT.value);
    };
    if (v instanceof SProd && (v.value0 === "Data.Ordering.EQ" && v.value1.length === 0)) {
        return new Data_Maybe.Just(Data_Ordering.EQ.value);
    };
    if (v instanceof SProd && (v.value0 === "Data.Ordering.GT" && v.value1.length === 0)) {
        return new Data_Maybe.Just(Data_Ordering.GT.value);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return new SigProd("Data.Ordering.Ordering", [ {
        sigConstructor: "Data.Ordering.LT", 
        sigValues: [  ]
    }, {
        sigConstructor: "Data.Ordering.EQ", 
        sigValues: [  ]
    }, {
        sigConstructor: "Data.Ordering.GT", 
        sigValues: [  ]
    } ]);
}, function (v) {
    if (v instanceof Data_Ordering.LT) {
        return new SProd("Data.Ordering.LT", [  ]);
    };
    if (v instanceof Data_Ordering.EQ) {
        return new SProd("Data.Ordering.EQ", [  ]);
    };
    if (v instanceof Data_Ordering.GT) {
        return new SProd("Data.Ordering.GT", [  ]);
    };
    throw new Error("Failed pattern match at Data.Generic line 173, column 13 - line 176, column 38: " + [ v.constructor.name ]);
});
var genericNumber = new Generic(function (v) {
    if (v instanceof SNumber) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigNumber.value;
}, SNumber.create);
var genericInt = new Generic(function (v) {
    if (v instanceof SInt) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigInt.value;
}, SInt.create);
var genericChar = new Generic(function (v) {
    if (v instanceof SChar) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigChar.value;
}, SChar.create);
var genericBool = new Generic(function (v) {
    if (v instanceof SBoolean) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigBoolean.value;
}, SBoolean.create);
var fromSpine = function (dict) {
    return dict.fromSpine;
};
var force = function (f) {
    return f(Data_Unit.unit);
};
var genericArray = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SArray) {
            return Data_Traversable.traverse(Data_Traversable.traversableArray)(Data_Maybe.applicativeMaybe)(function ($294) {
                return fromSpine(dictGeneric)(force($294));
            })(v.value0);
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var lowerProxy = function (v) {
            return (Type_Proxy["Proxy"]).value;
        };
        return new SigArray(function (v) {
            return toSignature(dictGeneric)(lowerProxy(x));
        });
    }, function ($295) {
        return SArray.create(Data_Functor.map(Data_Functor.functorArray)(function (x) {
            return function (v) {
                return toSpine(dictGeneric)(x);
            };
        })($295));
    });
};
var genericEither = function (dictGeneric) {
    return function (dictGeneric1) {
        return new Generic(function (v) {
            if (v instanceof SProd && (v.value0 === "Data.Either.Left" && v.value1.length === 1)) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Either.Left.create)(fromSpine(dictGeneric)(force(v.value1[0])));
            };
            if (v instanceof SProd && (v.value0 === "Data.Either.Right" && v.value1.length === 1)) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Either.Right.create)(fromSpine(dictGeneric1)(force(v.value1[0])));
            };
            return Data_Maybe.Nothing.value;
        }, function (x) {
            var rproxy = function (v) {
                return (Type_Proxy["Proxy"]).value;
            };
            var lproxy = function (v) {
                return (Type_Proxy["Proxy"]).value;
            };
            return new SigProd("Data.Either.Either", [ {
                sigConstructor: "Data.Either.Left", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric)(lproxy(x));
                } ]
            }, {
                sigConstructor: "Data.Either.Right", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric1)(rproxy(x));
                } ]
            } ]);
        }, function (v) {
            if (v instanceof Data_Either.Left) {
                return new SProd("Data.Either.Left", [ function (v1) {
                    return toSpine(dictGeneric)(v.value0);
                } ]);
            };
            if (v instanceof Data_Either.Right) {
                return new SProd("Data.Either.Right", [ function (v1) {
                    return toSpine(dictGeneric1)(v.value0);
                } ]);
            };
            throw new Error("Failed pattern match at Data.Generic line 136, column 3 - line 136, column 64: " + [ v.constructor.name ]);
        });
    };
};
var genericIdentity = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SProd && (v.value0 === "Data.Identity.Identity" && v.value1.length === 1)) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Identity.Identity)(fromSpine(dictGeneric)(force(v.value1[0])));
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var iproxy = function (v) {
            return (Type_Proxy["Proxy"]).value;
        };
        return new SigProd("Data.Identity.Identity", [ {
            sigConstructor: "Data.Identity.Identity", 
            sigValues: [ function (v) {
                return toSignature(dictGeneric)(iproxy(x));
            } ]
        } ]);
    }, function (v) {
        return new SProd("Data.Identity.Identity", [ function (v1) {
            return toSpine(dictGeneric)(v);
        } ]);
    });
};
var genericMaybe = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SProd && (v.value0 === "Data.Maybe.Just" && v.value1.length === 1)) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Maybe.Just.create)(fromSpine(dictGeneric)(force(v.value1[0])));
        };
        if (v instanceof SProd && (v.value0 === "Data.Maybe.Nothing" && v.value1.length === 0)) {
            return Control_Applicative.pure(Data_Maybe.applicativeMaybe)(Data_Maybe.Nothing.value);
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var mbProxy = function (v) {
            return (Type_Proxy["Proxy"]).value;
        };
        return new SigProd("Data.Maybe.Maybe", [ {
            sigConstructor: "Data.Maybe.Just", 
            sigValues: [ function (v) {
                return toSignature(dictGeneric)(mbProxy(x));
            } ]
        }, {
            sigConstructor: "Data.Maybe.Nothing", 
            sigValues: [  ]
        } ]);
    }, function (v) {
        if (v instanceof Data_Maybe.Just) {
            return new SProd("Data.Maybe.Just", [ function (v1) {
                return toSpine(dictGeneric)(v.value0);
            } ]);
        };
        if (v instanceof Data_Maybe.Nothing) {
            return new SProd("Data.Maybe.Nothing", [  ]);
        };
        throw new Error("Failed pattern match at Data.Generic line 116, column 3 - line 116, column 63: " + [ v.constructor.name ]);
    });
};
var genericNonEmpty = function (dictGeneric) {
    return function (dictGeneric1) {
        return new Generic(function (v) {
            if (v instanceof SProd && (v.value0 === "Data.NonEmpty.NonEmpty" && v.value1.length === 2)) {
                return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(Data_NonEmpty.NonEmpty.create)(fromSpine(dictGeneric1)(force(v.value1[0]))))(fromSpine(dictGeneric)(force(v.value1[1])));
            };
            return Data_Maybe.Nothing.value;
        }, function (x) {
            var tailProxy = function (v) {
                return (Type_Proxy["Proxy"]).value;
            };
            var headProxy = function (v) {
                return (Type_Proxy["Proxy"]).value;
            };
            return new SigProd("Data.NonEmpty.NonEmpty", [ {
                sigConstructor: "Data.NonEmpty.NonEmpty", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric1)(headProxy(x));
                }, function (v) {
                    return toSignature(dictGeneric)(tailProxy(x));
                } ]
            } ]);
        }, function (v) {
            return new SProd("Data.NonEmpty.NonEmpty", [ function (v1) {
                return toSpine(dictGeneric1)(v.value0);
            }, function (v1) {
                return toSpine(dictGeneric)(v.value1);
            } ]);
        });
    };
};
var genericShowPrec = function (v) {
    return function (v1) {
        if (v1 instanceof SProd) {
            if (Data_Array["null"](v1.value1)) {
                return v1.value0;
            };
            if (Data_Boolean.otherwise) {
                var showParen = function (v2) {
                    return function (x) {
                        if (!v2) {
                            return x;
                        };
                        if (v2) {
                            return "(" + (x + ")");
                        };
                        throw new Error("Failed pattern match at Data.Generic line 422, column 7 - line 422, column 28: " + [ v2.constructor.name, x.constructor.name ]);
                    };
                };
                return showParen(v > 10)(v1.value0 + (" " + Data_String.joinWith(" ")(Data_Functor.map(Data_Functor.functorArray)(function (x) {
                    return genericShowPrec(11)(force(x));
                })(v1.value1))));
            };
        };
        if (v1 instanceof SRecord) {
            var showLabelPart = function (x) {
                return x.recLabel + (": " + genericShowPrec(0)(force(x.recValue)));
            };
            return "{" + (Data_String.joinWith(", ")(Data_Functor.map(Data_Functor.functorArray)(showLabelPart)(v1.value0)) + "}");
        };
        if (v1 instanceof SBoolean) {
            return Data_Show.show(Data_Show.showBoolean)(v1.value0);
        };
        if (v1 instanceof SInt) {
            return Data_Show.show(Data_Show.showInt)(v1.value0);
        };
        if (v1 instanceof SNumber) {
            return Data_Show.show(Data_Show.showNumber)(v1.value0);
        };
        if (v1 instanceof SString) {
            return Data_Show.show(Data_Show.showString)(v1.value0);
        };
        if (v1 instanceof SChar) {
            return Data_Show.show(Data_Show.showChar)(v1.value0);
        };
        if (v1 instanceof SArray) {
            return "[" + (Data_String.joinWith(", ")(Data_Functor.map(Data_Functor.functorArray)(function (x) {
                return genericShowPrec(0)(force(x));
            })(v1.value0)) + "]");
        };
        if (v1 instanceof SUnit) {
            return "unit";
        };
        throw new Error("Failed pattern match at Data.Generic line 416, column 1 - line 424, column 1: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var gShow = function (dictGeneric) {
    return function ($296) {
        return genericShowPrec(0)(toSpine(dictGeneric)($296));
    };
};
var genericTuple = function (dictGeneric) {
    return function (dictGeneric1) {
        return new Generic(function (v) {
            if (v instanceof SProd && (v.value0 === "Data.Tuple.Tuple" && v.value1.length === 2)) {
                return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(Data_Tuple.Tuple.create)(fromSpine(dictGeneric)(force(v.value1[0]))))(fromSpine(dictGeneric1)(force(v.value1[1])));
            };
            return Data_Maybe.Nothing.value;
        }, function (x) {
            var sndProxy = function (v) {
                return (Type_Proxy["Proxy"]).value;
            };
            var fstProxy = function (v) {
                return (Type_Proxy["Proxy"]).value;
            };
            return new SigProd("Data.Tuple.Tuple", [ {
                sigConstructor: "Data.Tuple.Tuple", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric)(fstProxy(x));
                }, function (v) {
                    return toSignature(dictGeneric1)(sndProxy(x));
                } ]
            } ]);
        }, function (v) {
            return new SProd("Data.Tuple.Tuple", [ function (v1) {
                return toSpine(dictGeneric)(v.value0);
            }, function (v1) {
                return toSpine(dictGeneric1)(v.value1);
            } ]);
        });
    };
};
var isValidSpine = function (v) {
    return function (v1) {
        if (v instanceof SigBoolean && v1 instanceof SBoolean) {
            return true;
        };
        if (v instanceof SigNumber && v1 instanceof SNumber) {
            return true;
        };
        if (v instanceof SigInt && v1 instanceof SInt) {
            return true;
        };
        if (v instanceof SigString && v1 instanceof SString) {
            return true;
        };
        if (v instanceof SigChar && v1 instanceof SChar) {
            return true;
        };
        if (v instanceof SigArray && v1 instanceof SArray) {
            return Data_Foldable.all(Data_Foldable.foldableArray)(Data_HeytingAlgebra.heytingAlgebraBoolean)(function ($297) {
                return isValidSpine(force(v.value0))(force($297));
            })(v1.value0);
        };
        if (v instanceof SigProd && v1 instanceof SProd) {
            var $204 = Data_Foldable.find(Data_Foldable.foldableArray)(function (alt) {
                return alt.sigConstructor === v1.value0;
            })(v.value1);
            if ($204 instanceof Data_Maybe.Nothing) {
                return false;
            };
            if ($204 instanceof Data_Maybe.Just) {
                return Data_Foldable.and(Data_Foldable.foldableArray)(Data_HeytingAlgebra.heytingAlgebraBoolean)(Data_Array.zipWith(function (sig) {
                    return function (spine) {
                        return isValidSpine(force(sig))(force(spine));
                    };
                })($204.value0.sigValues)(v1.value1));
            };
            throw new Error("Failed pattern match at Data.Generic line 393, column 3 - line 399, column 15: " + [ $204.constructor.name ]);
        };
        if (v instanceof SigRecord && v1 instanceof SRecord) {
            return Data_Foldable.and(Data_Foldable.foldableArray)(Data_HeytingAlgebra.heytingAlgebraBoolean)(Data_Array.zipWith(function (sig) {
                return function (val) {
                    return isValidSpine(force(sig.recValue))(force(val.recValue));
                };
            })(Data_Array.sortBy(function (a) {
                return function (b) {
                    return Data_Ord.compare(Data_Ord.ordString)(a.recLabel)(b.recLabel);
                };
            })(v.value0))(Data_Array.sortBy(function (a) {
                return function (b) {
                    return Data_Ord.compare(Data_Ord.ordString)(a.recLabel)(b.recLabel);
                };
            })(v1.value0)));
        };
        if (v instanceof SigUnit && v1 instanceof SUnit) {
            return true;
        };
        return false;
    };
};
var showSignature = function (sig) {
    var needsParen = function (s) {
        if (s instanceof SigProd) {
            return true;
        };
        if (s instanceof SigRecord) {
            return true;
        };
        if (s instanceof SigNumber) {
            return false;
        };
        if (s instanceof SigBoolean) {
            return false;
        };
        if (s instanceof SigInt) {
            return false;
        };
        if (s instanceof SigString) {
            return false;
        };
        if (s instanceof SigChar) {
            return false;
        };
        if (s instanceof SigArray) {
            return true;
        };
        if (s instanceof SigUnit) {
            return false;
        };
        throw new Error("Failed pattern match at Data.Generic line 358, column 18 - line 367, column 21: " + [ s.constructor.name ]);
    };
    var paren = function (s) {
        if (needsParen(s)) {
            return "(" + (showSignature(s) + ")");
        };
        if (Data_Boolean.otherwise) {
            return showSignature(s);
        };
        throw new Error("Failed pattern match at Data.Generic line 340, column 1 - line 367, column 21: " + [ s.constructor.name ]);
    };
    return Data_Foldable.fold(Data_Foldable.foldableArray)(Data_Monoid.monoidString)((function () {
        if (sig instanceof SigProd) {
            return [ "SigProd ", Data_Show.show(Data_Show.showString)(sig.value0), " ", showArray(showDataConstructor)(sig.value1) ];
        };
        if (sig instanceof SigRecord) {
            return [ "SigRecord ", showArray(showLabel)(sig.value0) ];
        };
        if (sig instanceof SigNumber) {
            return [ "SigNumber" ];
        };
        if (sig instanceof SigBoolean) {
            return [ "SigBoolean" ];
        };
        if (sig instanceof SigInt) {
            return [ "SigInt" ];
        };
        if (sig instanceof SigString) {
            return [ "SigString" ];
        };
        if (sig instanceof SigChar) {
            return [ "SigChar" ];
        };
        if (sig instanceof SigArray) {
            return [ "SigArray ", paren(force(sig.value0)) ];
        };
        if (sig instanceof SigUnit) {
            return [ "SigUnit" ];
        };
        throw new Error("Failed pattern match at Data.Generic line 341, column 3 - line 351, column 27: " + [ sig.constructor.name ]);
    })());
};
var showLabel = function (l) {
    return "{ recLabel: " + (Data_Show.show(Data_Show.showString)(l.recLabel) + (", recValue: " + (showSignature(force(l.recValue)) + " }")));
};
var showDataConstructor = function (dc) {
    return "{ sigConstructor: " + (Data_Show.show(Data_Show.showString)(dc.sigConstructor) + (", sigValues: " + (showArray(function ($298) {
        return showSignature(force($298));
    })(dc.sigValues) + " }")));
};
var showGenericSignature = new Data_Show.Show(showSignature);
var eqThunk = function (dictEq) {
    return function (x) {
        return function (y) {
            return Data_Eq.eq(dictEq)(force(x))(force(y));
        };
    };
};
var eqRecordSigs = function (dictEq) {
    return function (arr1) {
        return function (arr2) {
            var labelCompare = function (r1) {
                return function (r2) {
                    return Data_Ord.compare(Data_Ord.ordString)(r1.recLabel)(r2.recLabel);
                };
            };
            var sorted1 = Data_Array.sortBy(labelCompare)(arr1);
            var sorted2 = Data_Array.sortBy(labelCompare)(arr2);
            var doCmp = function (x) {
                return function (y) {
                    return x.recLabel === y.recLabel && Data_Eq.eq(dictEq)(force(x.recValue))(force(y.recValue));
                };
            };
            return Data_Array.length(arr1) === Data_Array.length(arr2) && $foreign.zipAll(doCmp)(sorted1)(sorted2);
        };
    };
};
var eqGenericSpine = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof SProd && v1 instanceof SProd) {
            return v.value0 === v1.value0 && (Data_Array.length(v.value1) === Data_Array.length(v1.value1) && $foreign.zipAll(eqThunk(eqGenericSpine))(v.value1)(v1.value1));
        };
        if (v instanceof SRecord && v1 instanceof SRecord) {
            return eqRecordSigs(eqGenericSpine)(v.value0)(v1.value0);
        };
        if (v instanceof SNumber && v1 instanceof SNumber) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SBoolean && v1 instanceof SBoolean) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SInt && v1 instanceof SInt) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SString && v1 instanceof SString) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SChar && v1 instanceof SChar) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SArray && v1 instanceof SArray) {
            return Data_Array.length(v.value0) === Data_Array.length(v1.value0) && $foreign.zipAll(eqThunk(eqGenericSpine))(v.value0)(v1.value0);
        };
        if (v instanceof SUnit && v1 instanceof SUnit) {
            return true;
        };
        return false;
    };
});
var gEq = function (dictGeneric) {
    return function (x) {
        return function (y) {
            return Data_Eq.eq(eqGenericSpine)(toSpine(dictGeneric)(x))(toSpine(dictGeneric)(y));
        };
    };
};
var eqGenericSignature = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof SigProd && v1 instanceof SigProd) {
            return v.value0 === v1.value0 && (Data_Array.length(v.value1) === Data_Array.length(v1.value1) && $foreign.zipAll(eqDataConstructor)(v.value1)(v1.value1));
        };
        if (v instanceof SigRecord && v1 instanceof SigRecord) {
            return eqRecordSigs(eqGenericSignature)(v.value0)(v1.value0);
        };
        if (v instanceof SigNumber && v1 instanceof SigNumber) {
            return true;
        };
        if (v instanceof SigBoolean && v1 instanceof SigBoolean) {
            return true;
        };
        if (v instanceof SigInt && v1 instanceof SigInt) {
            return true;
        };
        if (v instanceof SigString && v1 instanceof SigString) {
            return true;
        };
        if (v instanceof SigChar && v1 instanceof SigChar) {
            return true;
        };
        if (v instanceof SigArray && v1 instanceof SigArray) {
            return eqThunk(eqGenericSignature)(v.value0)(v1.value0);
        };
        if (v instanceof SigUnit && v1 instanceof SigUnit) {
            return true;
        };
        return false;
    };
});
var eqDataConstructor = function (p1) {
    return function (p2) {
        return p1.sigConstructor === p2.sigConstructor && $foreign.zipAll(eqThunk(eqGenericSignature))(p1.sigValues)(p2.sigValues);
    };
};
var compareThunk = function (dictOrd) {
    return function (x) {
        return function (y) {
            return orderingToInt(Data_Ord.compare(dictOrd)(force(x))(force(y)));
        };
    };
};
var ordGenericSpine = new Data_Ord.Ord(function () {
    return eqGenericSpine;
}, function (v) {
    return function (v1) {
        if (v instanceof SProd && v1 instanceof SProd) {
            var $256 = Data_Ord.compare(Data_Ord.ordString)(v.value0)(v1.value0);
            if ($256 instanceof Data_Ordering.EQ) {
                return Data_Ord.compare(Data_Ord.ordInt)(0)($foreign.zipCompare(compareThunk(ordGenericSpine))(v.value1)(v1.value1));
            };
            return $256;
        };
        if (v instanceof SProd) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SProd) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SRecord && v1 instanceof SRecord) {
            var go = function (x) {
                return function (y) {
                    var $265 = Data_Ord.compare(Data_Ord.ordString)(x.recLabel)(y.recLabel);
                    if ($265 instanceof Data_Ordering.EQ) {
                        return orderingToInt(Data_Ord.compare(ordGenericSpine)(force(x.recValue))(force(y.recValue)));
                    };
                    return orderingToInt($265);
                };
            };
            return Data_Ord.compare(Data_Ord.ordInt)(0)($foreign.zipCompare(go)(v.value0)(v1.value0));
        };
        if (v instanceof SRecord) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SRecord) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SInt && v1 instanceof SInt) {
            return Data_Ord.compare(Data_Ord.ordInt)(v.value0)(v1.value0);
        };
        if (v instanceof SInt) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SInt) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SBoolean && v1 instanceof SBoolean) {
            return Data_Ord.compare(Data_Ord.ordBoolean)(v.value0)(v1.value0);
        };
        if (v instanceof SBoolean) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SBoolean) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SNumber && v1 instanceof SNumber) {
            return Data_Ord.compare(Data_Ord.ordNumber)(v.value0)(v1.value0);
        };
        if (v instanceof SNumber) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SNumber) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SString && v1 instanceof SString) {
            return Data_Ord.compare(Data_Ord.ordString)(v.value0)(v1.value0);
        };
        if (v instanceof SString) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SString) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SChar && v1 instanceof SChar) {
            return Data_Ord.compare(Data_Ord.ordChar)(v.value0)(v1.value0);
        };
        if (v instanceof SChar) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SChar) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SArray && v1 instanceof SArray) {
            return Data_Ord.compare(Data_Ord.ordInt)(0)($foreign.zipCompare(compareThunk(ordGenericSpine))(v.value0)(v1.value0));
        };
        if (v instanceof SArray) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SArray) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SUnit && v1 instanceof SUnit) {
            return Data_Ordering.EQ.value;
        };
        throw new Error("Failed pattern match at Data.Generic line 259, column 3 - line 262, column 15: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var gCompare = function (dictGeneric) {
    return function (x) {
        return function (y) {
            return Data_Ord.compare(ordGenericSpine)(toSpine(dictGeneric)(x))(toSpine(dictGeneric)(y));
        };
    };
};
module.exports = {
    SigProd: SigProd, 
    SigRecord: SigRecord, 
    SigNumber: SigNumber, 
    SigBoolean: SigBoolean, 
    SigInt: SigInt, 
    SigString: SigString, 
    SigChar: SigChar, 
    SigArray: SigArray, 
    SigUnit: SigUnit, 
    SProd: SProd, 
    SRecord: SRecord, 
    SNumber: SNumber, 
    SBoolean: SBoolean, 
    SInt: SInt, 
    SString: SString, 
    SChar: SChar, 
    SArray: SArray, 
    SUnit: SUnit, 
    Generic: Generic, 
    fromSpine: fromSpine, 
    gCompare: gCompare, 
    gEq: gEq, 
    gShow: gShow, 
    isValidSpine: isValidSpine, 
    showDataConstructor: showDataConstructor, 
    showSignature: showSignature, 
    toSignature: toSignature, 
    toSpine: toSpine, 
    genericNumber: genericNumber, 
    genericInt: genericInt, 
    genericString: genericString, 
    genericChar: genericChar, 
    genericBool: genericBool, 
    genericArray: genericArray, 
    genericUnit: genericUnit, 
    genericVoid: genericVoid, 
    genericTuple: genericTuple, 
    genericMaybe: genericMaybe, 
    genericEither: genericEither, 
    genericIdentity: genericIdentity, 
    genericOrdering: genericOrdering, 
    genericNonEmpty: genericNonEmpty, 
    showGenericSpine: showGenericSpine, 
    eqGenericSpine: eqGenericSpine, 
    ordGenericSpine: ordGenericSpine, 
    eqGenericSignature: eqGenericSignature, 
    showGenericSignature: showGenericSignature
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Semigroupoid":63,"../Data.Array":69,"../Data.Boolean":73,"../Data.Either":79,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.Identity":98,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.NonEmpty":114,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Show":128,"../Data.String":132,"../Data.Traversable":134,"../Data.Tuple":136,"../Data.Unit":140,"../Data.Void":141,"../Prelude":148,"../Type.Proxy":149,"./foreign":94}],96:[function(require,module,exports){
"use strict";

exports.boolConj = function (b1) {
  return function (b2) {
    return b1 && b2;
  };
};

exports.boolDisj = function (b1) {
  return function (b2) {
    return b1 || b2;
  };
};

exports.boolNot = function (b) {
  return !b;
};

},{}],97:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var HeytingAlgebra = function (conj, disj, ff, implies, not, tt) {
    this.conj = conj;
    this.disj = disj;
    this.ff = ff;
    this.implies = implies;
    this.not = not;
    this.tt = tt;
};
var tt = function (dict) {
    return dict.tt;
};
var not = function (dict) {
    return dict.not;
};
var implies = function (dict) {
    return dict.implies;
};
var heytingAlgebraUnit = new HeytingAlgebra(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, Data_Unit.unit, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return Data_Unit.unit;
}, Data_Unit.unit);
var ff = function (dict) {
    return dict.ff;
};
var disj = function (dict) {
    return dict.disj;
};
var heytingAlgebraBoolean = new HeytingAlgebra($foreign.boolConj, $foreign.boolDisj, false, function (a) {
    return function (b) {
        return disj(heytingAlgebraBoolean)(not(heytingAlgebraBoolean)(a))(b);
    };
}, $foreign.boolNot, true);
var conj = function (dict) {
    return dict.conj;
};
var heytingAlgebraFunction = function (dictHeytingAlgebra) {
    return new HeytingAlgebra(function (f) {
        return function (g) {
            return function (a) {
                return conj(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (f) {
        return function (g) {
            return function (a) {
                return disj(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (v) {
        return ff(dictHeytingAlgebra);
    }, function (f) {
        return function (g) {
            return function (a) {
                return implies(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (f) {
        return function (a) {
            return not(dictHeytingAlgebra)(f(a));
        };
    }, function (v) {
        return tt(dictHeytingAlgebra);
    });
};
module.exports = {
    HeytingAlgebra: HeytingAlgebra, 
    conj: conj, 
    disj: disj, 
    ff: ff, 
    implies: implies, 
    not: not, 
    tt: tt, 
    heytingAlgebraBoolean: heytingAlgebraBoolean, 
    heytingAlgebraUnit: heytingAlgebraUnit, 
    heytingAlgebraFunction: heytingAlgebraFunction
};

},{"../Data.Unit":140,"./foreign":96}],98:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Traversable = require("../Data.Traversable");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Ring = require("../Data.Ring");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Field = require("../Data.Field");
var Data_Show = require("../Data.Show");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Identity = function (x) {
    return x;
};
var showIdentity = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Identity " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringIdentity = function (dictSemiring) {
    return dictSemiring;
};
var semigroupIdenity = function (dictSemigroup) {
    return dictSemigroup;
};
var ringIdentity = function (dictRing) {
    return dictRing;
};
var ordIdentity = function (dictOrd) {
    return dictOrd;
};
var newtypeIdentity = new Data_Newtype.Newtype(function (n) {
    return n;
}, Identity);
var monoidIdentity = function (dictMonoid) {
    return dictMonoid;
};
var heytingAlgebraIdentity = function (dictHeytingAlgebra) {
    return dictHeytingAlgebra;
};
var functorIdentity = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var invariantIdentity = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorIdentity));
var foldableIdentity = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var traversableIdentity = new Data_Traversable.Traversable(function () {
    return foldableIdentity;
}, function () {
    return functorIdentity;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Identity)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Identity)(f(v));
        };
    };
});
var fieldIdentity = function (dictField) {
    return dictField;
};
var extendIdentity = new Control_Extend.Extend(function () {
    return functorIdentity;
}, function (f) {
    return function (m) {
        return f(m);
    };
});
var euclideanRingIdentity = function (dictEuclideanRing) {
    return dictEuclideanRing;
};
var eqIdentity = function (dictEq) {
    return dictEq;
};
var comonadIdentity = new Control_Comonad.Comonad(function () {
    return extendIdentity;
}, function (v) {
    return v;
});
var commutativeRingIdentity = function (dictCommutativeRing) {
    return dictCommutativeRing;
};
var boundedIdentity = function (dictBounded) {
    return dictBounded;
};
var booleanAlgebraIdentity = function (dictBooleanAlgebra) {
    return dictBooleanAlgebra;
};
var applyIdentity = new Control_Apply.Apply(function () {
    return functorIdentity;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindIdentity = new Control_Bind.Bind(function () {
    return applyIdentity;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeIdentity = new Control_Applicative.Applicative(function () {
    return applyIdentity;
}, Identity);
var monadIdentity = new Control_Monad.Monad(function () {
    return applicativeIdentity;
}, function () {
    return bindIdentity;
});
var altIdentity = new Control_Alt.Alt(function () {
    return functorIdentity;
}, function (x) {
    return function (v) {
        return x;
    };
});
module.exports = {
    Identity: Identity, 
    newtypeIdentity: newtypeIdentity, 
    eqIdentity: eqIdentity, 
    ordIdentity: ordIdentity, 
    boundedIdentity: boundedIdentity, 
    heytingAlgebraIdentity: heytingAlgebraIdentity, 
    booleanAlgebraIdentity: booleanAlgebraIdentity, 
    semigroupIdenity: semigroupIdenity, 
    monoidIdentity: monoidIdentity, 
    semiringIdentity: semiringIdentity, 
    euclideanRingIdentity: euclideanRingIdentity, 
    ringIdentity: ringIdentity, 
    commutativeRingIdentity: commutativeRingIdentity, 
    fieldIdentity: fieldIdentity, 
    showIdentity: showIdentity, 
    functorIdentity: functorIdentity, 
    invariantIdentity: invariantIdentity, 
    altIdentity: altIdentity, 
    applyIdentity: applyIdentity, 
    applicativeIdentity: applicativeIdentity, 
    bindIdentity: bindIdentity, 
    monadIdentity: monadIdentity, 
    extendIdentity: extendIdentity, 
    comonadIdentity: comonadIdentity, 
    foldableIdentity: foldableIdentity, 
    traversableIdentity: traversableIdentity
};

},{"../Control.Alt":11,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.CommutativeRing":77,"../Data.Eq":81,"../Data.EuclideanRing":83,"../Data.Field":84,"../Data.Foldable":86,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.HeytingAlgebra":97,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.Traversable":134,"../Prelude":148}],99:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Apply = require("../Control.Apply");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Foldable = require("../Data.Foldable");
var Data_Generic = require("../Data.Generic");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Data_Unit = require("../Data.Unit");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Functor = require("../Data.Functor");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Applicative = require("../Control.Applicative");
var Control_Category = require("../Control.Category");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Nil = (function () {
    function Nil() {

    };
    Nil.value = new Nil();
    return Nil;
})();
var Cons = (function () {
    function Cons(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Cons.create = function (value0) {
        return function (value1) {
            return new Cons(value0, value1);
        };
    };
    return Cons;
})();
var NonEmptyList = function (x) {
    return x;
};
var toList = function (v) {
    return new Cons(v.value0, v.value1);
};
var newtypeNonEmptyList = new Data_Newtype.Newtype(function (n) {
    return n;
}, NonEmptyList);
var genericList = function (dictGeneric) {
    return new Data_Generic.Generic(function (v) {
        if (v instanceof Data_Generic.SProd && (v.value0 === "Data.List.Types.Nil" && v.value1.length === 0)) {
            return new Data_Maybe.Just(Nil.value);
        };
        if (v instanceof Data_Generic.SProd && (v.value0 === "Data.List.Types.Cons" && v.value1.length === 2)) {
            return Control_Apply.apply(Data_Maybe.applyMaybe)(Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Cons.create))(Data_Generic.fromSpine(dictGeneric)(v.value1[0](Data_Unit.unit))))(Data_Generic.fromSpine(genericList(dictGeneric))(v.value1[1](Data_Unit.unit)));
        };
        return Data_Maybe.Nothing.value;
    }, function ($dollarq) {
        return new Data_Generic.SigProd("Data.List.Types.List", [ {
            sigConstructor: "Data.List.Types.Nil", 
            sigValues: [  ]
        }, {
            sigConstructor: "Data.List.Types.Cons", 
            sigValues: [ function ($dollarq1) {
                return Data_Generic.toSignature(dictGeneric)(Data_Generic.anyProxy);
            }, function ($dollarq1) {
                return Data_Generic.toSignature(genericList(dictGeneric))(Data_Generic.anyProxy);
            } ]
        } ]);
    }, function (v) {
        if (v instanceof Nil) {
            return new Data_Generic.SProd("Data.List.Types.Nil", [  ]);
        };
        if (v instanceof Cons) {
            return new Data_Generic.SProd("Data.List.Types.Cons", [ function ($dollarq) {
                return Data_Generic.toSpine(dictGeneric)(v.value0);
            }, function ($dollarq) {
                return Data_Generic.toSpine(genericList(dictGeneric))(v.value1);
            } ]);
        };
        throw new Error("Failed pattern match: " + [ v.constructor.name ]);
    });
};
var genericEmptyList = function (dictGeneric) {
    return Data_Generic.genericNonEmpty(genericList(dictGeneric))(dictGeneric);
};
var foldableList = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return Data_Foldable.foldl(foldableList)(function (acc) {
            return function ($128) {
                return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(acc)(f($128));
            };
        })(Data_Monoid.mempty(dictMonoid));
    };
}, function (f) {
    var go = function (__copy_b) {
        return function (__copy_v) {
            var b = __copy_b;
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Nil) {
                    return b;
                };
                if (v instanceof Cons) {
                    var __tco_b = f(b)(v.value0);
                    var __tco_v = v.value1;
                    b = __tco_b;
                    v = __tco_v;
                    continue tco;
                };
                throw new Error("Failed pattern match at Data.List.Types line 66, column 3 - line 69, column 34: " + [ b.constructor.name, v.constructor.name ]);
            };
        };
    };
    return go;
}, function (f) {
    return function (b) {
        return function (as) {
            var rev = function (__copy_acc) {
                return function (__copy_v) {
                    var acc = __copy_acc;
                    var v = __copy_v;
                    tco: while (true) {
                        if (v instanceof Nil) {
                            return acc;
                        };
                        if (v instanceof Cons) {
                            var __tco_acc = new Cons(v.value0, acc);
                            var __tco_v = v.value1;
                            acc = __tco_acc;
                            v = __tco_v;
                            continue tco;
                        };
                        throw new Error("Failed pattern match at Data.List.Types line 62, column 3 - line 65, column 40: " + [ acc.constructor.name, v.constructor.name ]);
                    };
                };
            };
            return Data_Foldable.foldl(foldableList)(Data_Function.flip(f))(b)(rev(Nil.value)(as));
        };
    };
});
var foldableNonEmptyList = Data_NonEmpty.foldableNonEmpty(foldableList);
var functorList = new Data_Functor.Functor(function (f) {
    return Data_Foldable.foldr(foldableList)(function (x) {
        return function (acc) {
            return new Cons(f(x), acc);
        };
    })(Nil.value);
});
var functorNonEmptyList = Data_NonEmpty.functorNonEmpty(functorList);
var semigroupList = new Data_Semigroup.Semigroup(function (xs) {
    return function (ys) {
        return Data_Foldable.foldr(foldableList)(Cons.create)(ys)(xs);
    };
});
var monoidList = new Data_Monoid.Monoid(function () {
    return semigroupList;
}, Nil.value);
var semigroupNonEmptyList = new Data_Semigroup.Semigroup(function (v) {
    return function (as$prime) {
        return new Data_NonEmpty.NonEmpty(v.value0, Data_Semigroup.append(semigroupList)(v.value1)(toList(as$prime)));
    };
});
var showList = function (dictShow) {
    return new Data_Show.Show(function (v) {
        if (v instanceof Nil) {
            return "Nil";
        };
        return "(" + (Data_Foldable.intercalate(foldableList)(Data_Monoid.monoidString)(" : ")(Data_Functor.map(functorList)(Data_Show.show(dictShow))(v)) + " : Nil)");
    });
};
var showNonEmptyList = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(NonEmptyList " + (Data_Show.show(Data_NonEmpty.showNonEmpty(dictShow)(showList(dictShow)))(v) + ")");
    });
};
var traversableList = new Data_Traversable.Traversable(function () {
    return foldableList;
}, function () {
    return functorList;
}, function (dictApplicative) {
    return Data_Traversable.traverse(traversableList)(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
}, function (dictApplicative) {
    return function (f) {
        return function ($129) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Foldable.foldl(foldableList)(Data_Function.flip(Cons.create))(Nil.value))(Data_Foldable.foldl(foldableList)(function (acc) {
                return function ($130) {
                    return Control_Apply.lift2(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Function.flip(Cons.create))(acc)(f($130));
                };
            })(Control_Applicative.pure(dictApplicative)(Nil.value))($129));
        };
    };
});
var traversableNonEmptyList = Data_NonEmpty.traversableNonEmpty(traversableList);
var unfoldableList = new Data_Unfoldable.Unfoldable(function (f) {
    return function (b) {
        var go = function (__copy_source) {
            return function (__copy_memo) {
                var source = __copy_source;
                var memo = __copy_memo;
                tco: while (true) {
                    var $70 = f(source);
                    if ($70 instanceof Data_Maybe.Nothing) {
                        return Data_Foldable.foldl(foldableList)(Data_Function.flip(Cons.create))(Nil.value)(memo);
                    };
                    if ($70 instanceof Data_Maybe.Just) {
                        var __tco_memo = new Cons($70.value0.value0, memo);
                        source = $70.value0.value1;
                        memo = __tco_memo;
                        continue tco;
                    };
                    throw new Error("Failed pattern match at Data.List.Types line 75, column 24 - line 77, column 54: " + [ $70.constructor.name ]);
                };
            };
        };
        return go(b)(Nil.value);
    };
});
var extendNonEmptyList = new Control_Extend.Extend(function () {
    return functorNonEmptyList;
}, function (f) {
    return function (v) {
        var go = function (a) {
            return function (v1) {
                return {
                    val: new Cons(f(new Data_NonEmpty.NonEmpty(a, v1.acc)), v1.val), 
                    acc: new Cons(a, v1.acc)
                };
            };
        };
        return new Data_NonEmpty.NonEmpty(f(v), (Data_Foldable.foldr(foldableList)(go)({
            val: Nil.value, 
            acc: Nil.value
        })(v.value1)).val);
    };
});
var extendList = new Control_Extend.Extend(function () {
    return functorList;
}, function (f) {
    return function (v) {
        if (v instanceof Nil) {
            return Nil.value;
        };
        if (v instanceof Cons) {
            var go = function (a$prime) {
                return function (v1) {
                    var acc$prime = new Cons(a$prime, v1.acc);
                    return {
                        val: new Cons(f(acc$prime), v1.val), 
                        acc: acc$prime
                    };
                };
            };
            return new Cons(f(v), (Data_Foldable.foldr(foldableList)(go)({
                val: Nil.value, 
                acc: Nil.value
            })(v.value1)).val);
        };
        throw new Error("Failed pattern match at Data.List.Types line 109, column 3 - line 109, column 21: " + [ f.constructor.name, v.constructor.name ]);
    };
});
var eqList = function (dictEq) {
    return new Data_Eq.Eq(function (xs) {
        return function (ys) {
            var go = function (__copy_v) {
                return function (__copy_v1) {
                    return function (__copy_v2) {
                        var v = __copy_v;
                        var v1 = __copy_v1;
                        var v2 = __copy_v2;
                        tco: while (true) {
                            if (!v2) {
                                return false;
                            };
                            if (v instanceof Nil && v1 instanceof Nil) {
                                return v2;
                            };
                            if (v instanceof Cons && v1 instanceof Cons) {
                                var __tco_v = v.value1;
                                var __tco_v1 = v1.value1;
                                var __tco_v2 = v2 && Data_Eq.eq(dictEq)(v1.value0)(v.value0);
                                v = __tco_v;
                                v1 = __tco_v1;
                                v2 = __tco_v2;
                                continue tco;
                            };
                            return false;
                        };
                    };
                };
            };
            return go(xs)(ys)(true);
        };
    });
};
var eqNonEmptyList = function (dictEq) {
    return Data_NonEmpty.eqNonEmpty(dictEq)(eqList(dictEq));
};
var ordList = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqList(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (xs) {
        return function (ys) {
            var go = function (__copy_v) {
                return function (__copy_v1) {
                    var v = __copy_v;
                    var v1 = __copy_v1;
                    tco: while (true) {
                        if (v instanceof Nil && v1 instanceof Nil) {
                            return Data_Ordering.EQ.value;
                        };
                        if (v instanceof Nil) {
                            return Data_Ordering.LT.value;
                        };
                        if (v1 instanceof Nil) {
                            return Data_Ordering.GT.value;
                        };
                        if (v instanceof Cons && v1 instanceof Cons) {
                            var $99 = Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
                            if ($99 instanceof Data_Ordering.EQ) {
                                var __tco_v = v.value1;
                                var __tco_v1 = v1.value1;
                                v = __tco_v;
                                v1 = __tco_v1;
                                continue tco;
                            };
                            return $99;
                        };
                        throw new Error("Failed pattern match at Data.List.Types line 42, column 3 - line 50, column 23: " + [ v.constructor.name, v1.constructor.name ]);
                    };
                };
            };
            return go(xs)(ys);
        };
    });
};
var ordNonEmptyList = function (dictOrd) {
    return Data_NonEmpty.ordNonEmpty(dictOrd)(ordList(dictOrd));
};
var comonadNonEmptyList = new Control_Comonad.Comonad(function () {
    return extendNonEmptyList;
}, function (v) {
    return v.value0;
});
var applyList = new Control_Apply.Apply(function () {
    return functorList;
}, function (v) {
    return function (v1) {
        if (v instanceof Nil) {
            return Nil.value;
        };
        if (v instanceof Cons) {
            return Data_Semigroup.append(semigroupList)(Data_Functor.map(functorList)(v.value0)(v1))(Control_Apply.apply(applyList)(v.value1)(v1));
        };
        throw new Error("Failed pattern match at Data.List.Types line 84, column 3 - line 84, column 20: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var applyNonEmptyList = new Control_Apply.Apply(function () {
    return functorNonEmptyList;
}, function (v) {
    return function (v1) {
        return new Data_NonEmpty.NonEmpty(v.value0(v1.value0), Data_Semigroup.append(semigroupList)(Control_Apply.apply(applyList)(v.value1)(new Cons(v1.value0, Nil.value)))(Control_Apply.apply(applyList)(new Cons(v.value0, v.value1))(v1.value1)));
    };
});
var bindList = new Control_Bind.Bind(function () {
    return applyList;
}, function (v) {
    return function (v1) {
        if (v instanceof Nil) {
            return Nil.value;
        };
        if (v instanceof Cons) {
            return Data_Semigroup.append(semigroupList)(v1(v.value0))(Control_Bind.bind(bindList)(v.value1)(v1));
        };
        throw new Error("Failed pattern match at Data.List.Types line 91, column 3 - line 91, column 19: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindNonEmptyList = new Control_Bind.Bind(function () {
    return applyNonEmptyList;
}, function (v) {
    return function (f) {
        var $123 = f(v.value0);
        return new Data_NonEmpty.NonEmpty($123.value0, Data_Semigroup.append(semigroupList)($123.value1)(Control_Bind.bind(bindList)(v.value1)(function ($131) {
            return toList(f($131));
        })));
    };
});
var applicativeList = new Control_Applicative.Applicative(function () {
    return applyList;
}, function (a) {
    return new Cons(a, Nil.value);
});
var monadList = new Control_Monad.Monad(function () {
    return applicativeList;
}, function () {
    return bindList;
});
var altNonEmptyList = new Control_Alt.Alt(function () {
    return functorNonEmptyList;
}, Data_Semigroup.append(semigroupNonEmptyList));
var altList = new Control_Alt.Alt(function () {
    return functorList;
}, Data_Semigroup.append(semigroupList));
var plusList = new Control_Plus.Plus(function () {
    return altList;
}, Nil.value);
var alternativeList = new Control_Alternative.Alternative(function () {
    return applicativeList;
}, function () {
    return plusList;
});
var monadZeroList = new Control_MonadZero.MonadZero(function () {
    return alternativeList;
}, function () {
    return monadList;
});
var monadPlusList = new Control_MonadPlus.MonadPlus(function () {
    return monadZeroList;
});
var applicativeNonEmptyList = new Control_Applicative.Applicative(function () {
    return applyNonEmptyList;
}, function ($132) {
    return NonEmptyList(Data_NonEmpty.singleton(plusList)($132));
});
var monadNonEmptyList = new Control_Monad.Monad(function () {
    return applicativeNonEmptyList;
}, function () {
    return bindNonEmptyList;
});
module.exports = {
    Nil: Nil, 
    Cons: Cons, 
    NonEmptyList: NonEmptyList, 
    toList: toList, 
    genericList: genericList, 
    showList: showList, 
    eqList: eqList, 
    ordList: ordList, 
    semigroupList: semigroupList, 
    monoidList: monoidList, 
    functorList: functorList, 
    foldableList: foldableList, 
    unfoldableList: unfoldableList, 
    traversableList: traversableList, 
    applyList: applyList, 
    applicativeList: applicativeList, 
    bindList: bindList, 
    monadList: monadList, 
    altList: altList, 
    plusList: plusList, 
    alternativeList: alternativeList, 
    monadZeroList: monadZeroList, 
    monadPlusList: monadPlusList, 
    extendList: extendList, 
    newtypeNonEmptyList: newtypeNonEmptyList, 
    eqNonEmptyList: eqNonEmptyList, 
    ordNonEmptyList: ordNonEmptyList, 
    genericEmptyList: genericEmptyList, 
    showNonEmptyList: showNonEmptyList, 
    functorNonEmptyList: functorNonEmptyList, 
    applyNonEmptyList: applyNonEmptyList, 
    applicativeNonEmptyList: applicativeNonEmptyList, 
    bindNonEmptyList: bindNonEmptyList, 
    monadNonEmptyList: monadNonEmptyList, 
    altNonEmptyList: altNonEmptyList, 
    extendNonEmptyList: extendNonEmptyList, 
    comonadNonEmptyList: comonadNonEmptyList, 
    semigroupNonEmptyList: semigroupNonEmptyList, 
    foldableNonEmptyList: foldableNonEmptyList, 
    traversableNonEmptyList: traversableNonEmptyList
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Control.MonadPlus":58,"../Control.MonadZero":59,"../Control.Plus":62,"../Control.Semigroupoid":63,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.Generic":95,"../Data.HeytingAlgebra":97,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.NonEmpty":114,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Show":128,"../Data.Traversable":134,"../Data.Tuple":136,"../Data.Unfoldable":138,"../Data.Unit":140,"../Prelude":148}],100:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Foldable = require("../Data.Foldable");
var Data_List_Types = require("../Data.List.Types");
var Data_Maybe = require("../Data.Maybe");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Data_Functor = require("../Data.Functor");
var Data_Ring = require("../Data.Ring");
var Data_Eq = require("../Data.Eq");
var Data_Ordering = require("../Data.Ordering");
var Data_Boolean = require("../Data.Boolean");
var Data_Function = require("../Data.Function");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Ord = require("../Data.Ord");
var Data_Semiring = require("../Data.Semiring");
var Control_Bind = require("../Control.Bind");
var Control_Applicative = require("../Control.Applicative");
var Data_Unit = require("../Data.Unit");
var Control_Apply = require("../Control.Apply");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Category = require("../Control.Category");
var updateAt = function (v) {
    return function (v1) {
        return function (v2) {
            if (v === 0 && v2 instanceof Data_List_Types.Cons) {
                return new Data_Maybe.Just(new Data_List_Types.Cons(v1, v2.value1));
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(function (v3) {
                    return new Data_List_Types.Cons(v2.value0, v3);
                })(updateAt(v - 1)(v1)(v2.value1));
            };
            return Data_Maybe.Nothing.value;
        };
    };
};
var unzip = Data_Foldable.foldr(Data_List_Types.foldableList)(function (v) {
    return function (v1) {
        return new Data_Tuple.Tuple(new Data_List_Types.Cons(v.value0, v1.value0), new Data_List_Types.Cons(v.value1, v1.value1));
    };
})(new Data_Tuple.Tuple(Data_List_Types.Nil.value, Data_List_Types.Nil.value));
var uncons = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just({
            head: v.value0, 
            tail: v.value1
        });
    };
    throw new Error("Failed pattern match at Data.List line 257, column 1 - line 257, column 21: " + [ v.constructor.name ]);
};
var toUnfoldable = function (dictUnfoldable) {
    return Data_Unfoldable.unfoldr(dictUnfoldable)(function (xs) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(function (rec) {
            return new Data_Tuple.Tuple(rec.head, rec.tail);
        })(uncons(xs));
    });
};
var tail = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just(v.value1);
    };
    throw new Error("Failed pattern match at Data.List line 238, column 1 - line 238, column 19: " + [ v.constructor.name ]);
};
var span = function (v) {
    return function (v1) {
        if (v1 instanceof Data_List_Types.Cons && v(v1.value0)) {
            var $124 = span(v)(v1.value1);
            return {
                init: new Data_List_Types.Cons(v1.value0, $124.init), 
                rest: $124.rest
            };
        };
        return {
            init: Data_List_Types.Nil.value, 
            rest: v1
        };
    };
};
var singleton = function (a) {
    return new Data_List_Types.Cons(a, Data_List_Types.Nil.value);
};
var sortBy = function (cmp) {
    var merge = function (v) {
        return function (v1) {
            if (v instanceof Data_List_Types.Cons && v1 instanceof Data_List_Types.Cons) {
                if (Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1.value0))(Data_Ordering.GT.value)) {
                    return new Data_List_Types.Cons(v1.value0, merge(v)(v1.value1));
                };
                if (Data_Boolean.otherwise) {
                    return new Data_List_Types.Cons(v.value0, merge(v.value1)(v1));
                };
            };
            if (v instanceof Data_List_Types.Nil) {
                return v1;
            };
            if (v1 instanceof Data_List_Types.Nil) {
                return v;
            };
            throw new Error("Failed pattern match at Data.List line 461, column 3 - line 463, column 41: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
    var mergePairs = function (v) {
        if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Cons) {
            return new Data_List_Types.Cons(merge(v.value0)(v.value1.value0), mergePairs(v.value1.value1));
        };
        return v;
    };
    var mergeAll = function (__copy_v) {
        var v = __copy_v;
        tco: while (true) {
            if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Nil) {
                return v.value0;
            };
            var __tco_v = mergePairs(v);
            v = __tco_v;
            continue tco;
        };
    };
    var sequences = function (v) {
        if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Cons) {
            if (Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v.value1.value0))(Data_Ordering.GT.value)) {
                return descending(v.value1.value0)(singleton(v.value0))(v.value1.value1);
            };
            if (Data_Boolean.otherwise) {
                return ascending(v.value1.value0)(function (v1) {
                    return new Data_List_Types.Cons(v.value0, v1);
                })(v.value1.value1);
            };
        };
        return singleton(v);
    };
    var descending = function (__copy_a) {
        return function (__copy_as) {
            return function (__copy_v) {
                var a = __copy_a;
                var as = __copy_as;
                var v = __copy_v;
                tco: while (true) {
                    if (v instanceof Data_List_Types.Cons && Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(a)(v.value0))(Data_Ordering.GT.value)) {
                        var __tco_a = v.value0;
                        var __tco_as = new Data_List_Types.Cons(a, as);
                        var __tco_v = v.value1;
                        a = __tco_a;
                        as = __tco_as;
                        v = __tco_v;
                        continue tco;
                    };
                    return new Data_List_Types.Cons(new Data_List_Types.Cons(a, as), sequences(v));
                };
            };
        };
    };
    var ascending = function (a) {
        return function (as) {
            return function (v) {
                if (v instanceof Data_List_Types.Cons && Data_Eq.notEq(Data_Ordering.eqOrdering)(cmp(a)(v.value0))(Data_Ordering.GT.value)) {
                    return ascending(v.value0)(function (ys) {
                        return as(new Data_List_Types.Cons(a, ys));
                    })(v.value1);
                };
                return new Data_List_Types.Cons(as(singleton(a)), sequences(v));
            };
        };
    };
    return function ($303) {
        return mergeAll(sequences($303));
    };
};
var sort = function (dictOrd) {
    return function (xs) {
        return sortBy(Data_Ord.compare(dictOrd))(xs);
    };
};
var reverse = (function () {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Data_List_Types.Nil) {
                    return acc;
                };
                if (v instanceof Data_List_Types.Cons) {
                    var __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                    var __tco_v = v.value1;
                    acc = __tco_acc;
                    v = __tco_v;
                    continue tco;
                };
                throw new Error("Failed pattern match at Data.List line 352, column 1 - line 355, column 36: " + [ acc.constructor.name, v.constructor.name ]);
            };
        };
    };
    return go(Data_List_Types.Nil.value);
})();
var snoc = function (xs) {
    return function (x) {
        return reverse(new Data_List_Types.Cons(x, reverse(xs)));
    };
};
var take = (function () {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            return function (__copy_v1) {
                var acc = __copy_acc;
                var v = __copy_v;
                var v1 = __copy_v1;
                tco: while (true) {
                    if (v === 0) {
                        return reverse(acc);
                    };
                    if (v1 instanceof Data_List_Types.Nil) {
                        return reverse(acc);
                    };
                    if (v1 instanceof Data_List_Types.Cons) {
                        var __tco_acc = new Data_List_Types.Cons(v1.value0, acc);
                        var __tco_v = v - 1;
                        var __tco_v1 = v1.value1;
                        acc = __tco_acc;
                        v = __tco_v;
                        v1 = __tco_v1;
                        continue tco;
                    };
                    throw new Error("Failed pattern match at Data.List line 479, column 1 - line 483, column 46: " + [ acc.constructor.name, v.constructor.name, v1.constructor.name ]);
                };
            };
        };
    };
    return go(Data_List_Types.Nil.value);
})();
var takeWhile = function (p) {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Data_List_Types.Cons && p(v.value0)) {
                    var __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                    var __tco_v = v.value1;
                    acc = __tco_acc;
                    v = __tco_v;
                    continue tco;
                };
                return reverse(acc);
            };
        };
    };
    return go(Data_List_Types.Nil.value);
};
var zipWith = function (f) {
    return function (xs) {
        return function (ys) {
            var go = function (__copy_v) {
                return function (__copy_v1) {
                    return function (__copy_acc) {
                        var v = __copy_v;
                        var v1 = __copy_v1;
                        var acc = __copy_acc;
                        tco: while (true) {
                            if (v instanceof Data_List_Types.Nil) {
                                return acc;
                            };
                            if (v1 instanceof Data_List_Types.Nil) {
                                return acc;
                            };
                            if (v instanceof Data_List_Types.Cons && v1 instanceof Data_List_Types.Cons) {
                                var __tco_v = v.value1;
                                var __tco_v1 = v1.value1;
                                var __tco_acc = new Data_List_Types.Cons(f(v.value0)(v1.value0), acc);
                                v = __tco_v;
                                v1 = __tco_v1;
                                acc = __tco_acc;
                                continue tco;
                            };
                            throw new Error("Failed pattern match at Data.List line 643, column 1 - line 647, column 52: " + [ v.constructor.name, v1.constructor.name, acc.constructor.name ]);
                        };
                    };
                };
            };
            return reverse(go(xs)(ys)(Data_List_Types.Nil.value));
        };
    };
};
var zip = zipWith(Data_Tuple.Tuple.create);
var zipWithA = function (dictApplicative) {
    return function (f) {
        return function (xs) {
            return function (ys) {
                return Data_Traversable.sequence(Data_List_Types.traversableList)(dictApplicative)(zipWith(f)(xs)(ys));
            };
        };
    };
};
var range = function (start) {
    return function (end) {
        if (start === end) {
            return singleton(start);
        };
        if (Data_Boolean.otherwise) {
            var go = function (__copy_s) {
                return function (__copy_e) {
                    return function (__copy_step) {
                        return function (__copy_rest) {
                            var s = __copy_s;
                            var e = __copy_e;
                            var step = __copy_step;
                            var rest = __copy_rest;
                            tco: while (true) {
                                if (s === e) {
                                    return new Data_List_Types.Cons(s, rest);
                                };
                                if (Data_Boolean.otherwise) {
                                    var __tco_s = s + step | 0;
                                    var __tco_e = e;
                                    var __tco_step = step;
                                    var __tco_rest = new Data_List_Types.Cons(s, rest);
                                    s = __tco_s;
                                    e = __tco_e;
                                    step = __tco_step;
                                    rest = __tco_rest;
                                    continue tco;
                                };
                                throw new Error("Failed pattern match at Data.List line 137, column 1 - line 141, column 65: " + [ s.constructor.name, e.constructor.name, step.constructor.name, rest.constructor.name ]);
                            };
                        };
                    };
                };
            };
            return go(end)(start)((function () {
                var $184 = start > end;
                if ($184) {
                    return 1;
                };
                if (!$184) {
                    return -1;
                };
                throw new Error("Failed pattern match at Data.List line 138, column 45 - line 138, column 74: " + [ $184.constructor.name ]);
            })())(Data_List_Types.Nil.value);
        };
        throw new Error("Failed pattern match at Data.List line 137, column 1 - line 141, column 65: " + [ start.constructor.name, end.constructor.name ]);
    };
};
var $$null = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return true;
    };
    return false;
};
var mapWithIndex = function (f) {
    return function (lst) {
        var go = function (__copy_v) {
            return function (__copy_v1) {
                return function (__copy_acc) {
                    var v = __copy_v;
                    var v1 = __copy_v1;
                    var acc = __copy_acc;
                    tco: while (true) {
                        if (v1 instanceof Data_List_Types.Nil) {
                            return acc;
                        };
                        if (v1 instanceof Data_List_Types.Cons) {
                            var __tco_v = v + 1 | 0;
                            var __tco_v1 = v1.value1;
                            var __tco_acc = new Data_List_Types.Cons(f(v1.value0)(v), acc);
                            v = __tco_v;
                            v1 = __tco_v1;
                            acc = __tco_acc;
                            continue tco;
                        };
                        throw new Error("Failed pattern match at Data.List line 417, column 1 - line 420, column 48: " + [ v.constructor.name, v1.constructor.name, acc.constructor.name ]);
                    };
                };
            };
        };
        return reverse(go(0)(lst)(Data_List_Types.Nil.value));
    };
};
var mapMaybe = function (f) {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Data_List_Types.Nil) {
                    return reverse(acc);
                };
                if (v instanceof Data_List_Types.Cons) {
                    var $193 = f(v.value0);
                    if ($193 instanceof Data_Maybe.Nothing) {
                        var __tco_acc = acc;
                        var __tco_v = v.value1;
                        acc = __tco_acc;
                        v = __tco_v;
                        continue tco;
                    };
                    if ($193 instanceof Data_Maybe.Just) {
                        var __tco_acc = new Data_List_Types.Cons($193.value0, acc);
                        var __tco_v = v.value1;
                        acc = __tco_acc;
                        v = __tco_v;
                        continue tco;
                    };
                    throw new Error("Failed pattern match at Data.List line 405, column 5 - line 407, column 32: " + [ $193.constructor.name ]);
                };
                throw new Error("Failed pattern match at Data.List line 401, column 1 - line 407, column 32: " + [ acc.constructor.name, v.constructor.name ]);
            };
        };
    };
    return go(Data_List_Types.Nil.value);
};
var manyRec = function (dictMonadRec) {
    return function (dictAlternative) {
        return function (p) {
            var go = function (acc) {
                return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Alt.alt((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())(Data_Functor.map(((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())["__superclass_Data.Functor.Functor_0"]())(Control_Monad_Rec_Class.Loop.create)(p))(Control_Applicative.pure(dictAlternative["__superclass_Control.Applicative.Applicative_0"]())(new Control_Monad_Rec_Class.Done(Data_Unit.unit))))(function (v) {
                    return Control_Applicative.pure(dictAlternative["__superclass_Control.Applicative.Applicative_0"]())(Data_Bifunctor.bimap(Control_Monad_Rec_Class.bifunctorStep)(function (v1) {
                        return new Data_List_Types.Cons(v1, acc);
                    })(function (v1) {
                        return reverse(acc);
                    })(v));
                });
            };
            return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(go)(Data_List_Types.Nil.value);
        };
    };
};
var someRec = function (dictMonadRec) {
    return function (dictAlternative) {
        return function (v) {
            return Control_Apply.apply((dictAlternative["__superclass_Control.Applicative.Applicative_0"]())["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map(((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_List_Types.Cons.create)(v))(manyRec(dictMonadRec)(dictAlternative)(v));
        };
    };
};
var some = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Apply.apply((dictAlternative["__superclass_Control.Applicative.Applicative_0"]())["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map(((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_List_Types.Cons.create)(v))(Control_Lazy.defer(dictLazy)(function (v1) {
                return many(dictAlternative)(dictLazy)(v);
            }));
        };
    };
};
var many = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Alt.alt((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())(some(dictAlternative)(dictLazy)(v))(Control_Applicative.pure(dictAlternative["__superclass_Control.Applicative.Applicative_0"]())(Data_List_Types.Nil.value));
        };
    };
};
var length = Data_Foldable.foldl(Data_List_Types.foldableList)(function (acc) {
    return function (v) {
        return acc + 1 | 0;
    };
})(0);
var last = function (__copy_v) {
    var v = __copy_v;
    tco: while (true) {
        if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Nil) {
            return new Data_Maybe.Just(v.value0);
        };
        if (v instanceof Data_List_Types.Cons) {
            var __tco_v = v.value1;
            v = __tco_v;
            continue tco;
        };
        return Data_Maybe.Nothing.value;
    };
};
var insertBy = function (v) {
    return function (x) {
        return function (v1) {
            if (v1 instanceof Data_List_Types.Nil) {
                return singleton(x);
            };
            if (v1 instanceof Data_List_Types.Cons) {
                var $209 = v(x)(v1.value0);
                if ($209 instanceof Data_Ordering.GT) {
                    return new Data_List_Types.Cons(v1.value0, insertBy(v)(x)(v1.value1));
                };
                return new Data_List_Types.Cons(x, v1);
            };
            throw new Error("Failed pattern match at Data.List line 209, column 1 - line 209, column 31: " + [ v.constructor.name, x.constructor.name, v1.constructor.name ]);
        };
    };
};
var insertAt = function (v) {
    return function (v1) {
        return function (v2) {
            if (v === 0) {
                return new Data_Maybe.Just(new Data_List_Types.Cons(v1, v2));
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(function (v3) {
                    return new Data_List_Types.Cons(v2.value0, v3);
                })(insertAt(v - 1)(v1)(v2.value1));
            };
            return Data_Maybe.Nothing.value;
        };
    };
};
var insert = function (dictOrd) {
    return insertBy(Data_Ord.compare(dictOrd));
};
var init = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    var go = function (__copy_v1) {
        return function (__copy_acc) {
            var v1 = __copy_v1;
            var acc = __copy_acc;
            tco: while (true) {
                if (v1 instanceof Data_List_Types.Cons && v1.value1 instanceof Data_List_Types.Nil) {
                    return acc;
                };
                if (v1 instanceof Data_List_Types.Cons) {
                    var __tco_v1 = v1.value1;
                    var __tco_acc = new Data_List_Types.Cons(v1.value0, acc);
                    v1 = __tco_v1;
                    acc = __tco_acc;
                    continue tco;
                };
                return acc;
            };
        };
    };
    return Data_Maybe.Just.create(reverse(go(v)(Data_List_Types.Nil.value)));
};
var index = function (__copy_v) {
    return function (__copy_v1) {
        var v = __copy_v;
        var v1 = __copy_v1;
        tco: while (true) {
            if (v instanceof Data_List_Types.Nil) {
                return Data_Maybe.Nothing.value;
            };
            if (v instanceof Data_List_Types.Cons && v1 === 0) {
                return new Data_Maybe.Just(v.value0);
            };
            if (v instanceof Data_List_Types.Cons) {
                var __tco_v = v.value1;
                var __tco_v1 = v1 - 1;
                v = __tco_v;
                v1 = __tco_v1;
                continue tco;
            };
            throw new Error("Failed pattern match at Data.List line 268, column 1 - line 268, column 22: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var head = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just(v.value0);
    };
    throw new Error("Failed pattern match at Data.List line 223, column 1 - line 223, column 19: " + [ v.constructor.name ]);
};
var transpose = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_List_Types.Nil.value;
    };
    if (v instanceof Data_List_Types.Cons && v.value0 instanceof Data_List_Types.Nil) {
        return transpose(v.value1);
    };
    if (v instanceof Data_List_Types.Cons && v.value0 instanceof Data_List_Types.Cons) {
        return new Data_List_Types.Cons(new Data_List_Types.Cons(v.value0.value0, mapMaybe(head)(v.value1)), transpose(new Data_List_Types.Cons(v.value0.value1, mapMaybe(tail)(v.value1))));
    };
    throw new Error("Failed pattern match at Data.List line 680, column 1 - line 680, column 20: " + [ v.constructor.name ]);
};
var groupBy = function (v) {
    return function (v1) {
        if (v1 instanceof Data_List_Types.Nil) {
            return Data_List_Types.Nil.value;
        };
        if (v1 instanceof Data_List_Types.Cons) {
            var $242 = span(v(v1.value0))(v1.value1);
            return new Data_List_Types.Cons(new Data_NonEmpty.NonEmpty(v1.value0, $242.init), groupBy(v)($242.rest));
        };
        throw new Error("Failed pattern match at Data.List line 553, column 1 - line 553, column 20: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var group = function (dictEq) {
    return groupBy(Data_Eq.eq(dictEq));
};
var group$prime = function (dictOrd) {
    return function ($304) {
        return group(dictOrd["__superclass_Data.Eq.Eq_0"]())(sort(dictOrd)($304));
    };
};
var fromFoldable = function (dictFoldable) {
    return Data_Foldable.foldr(dictFoldable)(Data_List_Types.Cons.create)(Data_List_Types.Nil.value);
};
var foldM = function (dictMonad) {
    return function (v) {
        return function (a) {
            return function (v1) {
                if (v1 instanceof Data_List_Types.Nil) {
                    return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(a);
                };
                if (v1 instanceof Data_List_Types.Cons) {
                    return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v(a)(v1.value0))(function (a$prime) {
                        return foldM(dictMonad)(v)(a$prime)(v1.value1);
                    });
                };
                throw new Error("Failed pattern match at Data.List line 691, column 1 - line 691, column 23: " + [ v.constructor.name, a.constructor.name, v1.constructor.name ]);
            };
        };
    };
};
var findIndex = function (fn) {
    var go = function (__copy_v) {
        return function (__copy_v1) {
            var v = __copy_v;
            var v1 = __copy_v1;
            tco: while (true) {
                if (v1 instanceof Data_List_Types.Cons) {
                    if (fn(v1.value0)) {
                        return new Data_Maybe.Just(v);
                    };
                    if (Data_Boolean.otherwise) {
                        var __tco_v = v + 1 | 0;
                        var __tco_v1 = v1.value1;
                        v = __tco_v;
                        v1 = __tco_v1;
                        continue tco;
                    };
                };
                if (v1 instanceof Data_List_Types.Nil) {
                    return Data_Maybe.Nothing.value;
                };
                throw new Error("Failed pattern match at Data.List line 288, column 3 - line 289, column 44: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
    };
    return go(0);
};
var findLastIndex = function (fn) {
    return function (xs) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(function (v) {
            return length(xs) - 1 - v;
        })(findIndex(fn)(reverse(xs)));
    };
};
var filterM = function (dictMonad) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Data_List_Types.Nil) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_List_Types.Nil.value);
            };
            if (v1 instanceof Data_List_Types.Cons) {
                return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v(v1.value0))(function (v2) {
                    return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(filterM(dictMonad)(v)(v1.value1))(function (v3) {
                        return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())((function () {
                            if (v2) {
                                return new Data_List_Types.Cons(v1.value0, v3);
                            };
                            if (!v2) {
                                return v3;
                            };
                            throw new Error("Failed pattern match at Data.List line 394, column 3 - line 394, column 34: " + [ v2.constructor.name ]);
                        })());
                    });
                });
            };
            throw new Error("Failed pattern match at Data.List line 390, column 1 - line 390, column 25: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var filter = function (p) {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Data_List_Types.Nil) {
                    return reverse(acc);
                };
                if (v instanceof Data_List_Types.Cons) {
                    if (p(v.value0)) {
                        var __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                        var __tco_v = v.value1;
                        acc = __tco_acc;
                        v = __tco_v;
                        continue tco;
                    };
                    if (Data_Boolean.otherwise) {
                        var __tco_acc = acc;
                        var __tco_v = v.value1;
                        acc = __tco_acc;
                        v = __tco_v;
                        continue tco;
                    };
                };
                throw new Error("Failed pattern match at Data.List line 374, column 1 - line 379, column 28: " + [ acc.constructor.name, v.constructor.name ]);
            };
        };
    };
    return go(Data_List_Types.Nil.value);
};
var intersectBy = function (v) {
    return function (v1) {
        return function (v2) {
            if (v1 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            if (v2 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            return filter(function (x) {
                return Data_Foldable.any(Data_List_Types.foldableList)(Data_HeytingAlgebra.heytingAlgebraBoolean)(v(x))(v2);
            })(v1);
        };
    };
};
var intersect = function (dictEq) {
    return intersectBy(Data_Eq.eq(dictEq));
};
var nubBy = function (v) {
    return function (v1) {
        if (v1 instanceof Data_List_Types.Nil) {
            return Data_List_Types.Nil.value;
        };
        if (v1 instanceof Data_List_Types.Cons) {
            return new Data_List_Types.Cons(v1.value0, nubBy(v)(filter(function (y) {
                return !v(v1.value0)(y);
            })(v1.value1)));
        };
        throw new Error("Failed pattern match at Data.List line 572, column 1 - line 572, column 22: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var nub = function (dictEq) {
    return nubBy(Data_Eq.eq(dictEq));
};
var elemLastIndex = function (dictEq) {
    return function (x) {
        return findLastIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var elemIndex = function (dictEq) {
    return function (x) {
        return findIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var dropWhile = function (p) {
    var go = function (__copy_v) {
        var v = __copy_v;
        tco: while (true) {
            if (v instanceof Data_List_Types.Cons && p(v.value0)) {
                var __tco_v = v.value1;
                v = __tco_v;
                continue tco;
            };
            return v;
        };
    };
    return go;
};
var drop = function (__copy_v) {
    return function (__copy_v1) {
        var v = __copy_v;
        var v1 = __copy_v1;
        tco: while (true) {
            if (v === 0) {
                return v1;
            };
            if (v1 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            if (v1 instanceof Data_List_Types.Cons) {
                var __tco_v = v - 1;
                var __tco_v1 = v1.value1;
                v = __tco_v;
                v1 = __tco_v1;
                continue tco;
            };
            throw new Error("Failed pattern match at Data.List line 498, column 1 - line 498, column 15: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var slice = function (start) {
    return function (end) {
        return function (xs) {
            return take(end - start)(drop(start)(xs));
        };
    };
};
var deleteBy = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            if (v2 instanceof Data_List_Types.Cons && v(v1)(v2.value0)) {
                return v2.value1;
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return new Data_List_Types.Cons(v2.value0, deleteBy(v)(v1)(v2.value1));
            };
            throw new Error("Failed pattern match at Data.List line 599, column 1 - line 599, column 23: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var unionBy = function (eq) {
    return function (xs) {
        return function (ys) {
            return Data_Semigroup.append(Data_List_Types.semigroupList)(xs)(Data_Foldable.foldl(Data_List_Types.foldableList)(Data_Function.flip(deleteBy(eq)))(nubBy(eq)(ys))(xs));
        };
    };
};
var union = function (dictEq) {
    return unionBy(Data_Eq.eq(dictEq));
};
var deleteAt = function (v) {
    return function (v1) {
        if (v === 0 && v1 instanceof Data_List_Types.Cons) {
            return new Data_Maybe.Just(v1.value1);
        };
        if (v1 instanceof Data_List_Types.Cons) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(function (v2) {
                return new Data_List_Types.Cons(v1.value0, v2);
            })(deleteAt(v - 1)(v1.value1));
        };
        return Data_Maybe.Nothing.value;
    };
};
var $$delete = function (dictEq) {
    return deleteBy(Data_Eq.eq(dictEq));
};
var difference = function (dictEq) {
    return Data_Foldable.foldl(Data_List_Types.foldableList)(Data_Function.flip($$delete(dictEq)));
};
var concatMap = Data_Function.flip(Control_Bind.bind(Data_List_Types.bindList));
var concat = function (v) {
    return Control_Bind.bind(Data_List_Types.bindList)(v)(Control_Category.id(Control_Category.categoryFn));
};
var catMaybes = mapMaybe(Control_Category.id(Control_Category.categoryFn));
var alterAt = function (v) {
    return function (v1) {
        return function (v2) {
            if (v === 0 && v2 instanceof Data_List_Types.Cons) {
                return Data_Maybe.Just.create((function () {
                    var $297 = v1(v2.value0);
                    if ($297 instanceof Data_Maybe.Nothing) {
                        return v2.value1;
                    };
                    if ($297 instanceof Data_Maybe.Just) {
                        return new Data_List_Types.Cons($297.value0, v2.value1);
                    };
                    throw new Error("Failed pattern match at Data.List line 337, column 24 - line 340, column 23: " + [ $297.constructor.name ]);
                })());
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(function (v3) {
                    return new Data_List_Types.Cons(v2.value0, v3);
                })(alterAt(v - 1)(v1)(v2.value1));
            };
            return Data_Maybe.Nothing.value;
        };
    };
};
var modifyAt = function (n) {
    return function (f) {
        return alterAt(n)(function ($305) {
            return Data_Maybe.Just.create(f($305));
        });
    };
};
module.exports = {
    alterAt: alterAt, 
    catMaybes: catMaybes, 
    concat: concat, 
    concatMap: concatMap, 
    "delete": $$delete, 
    deleteAt: deleteAt, 
    deleteBy: deleteBy, 
    difference: difference, 
    drop: drop, 
    dropWhile: dropWhile, 
    elemIndex: elemIndex, 
    elemLastIndex: elemLastIndex, 
    filter: filter, 
    filterM: filterM, 
    findIndex: findIndex, 
    findLastIndex: findLastIndex, 
    foldM: foldM, 
    fromFoldable: fromFoldable, 
    group: group, 
    "group'": group$prime, 
    groupBy: groupBy, 
    head: head, 
    index: index, 
    init: init, 
    insert: insert, 
    insertAt: insertAt, 
    insertBy: insertBy, 
    intersect: intersect, 
    intersectBy: intersectBy, 
    last: last, 
    length: length, 
    many: many, 
    manyRec: manyRec, 
    mapMaybe: mapMaybe, 
    mapWithIndex: mapWithIndex, 
    modifyAt: modifyAt, 
    nub: nub, 
    nubBy: nubBy, 
    "null": $$null, 
    range: range, 
    reverse: reverse, 
    singleton: singleton, 
    slice: slice, 
    snoc: snoc, 
    some: some, 
    someRec: someRec, 
    sort: sort, 
    sortBy: sortBy, 
    span: span, 
    tail: tail, 
    take: take, 
    takeWhile: takeWhile, 
    toUnfoldable: toUnfoldable, 
    transpose: transpose, 
    uncons: uncons, 
    union: union, 
    unionBy: unionBy, 
    unzip: unzip, 
    updateAt: updateAt, 
    zip: zip, 
    zipWith: zipWith, 
    zipWithA: zipWithA
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Lazy":25,"../Control.Monad.Rec.Class":50,"../Control.Semigroupoid":63,"../Data.Bifunctor":71,"../Data.Boolean":73,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.List.Types":99,"../Data.Maybe":104,"../Data.NonEmpty":114,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Traversable":134,"../Data.Tuple":136,"../Data.Unfoldable":138,"../Data.Unit":140,"../Prelude":148}],101:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Foldable = require("../Data.Foldable");
var Data_List = require("../Data.List");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Partial_Unsafe = require("../Partial.Unsafe");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Functor = require("../Data.Functor");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_List_Types = require("../Data.List.Types");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Ordering = require("../Data.Ordering");
var Data_Semiring = require("../Data.Semiring");
var Leaf = (function () {
    function Leaf() {

    };
    Leaf.value = new Leaf();
    return Leaf;
})();
var Two = (function () {
    function Two(value0, value1, value2, value3) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
        this.value3 = value3;
    };
    Two.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return function (value3) {
                    return new Two(value0, value1, value2, value3);
                };
            };
        };
    };
    return Two;
})();
var Three = (function () {
    function Three(value0, value1, value2, value3, value4, value5, value6) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
        this.value3 = value3;
        this.value4 = value4;
        this.value5 = value5;
        this.value6 = value6;
    };
    Three.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return function (value3) {
                    return function (value4) {
                        return function (value5) {
                            return function (value6) {
                                return new Three(value0, value1, value2, value3, value4, value5, value6);
                            };
                        };
                    };
                };
            };
        };
    };
    return Three;
})();
var TwoLeft = (function () {
    function TwoLeft(value0, value1, value2) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
    };
    TwoLeft.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return new TwoLeft(value0, value1, value2);
            };
        };
    };
    return TwoLeft;
})();
var TwoRight = (function () {
    function TwoRight(value0, value1, value2) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
    };
    TwoRight.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return new TwoRight(value0, value1, value2);
            };
        };
    };
    return TwoRight;
})();
var ThreeLeft = (function () {
    function ThreeLeft(value0, value1, value2, value3, value4, value5) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
        this.value3 = value3;
        this.value4 = value4;
        this.value5 = value5;
    };
    ThreeLeft.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return function (value3) {
                    return function (value4) {
                        return function (value5) {
                            return new ThreeLeft(value0, value1, value2, value3, value4, value5);
                        };
                    };
                };
            };
        };
    };
    return ThreeLeft;
})();
var ThreeMiddle = (function () {
    function ThreeMiddle(value0, value1, value2, value3, value4, value5) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
        this.value3 = value3;
        this.value4 = value4;
        this.value5 = value5;
    };
    ThreeMiddle.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return function (value3) {
                    return function (value4) {
                        return function (value5) {
                            return new ThreeMiddle(value0, value1, value2, value3, value4, value5);
                        };
                    };
                };
            };
        };
    };
    return ThreeMiddle;
})();
var ThreeRight = (function () {
    function ThreeRight(value0, value1, value2, value3, value4, value5) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
        this.value3 = value3;
        this.value4 = value4;
        this.value5 = value5;
    };
    ThreeRight.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return function (value3) {
                    return function (value4) {
                        return function (value5) {
                            return new ThreeRight(value0, value1, value2, value3, value4, value5);
                        };
                    };
                };
            };
        };
    };
    return ThreeRight;
})();
var KickUp = (function () {
    function KickUp(value0, value1, value2, value3) {
        this.value0 = value0;
        this.value1 = value1;
        this.value2 = value2;
        this.value3 = value3;
    };
    KickUp.create = function (value0) {
        return function (value1) {
            return function (value2) {
                return function (value3) {
                    return new KickUp(value0, value1, value2, value3);
                };
            };
        };
    };
    return KickUp;
})();
var values = function (v) {
    if (v instanceof Leaf) {
        return Data_List_Types.Nil.value;
    };
    if (v instanceof Two) {
        return Data_Semigroup.append(Data_List_Types.semigroupList)(values(v.value0))(Data_Semigroup.append(Data_List_Types.semigroupList)(Control_Applicative.pure(Data_List_Types.applicativeList)(v.value2))(values(v.value3)));
    };
    if (v instanceof Three) {
        return Data_Semigroup.append(Data_List_Types.semigroupList)(values(v.value0))(Data_Semigroup.append(Data_List_Types.semigroupList)(Control_Applicative.pure(Data_List_Types.applicativeList)(v.value2))(Data_Semigroup.append(Data_List_Types.semigroupList)(values(v.value3))(Data_Semigroup.append(Data_List_Types.semigroupList)(Control_Applicative.pure(Data_List_Types.applicativeList)(v.value5))(values(v.value6)))));
    };
    throw new Error("Failed pattern match at Data.Map line 406, column 1 - line 406, column 18: " + [ v.constructor.name ]);
};
var toList = function (v) {
    if (v instanceof Leaf) {
        return Data_List_Types.Nil.value;
    };
    if (v instanceof Two) {
        return Data_Semigroup.append(Data_List_Types.semigroupList)(toList(v.value0))(new Data_List_Types.Cons(new Data_Tuple.Tuple(v.value1, v.value2), toList(v.value3)));
    };
    if (v instanceof Three) {
        return Data_Semigroup.append(Data_List_Types.semigroupList)(toList(v.value0))(Data_Semigroup.append(Data_List_Types.semigroupList)(new Data_List_Types.Cons(new Data_Tuple.Tuple(v.value1, v.value2), toList(v.value3)))(new Data_List_Types.Cons(new Data_Tuple.Tuple(v.value4, v.value5), toList(v.value6))));
    };
    throw new Error("Failed pattern match at Data.Map line 383, column 1 - line 383, column 18: " + [ v.constructor.name ]);
};
var size = function ($635) {
    return Data_List.length(values($635));
};
var singleton = function (k) {
    return function (v) {
        return new Two(Leaf.value, k, v, Leaf.value);
    };
};
var toUnfoldable = function (dictUnfoldable) {
    return function (m) {
        var go = function (__copy_v) {
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Data_List_Types.Nil) {
                    return Data_Maybe.Nothing.value;
                };
                if (v instanceof Data_List_Types.Cons) {
                    if (v.value0 instanceof Leaf) {
                        var __tco_v = v.value1;
                        v = __tco_v;
                        continue tco;
                    };
                    if (v.value0 instanceof Two) {
                        return Data_Maybe.Just.create(new Data_Tuple.Tuple(new Data_Tuple.Tuple(v.value0.value1, v.value0.value2), new Data_List_Types.Cons(v.value0.value0, new Data_List_Types.Cons(v.value0.value3, v.value1))));
                    };
                    if (v.value0 instanceof Three) {
                        return Data_Maybe.Just.create(new Data_Tuple.Tuple(new Data_Tuple.Tuple(v.value0.value1, v.value0.value2), new Data_List_Types.Cons(singleton(v.value0.value4)(v.value0.value5), new Data_List_Types.Cons(v.value0.value0, new Data_List_Types.Cons(v.value0.value3, new Data_List_Types.Cons(v.value0.value6, v.value1))))));
                    };
                    throw new Error("Failed pattern match at Data.Map line 391, column 18 - line 396, column 77: " + [ v.value0.constructor.name ]);
                };
                throw new Error("Failed pattern match at Data.Map line 389, column 1 - line 396, column 77: " + [ v.constructor.name ]);
            };
        };
        return Data_Unfoldable.unfoldr(dictUnfoldable)(go)(new Data_List_Types.Cons(m, Data_List_Types.Nil.value));
    };
};
var showTree = function (dictShow) {
    return function (dictShow1) {
        return function (v) {
            if (v instanceof Leaf) {
                return "Leaf";
            };
            if (v instanceof Two) {
                return "Two (" + (showTree(dictShow)(dictShow1)(v.value0) + (") (" + (Data_Show.show(dictShow)(v.value1) + (") (" + (Data_Show.show(dictShow1)(v.value2) + (") (" + (showTree(dictShow)(dictShow1)(v.value3) + ")")))))));
            };
            if (v instanceof Three) {
                return "Three (" + (showTree(dictShow)(dictShow1)(v.value0) + (") (" + (Data_Show.show(dictShow)(v.value1) + (") (" + (Data_Show.show(dictShow1)(v.value2) + (") (" + (showTree(dictShow)(dictShow1)(v.value3) + (") (" + (Data_Show.show(dictShow)(v.value4) + (") (" + (Data_Show.show(dictShow1)(v.value5) + (") (" + (showTree(dictShow)(dictShow1)(v.value6) + ")")))))))))))));
            };
            throw new Error("Failed pattern match at Data.Map line 99, column 1 - line 100, column 1: " + [ v.constructor.name ]);
        };
    };
};
var showMap = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (m) {
            return "(fromList " + (Data_Show.show(Data_List_Types.showList(Data_Tuple.showTuple(dictShow)(dictShow1)))(toList(m)) + ")");
        });
    };
};
var mapWithKey = function (v) {
    return function (v1) {
        if (v1 instanceof Leaf) {
            return Leaf.value;
        };
        if (v1 instanceof Two) {
            return new Two(mapWithKey(v)(v1.value0), v1.value1, v(v1.value1)(v1.value2), mapWithKey(v)(v1.value3));
        };
        if (v1 instanceof Three) {
            return new Three(mapWithKey(v)(v1.value0), v1.value1, v(v1.value1)(v1.value2), mapWithKey(v)(v1.value3), v1.value4, v(v1.value4)(v1.value5), mapWithKey(v)(v1.value6));
        };
        throw new Error("Failed pattern match at Data.Map line 432, column 1 - line 432, column 25: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var lookupLE = function (dictOrd) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Leaf) {
                return Data_Maybe.Nothing.value;
            };
            if (v1 instanceof Two) {
                var $147 = Data_Ord.compare(dictOrd)(v)(v1.value1);
                if ($147 instanceof Data_Ordering.EQ) {
                    return new Data_Maybe.Just({
                        key: v1.value1, 
                        value: v1.value2
                    });
                };
                if ($147 instanceof Data_Ordering.GT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value1, 
                        value: v1.value2
                    })(lookupLE(dictOrd)(v)(v1.value3)));
                };
                if ($147 instanceof Data_Ordering.LT) {
                    return lookupLE(dictOrd)(v)(v1.value0);
                };
                throw new Error("Failed pattern match at Data.Map line 166, column 37 - line 169, column 24: " + [ $147.constructor.name ]);
            };
            if (v1 instanceof Three) {
                var $152 = Data_Ord.compare(dictOrd)(v)(v1.value4);
                if ($152 instanceof Data_Ordering.EQ) {
                    return new Data_Maybe.Just({
                        key: v1.value4, 
                        value: v1.value5
                    });
                };
                if ($152 instanceof Data_Ordering.GT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value4, 
                        value: v1.value5
                    })(lookupLE(dictOrd)(v)(v1.value6)));
                };
                if ($152 instanceof Data_Ordering.LT) {
                    return lookupLE(dictOrd)(v)(new Two(v1.value0, v1.value1, v1.value2, v1.value3));
                };
                throw new Error("Failed pattern match at Data.Map line 170, column 49 - line 173, column 40: " + [ $152.constructor.name ]);
            };
            throw new Error("Failed pattern match at Data.Map line 165, column 1 - line 165, column 26: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var lookupGE = function (dictOrd) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Leaf) {
                return Data_Maybe.Nothing.value;
            };
            if (v1 instanceof Two) {
                var $162 = Data_Ord.compare(dictOrd)(v)(v1.value1);
                if ($162 instanceof Data_Ordering.EQ) {
                    return new Data_Maybe.Just({
                        key: v1.value1, 
                        value: v1.value2
                    });
                };
                if ($162 instanceof Data_Ordering.LT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value1, 
                        value: v1.value2
                    })(lookupGE(dictOrd)(v)(v1.value0)));
                };
                if ($162 instanceof Data_Ordering.GT) {
                    return lookupGE(dictOrd)(v)(v1.value3);
                };
                throw new Error("Failed pattern match at Data.Map line 190, column 37 - line 193, column 25: " + [ $162.constructor.name ]);
            };
            if (v1 instanceof Three) {
                var $167 = Data_Ord.compare(dictOrd)(v)(v1.value1);
                if ($167 instanceof Data_Ordering.EQ) {
                    return new Data_Maybe.Just({
                        key: v1.value1, 
                        value: v1.value2
                    });
                };
                if ($167 instanceof Data_Ordering.LT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value1, 
                        value: v1.value2
                    })(lookupGE(dictOrd)(v)(v1.value0)));
                };
                if ($167 instanceof Data_Ordering.GT) {
                    return lookupGE(dictOrd)(v)(new Two(v1.value3, v1.value4, v1.value5, v1.value6));
                };
                throw new Error("Failed pattern match at Data.Map line 194, column 49 - line 197, column 41: " + [ $167.constructor.name ]);
            };
            throw new Error("Failed pattern match at Data.Map line 189, column 1 - line 189, column 26: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var lookup = function (dictOrd) {
    return Partial_Unsafe.unsafePartial(function (dictPartial) {
        return function (k) {
            return function (tree) {
                if (tree instanceof Leaf) {
                    return Data_Maybe.Nothing.value;
                };
                var comp = Data_Ord.compare(dictOrd);
                var __unused = function (dictPartial1) {
                    return function ($dollar42) {
                        return $dollar42;
                    };
                };
                return __unused(dictPartial)((function () {
                    if (tree instanceof Two) {
                        var $177 = comp(k)(tree.value1);
                        if ($177 instanceof Data_Ordering.EQ) {
                            return new Data_Maybe.Just(tree.value2);
                        };
                        if ($177 instanceof Data_Ordering.LT) {
                            return lookup(dictOrd)(k)(tree.value0);
                        };
                        return lookup(dictOrd)(k)(tree.value3);
                    };
                    if (tree instanceof Three) {
                        var $182 = comp(k)(tree.value1);
                        if ($182 instanceof Data_Ordering.EQ) {
                            return new Data_Maybe.Just(tree.value2);
                        };
                        var $184 = comp(k)(tree.value4);
                        if ($184 instanceof Data_Ordering.EQ) {
                            return new Data_Maybe.Just(tree.value5);
                        };
                        if ($182 instanceof Data_Ordering.LT) {
                            return lookup(dictOrd)(k)(tree.value0);
                        };
                        if ($184 instanceof Data_Ordering.GT) {
                            return lookup(dictOrd)(k)(tree.value6);
                        };
                        return lookup(dictOrd)(k)(tree.value3);
                    };
                    throw new Error("Failed pattern match at Data.Map line 146, column 10 - line 160, column 39: " + [ tree.constructor.name ]);
                })());
            };
        };
    });
};
var member = function (dictOrd) {
    return function (k) {
        return function (m) {
            return Data_Maybe.isJust(lookup(dictOrd)(k)(m));
        };
    };
};
var keys = function (v) {
    if (v instanceof Leaf) {
        return Data_List_Types.Nil.value;
    };
    if (v instanceof Two) {
        return Data_Semigroup.append(Data_List_Types.semigroupList)(keys(v.value0))(Data_Semigroup.append(Data_List_Types.semigroupList)(Control_Applicative.pure(Data_List_Types.applicativeList)(v.value1))(keys(v.value3)));
    };
    if (v instanceof Three) {
        return Data_Semigroup.append(Data_List_Types.semigroupList)(keys(v.value0))(Data_Semigroup.append(Data_List_Types.semigroupList)(Control_Applicative.pure(Data_List_Types.applicativeList)(v.value1))(Data_Semigroup.append(Data_List_Types.semigroupList)(keys(v.value3))(Data_Semigroup.append(Data_List_Types.semigroupList)(Control_Applicative.pure(Data_List_Types.applicativeList)(v.value4))(keys(v.value6)))));
    };
    throw new Error("Failed pattern match at Data.Map line 400, column 1 - line 400, column 16: " + [ v.constructor.name ]);
};
var isEmpty = function (v) {
    if (v instanceof Leaf) {
        return true;
    };
    return false;
};
var functorMap = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Leaf) {
            return Leaf.value;
        };
        if (v1 instanceof Two) {
            return new Two(Data_Functor.map(functorMap)(v)(v1.value0), v1.value1, v(v1.value2), Data_Functor.map(functorMap)(v)(v1.value3));
        };
        if (v1 instanceof Three) {
            return new Three(Data_Functor.map(functorMap)(v)(v1.value0), v1.value1, v(v1.value2), Data_Functor.map(functorMap)(v)(v1.value3), v1.value4, v(v1.value5), Data_Functor.map(functorMap)(v)(v1.value6));
        };
        throw new Error("Failed pattern match at Data.Map line 71, column 3 - line 71, column 20: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var fromZipper = function (__copy_dictOrd) {
    return function (__copy_v) {
        return function (__copy_tree) {
            var dictOrd = __copy_dictOrd;
            var v = __copy_v;
            var tree = __copy_tree;
            tco: while (true) {
                if (v instanceof Data_List_Types.Nil) {
                    return tree;
                };
                if (v instanceof Data_List_Types.Cons) {
                    if (v.value0 instanceof TwoLeft) {
                        var __tco_dictOrd = dictOrd;
                        var __tco_v = v.value1;
                        var __tco_tree = new Two(tree, v.value0.value0, v.value0.value1, v.value0.value2);
                        dictOrd = __tco_dictOrd;
                        v = __tco_v;
                        tree = __tco_tree;
                        continue tco;
                    };
                    if (v.value0 instanceof TwoRight) {
                        var __tco_dictOrd = dictOrd;
                        var __tco_v = v.value1;
                        var __tco_tree = new Two(v.value0.value0, v.value0.value1, v.value0.value2, tree);
                        dictOrd = __tco_dictOrd;
                        v = __tco_v;
                        tree = __tco_tree;
                        continue tco;
                    };
                    if (v.value0 instanceof ThreeLeft) {
                        var __tco_dictOrd = dictOrd;
                        var __tco_v = v.value1;
                        var __tco_tree = new Three(tree, v.value0.value0, v.value0.value1, v.value0.value2, v.value0.value3, v.value0.value4, v.value0.value5);
                        dictOrd = __tco_dictOrd;
                        v = __tco_v;
                        tree = __tco_tree;
                        continue tco;
                    };
                    if (v.value0 instanceof ThreeMiddle) {
                        var __tco_dictOrd = dictOrd;
                        var __tco_v = v.value1;
                        var __tco_tree = new Three(v.value0.value0, v.value0.value1, v.value0.value2, tree, v.value0.value3, v.value0.value4, v.value0.value5);
                        dictOrd = __tco_dictOrd;
                        v = __tco_v;
                        tree = __tco_tree;
                        continue tco;
                    };
                    if (v.value0 instanceof ThreeRight) {
                        var __tco_dictOrd = dictOrd;
                        var __tco_v = v.value1;
                        var __tco_tree = new Three(v.value0.value0, v.value0.value1, v.value0.value2, v.value0.value3, v.value0.value4, v.value0.value5, tree);
                        dictOrd = __tco_dictOrd;
                        v = __tco_v;
                        tree = __tco_tree;
                        continue tco;
                    };
                    throw new Error("Failed pattern match at Data.Map line 237, column 3 - line 242, column 88: " + [ v.value0.constructor.name ]);
                };
                throw new Error("Failed pattern match at Data.Map line 235, column 1 - line 235, column 27: " + [ v.constructor.name, tree.constructor.name ]);
            };
        };
    };
};
var insert = function (dictOrd) {
    var up = function (__copy_v) {
        return function (__copy_v1) {
            var v = __copy_v;
            var v1 = __copy_v1;
            tco: while (true) {
                if (v instanceof Data_List_Types.Nil) {
                    return new Two(v1.value0, v1.value1, v1.value2, v1.value3);
                };
                if (v instanceof Data_List_Types.Cons) {
                    if (v.value0 instanceof TwoLeft) {
                        return fromZipper(dictOrd)(v.value1)(new Three(v1.value0, v1.value1, v1.value2, v1.value3, v.value0.value0, v.value0.value1, v.value0.value2));
                    };
                    if (v.value0 instanceof TwoRight) {
                        return fromZipper(dictOrd)(v.value1)(new Three(v.value0.value0, v.value0.value1, v.value0.value2, v1.value0, v1.value1, v1.value2, v1.value3));
                    };
                    if (v.value0 instanceof ThreeLeft) {
                        var __tco_v = v.value1;
                        var __tco_v1 = new KickUp(new Two(v1.value0, v1.value1, v1.value2, v1.value3), v.value0.value0, v.value0.value1, new Two(v.value0.value2, v.value0.value3, v.value0.value4, v.value0.value5));
                        v = __tco_v;
                        v1 = __tco_v1;
                        continue tco;
                    };
                    if (v.value0 instanceof ThreeMiddle) {
                        var __tco_v = v.value1;
                        var __tco_v1 = new KickUp(new Two(v.value0.value0, v.value0.value1, v.value0.value2, v1.value0), v1.value1, v1.value2, new Two(v1.value3, v.value0.value3, v.value0.value4, v.value0.value5));
                        v = __tco_v;
                        v1 = __tco_v1;
                        continue tco;
                    };
                    if (v.value0 instanceof ThreeRight) {
                        var __tco_v = v.value1;
                        var __tco_v1 = new KickUp(new Two(v.value0.value0, v.value0.value1, v.value0.value2, v.value0.value3), v.value0.value4, v.value0.value5, new Two(v1.value0, v1.value1, v1.value2, v1.value3));
                        v = __tco_v;
                        v1 = __tco_v1;
                        continue tco;
                    };
                    throw new Error("Failed pattern match at Data.Map line 273, column 5 - line 278, column 104: " + [ v.value0.constructor.name, v1.constructor.name ]);
                };
                throw new Error("Failed pattern match at Data.Map line 271, column 3 - line 271, column 54: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
    };
    var comp = Data_Ord.compare(dictOrd);
    var down = function (__copy_ctx) {
        return function (__copy_k) {
            return function (__copy_v) {
                return function (__copy_v1) {
                    var ctx = __copy_ctx;
                    var k = __copy_k;
                    var v = __copy_v;
                    var v1 = __copy_v1;
                    tco: while (true) {
                        if (v1 instanceof Leaf) {
                            return up(ctx)(new KickUp(Leaf.value, k, v, Leaf.value));
                        };
                        if (v1 instanceof Two) {
                            var $305 = comp(k)(v1.value1);
                            if ($305 instanceof Data_Ordering.EQ) {
                                return fromZipper(dictOrd)(ctx)(new Two(v1.value0, k, v, v1.value3));
                            };
                            if ($305 instanceof Data_Ordering.LT) {
                                var __tco_ctx = new Data_List_Types.Cons(new TwoLeft(v1.value1, v1.value2, v1.value3), ctx);
                                var __tco_k = k;
                                var __tco_v = v;
                                var __tco_v1 = v1.value0;
                                ctx = __tco_ctx;
                                k = __tco_k;
                                v = __tco_v;
                                v1 = __tco_v1;
                                continue tco;
                            };
                            var __tco_ctx = new Data_List_Types.Cons(new TwoRight(v1.value0, v1.value1, v1.value2), ctx);
                            var __tco_k = k;
                            var __tco_v = v;
                            var __tco_v1 = v1.value3;
                            ctx = __tco_ctx;
                            k = __tco_k;
                            v = __tco_v;
                            v1 = __tco_v1;
                            continue tco;
                        };
                        if (v1 instanceof Three) {
                            var $310 = comp(k)(v1.value1);
                            if ($310 instanceof Data_Ordering.EQ) {
                                return fromZipper(dictOrd)(ctx)(new Three(v1.value0, k, v, v1.value3, v1.value4, v1.value5, v1.value6));
                            };
                            var $312 = comp(k)(v1.value4);
                            if ($312 instanceof Data_Ordering.EQ) {
                                return fromZipper(dictOrd)(ctx)(new Three(v1.value0, v1.value1, v1.value2, v1.value3, k, v, v1.value6));
                            };
                            if ($310 instanceof Data_Ordering.LT) {
                                var __tco_ctx = new Data_List_Types.Cons(new ThreeLeft(v1.value1, v1.value2, v1.value3, v1.value4, v1.value5, v1.value6), ctx);
                                var __tco_k = k;
                                var __tco_v = v;
                                var __tco_v1 = v1.value0;
                                ctx = __tco_ctx;
                                k = __tco_k;
                                v = __tco_v;
                                v1 = __tco_v1;
                                continue tco;
                            };
                            if ($310 instanceof Data_Ordering.GT && $312 instanceof Data_Ordering.LT) {
                                var __tco_ctx = new Data_List_Types.Cons(new ThreeMiddle(v1.value0, v1.value1, v1.value2, v1.value4, v1.value5, v1.value6), ctx);
                                var __tco_k = k;
                                var __tco_v = v;
                                var __tco_v1 = v1.value3;
                                ctx = __tco_ctx;
                                k = __tco_k;
                                v = __tco_v;
                                v1 = __tco_v1;
                                continue tco;
                            };
                            var __tco_ctx = new Data_List_Types.Cons(new ThreeRight(v1.value0, v1.value1, v1.value2, v1.value3, v1.value4, v1.value5), ctx);
                            var __tco_k = k;
                            var __tco_v = v;
                            var __tco_v1 = v1.value6;
                            ctx = __tco_ctx;
                            k = __tco_k;
                            v = __tco_v;
                            v1 = __tco_v1;
                            continue tco;
                        };
                        throw new Error("Failed pattern match at Data.Map line 254, column 3 - line 254, column 52: " + [ ctx.constructor.name, k.constructor.name, v.constructor.name, v1.constructor.name ]);
                    };
                };
            };
        };
    };
    return down(Data_List_Types.Nil.value);
};
var pop = function (dictOrd) {
    var up = Partial_Unsafe.unsafePartial(function (dictPartial) {
        return function (ctxs) {
            return function (tree) {
                if (ctxs instanceof Data_List_Types.Nil) {
                    return tree;
                };
                if (ctxs instanceof Data_List_Types.Cons) {
                    var __unused = function (dictPartial1) {
                        return function ($dollar50) {
                            return $dollar50;
                        };
                    };
                    return __unused(dictPartial)((function () {
                        if (ctxs.value0 instanceof TwoLeft && (ctxs.value0.value2 instanceof Leaf && tree instanceof Leaf)) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(Leaf.value, ctxs.value0.value0, ctxs.value0.value1, Leaf.value));
                        };
                        if (ctxs.value0 instanceof TwoRight && (ctxs.value0.value0 instanceof Leaf && tree instanceof Leaf)) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(Leaf.value, ctxs.value0.value1, ctxs.value0.value2, Leaf.value));
                        };
                        if (ctxs.value0 instanceof TwoLeft && ctxs.value0.value2 instanceof Two) {
                            return up(ctxs.value1)(new Three(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0, ctxs.value0.value2.value1, ctxs.value0.value2.value2, ctxs.value0.value2.value3));
                        };
                        if (ctxs.value0 instanceof TwoRight && ctxs.value0.value0 instanceof Two) {
                            return up(ctxs.value1)(new Three(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3, ctxs.value0.value1, ctxs.value0.value2, tree));
                        };
                        if (ctxs.value0 instanceof TwoLeft && ctxs.value0.value2 instanceof Three) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(new Two(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0), ctxs.value0.value2.value1, ctxs.value0.value2.value2, new Two(ctxs.value0.value2.value3, ctxs.value0.value2.value4, ctxs.value0.value2.value5, ctxs.value0.value2.value6)));
                        };
                        if (ctxs.value0 instanceof TwoRight && ctxs.value0.value0 instanceof Three) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(new Two(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3), ctxs.value0.value0.value4, ctxs.value0.value0.value5, new Two(ctxs.value0.value0.value6, ctxs.value0.value1, ctxs.value0.value2, tree)));
                        };
                        if (ctxs.value0 instanceof ThreeLeft && (ctxs.value0.value2 instanceof Leaf && (ctxs.value0.value5 instanceof Leaf && tree instanceof Leaf))) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(Leaf.value, ctxs.value0.value0, ctxs.value0.value1, Leaf.value, ctxs.value0.value3, ctxs.value0.value4, Leaf.value));
                        };
                        if (ctxs.value0 instanceof ThreeMiddle && (ctxs.value0.value0 instanceof Leaf && (ctxs.value0.value5 instanceof Leaf && tree instanceof Leaf))) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(Leaf.value, ctxs.value0.value1, ctxs.value0.value2, Leaf.value, ctxs.value0.value3, ctxs.value0.value4, Leaf.value));
                        };
                        if (ctxs.value0 instanceof ThreeRight && (ctxs.value0.value0 instanceof Leaf && (ctxs.value0.value3 instanceof Leaf && tree instanceof Leaf))) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(Leaf.value, ctxs.value0.value1, ctxs.value0.value2, Leaf.value, ctxs.value0.value4, ctxs.value0.value5, Leaf.value));
                        };
                        if (ctxs.value0 instanceof ThreeLeft && ctxs.value0.value2 instanceof Two) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(new Three(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0, ctxs.value0.value2.value1, ctxs.value0.value2.value2, ctxs.value0.value2.value3), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                        };
                        if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value0 instanceof Two) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(new Three(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3, ctxs.value0.value1, ctxs.value0.value2, tree), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                        };
                        if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value5 instanceof Two) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Three(tree, ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5.value0, ctxs.value0.value5.value1, ctxs.value0.value5.value2, ctxs.value0.value5.value3)));
                        };
                        if (ctxs.value0 instanceof ThreeRight && ctxs.value0.value3 instanceof Two) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Two(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Three(ctxs.value0.value3.value0, ctxs.value0.value3.value1, ctxs.value0.value3.value2, ctxs.value0.value3.value3, ctxs.value0.value4, ctxs.value0.value5, tree)));
                        };
                        if (ctxs.value0 instanceof ThreeLeft && ctxs.value0.value2 instanceof Three) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(new Two(tree, ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2.value0), ctxs.value0.value2.value1, ctxs.value0.value2.value2, new Two(ctxs.value0.value2.value3, ctxs.value0.value2.value4, ctxs.value0.value2.value5, ctxs.value0.value2.value6), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                        };
                        if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value0 instanceof Three) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(new Two(ctxs.value0.value0.value0, ctxs.value0.value0.value1, ctxs.value0.value0.value2, ctxs.value0.value0.value3), ctxs.value0.value0.value4, ctxs.value0.value0.value5, new Two(ctxs.value0.value0.value6, ctxs.value0.value1, ctxs.value0.value2, tree), ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5));
                        };
                        if (ctxs.value0 instanceof ThreeMiddle && ctxs.value0.value5 instanceof Three) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Two(tree, ctxs.value0.value3, ctxs.value0.value4, ctxs.value0.value5.value0), ctxs.value0.value5.value1, ctxs.value0.value5.value2, new Two(ctxs.value0.value5.value3, ctxs.value0.value5.value4, ctxs.value0.value5.value5, ctxs.value0.value5.value6)));
                        };
                        if (ctxs.value0 instanceof ThreeRight && ctxs.value0.value3 instanceof Three) {
                            return fromZipper(dictOrd)(ctxs.value1)(new Three(ctxs.value0.value0, ctxs.value0.value1, ctxs.value0.value2, new Two(ctxs.value0.value3.value0, ctxs.value0.value3.value1, ctxs.value0.value3.value2, ctxs.value0.value3.value3), ctxs.value0.value3.value4, ctxs.value0.value3.value5, new Two(ctxs.value0.value3.value6, ctxs.value0.value4, ctxs.value0.value5, tree)));
                        };
                        throw new Error("Failed pattern match at Data.Map line 323, column 9 - line 340, column 136: " + [ ctxs.value0.constructor.name, tree.constructor.name ]);
                    })());
                };
                throw new Error("Failed pattern match at Data.Map line 320, column 5 - line 340, column 136: " + [ ctxs.constructor.name ]);
            };
        };
    });
    var removeMaxNode = Partial_Unsafe.unsafePartial(function (dictPartial) {
        return function (ctx) {
            return function (m) {
                var __unused = function (dictPartial1) {
                    return function ($dollar52) {
                        return $dollar52;
                    };
                };
                return __unused(dictPartial)((function () {
                    if (m instanceof Two && (m.value0 instanceof Leaf && m.value3 instanceof Leaf)) {
                        return up(ctx)(Leaf.value);
                    };
                    if (m instanceof Two) {
                        return removeMaxNode(new Data_List_Types.Cons(new TwoRight(m.value0, m.value1, m.value2), ctx))(m.value3);
                    };
                    if (m instanceof Three && (m.value0 instanceof Leaf && (m.value3 instanceof Leaf && m.value6 instanceof Leaf))) {
                        return up(new Data_List_Types.Cons(new TwoRight(Leaf.value, m.value1, m.value2), ctx))(Leaf.value);
                    };
                    if (m instanceof Three) {
                        return removeMaxNode(new Data_List_Types.Cons(new ThreeRight(m.value0, m.value1, m.value2, m.value3, m.value4, m.value5), ctx))(m.value6);
                    };
                    throw new Error("Failed pattern match at Data.Map line 352, column 5 - line 356, column 107: " + [ m.constructor.name ]);
                })());
            };
        };
    });
    var maxNode = Partial_Unsafe.unsafePartial(function (dictPartial) {
        return function (m) {
            var __unused = function (dictPartial1) {
                return function ($dollar54) {
                    return $dollar54;
                };
            };
            return __unused(dictPartial)((function () {
                if (m instanceof Two && m.value3 instanceof Leaf) {
                    return {
                        key: m.value1, 
                        value: m.value2
                    };
                };
                if (m instanceof Two) {
                    return maxNode(m.value3);
                };
                if (m instanceof Three && m.value6 instanceof Leaf) {
                    return {
                        key: m.value4, 
                        value: m.value5
                    };
                };
                if (m instanceof Three) {
                    return maxNode(m.value6);
                };
                throw new Error("Failed pattern match at Data.Map line 343, column 33 - line 347, column 45: " + [ m.constructor.name ]);
            })());
        };
    });
    var comp = Data_Ord.compare(dictOrd);
    var down = Partial_Unsafe.unsafePartial(function (dictPartial) {
        return function (ctx) {
            return function (k) {
                return function (m) {
                    if (m instanceof Leaf) {
                        return Data_Maybe.Nothing.value;
                    };
                    if (m instanceof Two) {
                        var $523 = comp(k)(m.value1);
                        if (m.value3 instanceof Leaf && $523 instanceof Data_Ordering.EQ) {
                            return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, up(ctx)(Leaf.value)));
                        };
                        if ($523 instanceof Data_Ordering.EQ) {
                            var max = maxNode(m.value0);
                            return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, removeMaxNode(new Data_List_Types.Cons(new TwoLeft(max.key, max.value, m.value3), ctx))(m.value0)));
                        };
                        if ($523 instanceof Data_Ordering.LT) {
                            return down(new Data_List_Types.Cons(new TwoLeft(m.value1, m.value2, m.value3), ctx))(k)(m.value0);
                        };
                        return down(new Data_List_Types.Cons(new TwoRight(m.value0, m.value1, m.value2), ctx))(k)(m.value3);
                    };
                    if (m instanceof Three) {
                        var leaves = (function () {
                            if (m.value0 instanceof Leaf && (m.value3 instanceof Leaf && m.value6 instanceof Leaf)) {
                                return true;
                            };
                            return false;
                        })();
                        var $532 = comp(k)(m.value1);
                        var $533 = comp(k)(m.value4);
                        if (leaves && $532 instanceof Data_Ordering.EQ) {
                            return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, fromZipper(dictOrd)(ctx)(new Two(Leaf.value, m.value4, m.value5, Leaf.value))));
                        };
                        if (leaves && $533 instanceof Data_Ordering.EQ) {
                            return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value5, fromZipper(dictOrd)(ctx)(new Two(Leaf.value, m.value1, m.value2, Leaf.value))));
                        };
                        if ($532 instanceof Data_Ordering.EQ) {
                            var max = maxNode(m.value0);
                            return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value2, removeMaxNode(new Data_List_Types.Cons(new ThreeLeft(max.key, max.value, m.value3, m.value4, m.value5, m.value6), ctx))(m.value0)));
                        };
                        if ($533 instanceof Data_Ordering.EQ) {
                            var max = maxNode(m.value3);
                            return new Data_Maybe.Just(new Data_Tuple.Tuple(m.value5, removeMaxNode(new Data_List_Types.Cons(new ThreeMiddle(m.value0, m.value1, m.value2, max.key, max.value, m.value6), ctx))(m.value3)));
                        };
                        if ($532 instanceof Data_Ordering.LT) {
                            return down(new Data_List_Types.Cons(new ThreeLeft(m.value1, m.value2, m.value3, m.value4, m.value5, m.value6), ctx))(k)(m.value0);
                        };
                        if ($532 instanceof Data_Ordering.GT && $533 instanceof Data_Ordering.LT) {
                            return down(new Data_List_Types.Cons(new ThreeMiddle(m.value0, m.value1, m.value2, m.value4, m.value5, m.value6), ctx))(k)(m.value3);
                        };
                        return down(new Data_List_Types.Cons(new ThreeRight(m.value0, m.value1, m.value2, m.value3, m.value4, m.value5), ctx))(k)(m.value6);
                    };
                    throw new Error("Failed pattern match at Data.Map line 293, column 36 - line 316, column 82: " + [ m.constructor.name ]);
                };
            };
        };
    });
    return down(Data_List_Types.Nil.value);
};
var foldableMap = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (m) {
            return Data_Foldable.foldMap(Data_List_Types.foldableList)(dictMonoid)(f)(values(m));
        };
    };
}, function (f) {
    return function (z) {
        return function (m) {
            return Data_Foldable.foldl(Data_List_Types.foldableList)(f)(z)(values(m));
        };
    };
}, function (f) {
    return function (z) {
        return function (m) {
            return Data_Foldable.foldr(Data_List_Types.foldableList)(f)(z)(values(m));
        };
    };
});
var traversableMap = new Data_Traversable.Traversable(function () {
    return foldableMap;
}, function () {
    return functorMap;
}, function (dictApplicative) {
    return Data_Traversable.traverse(traversableMap)(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            if (v instanceof Leaf) {
                return Control_Applicative.pure(dictApplicative)(Leaf.value);
            };
            if (v instanceof Two) {
                return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Two.create)(Data_Traversable.traverse(traversableMap)(dictApplicative)(f)(v.value0)))(Control_Applicative.pure(dictApplicative)(v.value1)))(f(v.value2)))(Data_Traversable.traverse(traversableMap)(dictApplicative)(f)(v.value3));
            };
            if (v instanceof Three) {
                return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Three.create)(Data_Traversable.traverse(traversableMap)(dictApplicative)(f)(v.value0)))(Control_Applicative.pure(dictApplicative)(v.value1)))(f(v.value2)))(Data_Traversable.traverse(traversableMap)(dictApplicative)(f)(v.value3)))(Control_Applicative.pure(dictApplicative)(v.value4)))(f(v.value5)))(Data_Traversable.traverse(traversableMap)(dictApplicative)(f)(v.value6));
            };
            throw new Error("Failed pattern match at Data.Map line 81, column 3 - line 81, column 30: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
});
var findMin = function (v) {
    if (v instanceof Leaf) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Two) {
        return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
            key: v.value1, 
            value: v.value2
        })(findMin(v.value0)));
    };
    if (v instanceof Three) {
        return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
            key: v.value1, 
            value: v.value2
        })(findMin(v.value0)));
    };
    throw new Error("Failed pattern match at Data.Map line 219, column 1 - line 219, column 23: " + [ v.constructor.name ]);
};
var lookupGT = function (dictOrd) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Leaf) {
                return Data_Maybe.Nothing.value;
            };
            if (v1 instanceof Two) {
                var $568 = Data_Ord.compare(dictOrd)(v)(v1.value1);
                if ($568 instanceof Data_Ordering.EQ) {
                    return findMin(v1.value3);
                };
                if ($568 instanceof Data_Ordering.LT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value1, 
                        value: v1.value2
                    })(lookupGT(dictOrd)(v)(v1.value0)));
                };
                if ($568 instanceof Data_Ordering.GT) {
                    return lookupGT(dictOrd)(v)(v1.value3);
                };
                throw new Error("Failed pattern match at Data.Map line 202, column 37 - line 205, column 25: " + [ $568.constructor.name ]);
            };
            if (v1 instanceof Three) {
                var $573 = Data_Ord.compare(dictOrd)(v)(v1.value1);
                if ($573 instanceof Data_Ordering.EQ) {
                    return findMin(new Two(v1.value3, v1.value4, v1.value5, v1.value6));
                };
                if ($573 instanceof Data_Ordering.LT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value1, 
                        value: v1.value2
                    })(lookupGT(dictOrd)(v)(v1.value0)));
                };
                if ($573 instanceof Data_Ordering.GT) {
                    return lookupGT(dictOrd)(v)(new Two(v1.value3, v1.value4, v1.value5, v1.value6));
                };
                throw new Error("Failed pattern match at Data.Map line 206, column 49 - line 209, column 41: " + [ $573.constructor.name ]);
            };
            throw new Error("Failed pattern match at Data.Map line 201, column 1 - line 201, column 26: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var findMax = function (v) {
    if (v instanceof Leaf) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Two) {
        return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
            key: v.value1, 
            value: v.value2
        })(findMax(v.value3)));
    };
    if (v instanceof Three) {
        return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
            key: v.value4, 
            value: v.value5
        })(findMax(v.value6)));
    };
    throw new Error("Failed pattern match at Data.Map line 213, column 1 - line 213, column 23: " + [ v.constructor.name ]);
};
var lookupLT = function (dictOrd) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Leaf) {
                return Data_Maybe.Nothing.value;
            };
            if (v1 instanceof Two) {
                var $595 = Data_Ord.compare(dictOrd)(v)(v1.value1);
                if ($595 instanceof Data_Ordering.EQ) {
                    return findMax(v1.value0);
                };
                if ($595 instanceof Data_Ordering.GT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value1, 
                        value: v1.value2
                    })(lookupLT(dictOrd)(v)(v1.value3)));
                };
                if ($595 instanceof Data_Ordering.LT) {
                    return lookupLT(dictOrd)(v)(v1.value0);
                };
                throw new Error("Failed pattern match at Data.Map line 178, column 37 - line 181, column 24: " + [ $595.constructor.name ]);
            };
            if (v1 instanceof Three) {
                var $600 = Data_Ord.compare(dictOrd)(v)(v1.value4);
                if ($600 instanceof Data_Ordering.EQ) {
                    return findMax(new Two(v1.value0, v1.value1, v1.value2, v1.value3));
                };
                if ($600 instanceof Data_Ordering.GT) {
                    return Data_Maybe.Just.create(Data_Maybe.fromMaybe({
                        key: v1.value4, 
                        value: v1.value5
                    })(lookupLT(dictOrd)(v)(v1.value6)));
                };
                if ($600 instanceof Data_Ordering.LT) {
                    return lookupLT(dictOrd)(v)(new Two(v1.value0, v1.value1, v1.value2, v1.value3));
                };
                throw new Error("Failed pattern match at Data.Map line 182, column 49 - line 185, column 40: " + [ $600.constructor.name ]);
            };
            throw new Error("Failed pattern match at Data.Map line 177, column 1 - line 177, column 26: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var eqMap = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (m1) {
            return function (m2) {
                return Data_Eq.eq(Data_List_Types.eqList(Data_Tuple.eqTuple(dictEq)(dictEq1)))(toList(m1))(toList(m2));
            };
        });
    };
};
var ordMap = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqMap(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
        }, function (m1) {
            return function (m2) {
                return Data_Ord.compare(Data_List_Types.ordList(Data_Tuple.ordTuple(dictOrd)(dictOrd1)))(toList(m1))(toList(m2));
            };
        });
    };
};
var empty = Leaf.value;
var fromFoldable = function (dictOrd) {
    return function (dictFoldable) {
        return Data_Foldable.foldl(dictFoldable)(function (m) {
            return function (v) {
                return insert(dictOrd)(v.value0)(v.value1)(m);
            };
        })(empty);
    };
};
var $$delete = function (dictOrd) {
    return function (k) {
        return function (m) {
            return Data_Maybe.maybe(m)(Data_Tuple.snd)(pop(dictOrd)(k)(m));
        };
    };
};
var checkValid = function (tree) {
    var allHeights = function (v) {
        if (v instanceof Leaf) {
            return Control_Applicative.pure(Data_List_Types.applicativeList)(0);
        };
        if (v instanceof Two) {
            return Data_Functor.map(Data_List_Types.functorList)(function (n) {
                return n + 1 | 0;
            })(Data_Semigroup.append(Data_List_Types.semigroupList)(allHeights(v.value0))(allHeights(v.value3)));
        };
        if (v instanceof Three) {
            return Data_Functor.map(Data_List_Types.functorList)(function (n) {
                return n + 1 | 0;
            })(Data_Semigroup.append(Data_List_Types.semigroupList)(allHeights(v.value0))(Data_Semigroup.append(Data_List_Types.semigroupList)(allHeights(v.value3))(allHeights(v.value6))));
        };
        throw new Error("Failed pattern match at Data.Map line 134, column 3 - line 134, column 30: " + [ v.constructor.name ]);
    };
    return Data_List.length(Data_List.nub(Data_Eq.eqInt)(allHeights(tree))) === 1;
};
var alter = function (dictOrd) {
    return function (f) {
        return function (k) {
            return function (m) {
                var $623 = f(lookup(dictOrd)(k)(m));
                if ($623 instanceof Data_Maybe.Nothing) {
                    return $$delete(dictOrd)(k)(m);
                };
                if ($623 instanceof Data_Maybe.Just) {
                    return insert(dictOrd)(k)($623.value0)(m);
                };
                throw new Error("Failed pattern match at Data.Map line 361, column 15 - line 363, column 25: " + [ $623.constructor.name ]);
            };
        };
    };
};
var fromFoldableWith = function (dictOrd) {
    return function (dictFoldable) {
        return function (f) {
            var combine = function (v) {
                return function (v1) {
                    if (v1 instanceof Data_Maybe.Just) {
                        return Data_Maybe.Just.create(f(v)(v1.value0));
                    };
                    if (v1 instanceof Data_Maybe.Nothing) {
                        return new Data_Maybe.Just(v);
                    };
                    throw new Error("Failed pattern match at Data.Map line 378, column 3 - line 378, column 38: " + [ v.constructor.name, v1.constructor.name ]);
                };
            };
            return Data_Foldable.foldl(dictFoldable)(function (m) {
                return function (v) {
                    return alter(dictOrd)(combine(v.value1))(v.value0)(m);
                };
            })(empty);
        };
    };
};
var unionWith = function (dictOrd) {
    return function (f) {
        return function (m1) {
            return function (m2) {
                var go = function (m) {
                    return function (v) {
                        return alter(dictOrd)(function ($636) {
                            return Data_Maybe.Just.create(Data_Maybe.maybe(v.value1)(f(v.value1))($636));
                        })(v.value0)(m);
                    };
                };
                return Data_Foldable.foldl(Data_List_Types.foldableList)(go)(m2)(toList(m1));
            };
        };
    };
};
var union = function (dictOrd) {
    return unionWith(dictOrd)(Data_Function["const"]);
};
var semigroupMap = function (dictOrd) {
    return new Data_Semigroup.Semigroup(union(dictOrd));
};
var monoidMap = function (dictOrd) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMap(dictOrd);
    }, empty);
};
var unions = function (dictOrd) {
    return function (dictFoldable) {
        return Data_Foldable.foldl(dictFoldable)(union(dictOrd))(empty);
    };
};
var update = function (dictOrd) {
    return function (f) {
        return function (k) {
            return function (m) {
                return alter(dictOrd)(Data_Maybe.maybe(Data_Maybe.Nothing.value)(f))(k)(m);
            };
        };
    };
};
module.exports = {
    alter: alter, 
    checkValid: checkValid, 
    "delete": $$delete, 
    empty: empty, 
    findMax: findMax, 
    findMin: findMin, 
    fromFoldable: fromFoldable, 
    fromFoldableWith: fromFoldableWith, 
    insert: insert, 
    isEmpty: isEmpty, 
    keys: keys, 
    lookup: lookup, 
    lookupGE: lookupGE, 
    lookupGT: lookupGT, 
    lookupLE: lookupLE, 
    lookupLT: lookupLT, 
    mapWithKey: mapWithKey, 
    member: member, 
    pop: pop, 
    showTree: showTree, 
    singleton: singleton, 
    size: size, 
    toList: toList, 
    toUnfoldable: toUnfoldable, 
    union: union, 
    unionWith: unionWith, 
    unions: unions, 
    update: update, 
    values: values, 
    eqMap: eqMap, 
    ordMap: ordMap, 
    showMap: showMap, 
    semigroupMap: semigroupMap, 
    monoidMap: monoidMap, 
    functorMap: functorMap, 
    foldableMap: foldableMap, 
    traversableMap: traversableMap
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Control.Semigroupoid":63,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.List":100,"../Data.List.Types":99,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.Traversable":134,"../Data.Tuple":136,"../Data.Unfoldable":138,"../Partial.Unsafe":145,"../Prelude":148}],102:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var First = function (x) {
    return x;
};
var showFirst = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "First (" + (Data_Show.show(Data_Maybe.showMaybe(dictShow))(v) + ")");
    });
};
var semigroupFirst = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v instanceof Data_Maybe.Just) {
            return v;
        };
        return v1;
    };
});
var ordFirst = function (dictOrd) {
    return Data_Maybe.ordMaybe(dictOrd);
};
var newtypeFirst = new Data_Newtype.Newtype(function (n) {
    return n;
}, First);
var monoidFirst = new Data_Monoid.Monoid(function () {
    return semigroupFirst;
}, Data_Maybe.Nothing.value);
var monadFirst = Data_Maybe.monadMaybe;
var invariantFirst = Data_Maybe.invariantMaybe;
var functorFirst = Data_Maybe.functorMaybe;
var extendFirst = Data_Maybe.extendMaybe;
var eqFirst = function (dictEq) {
    return Data_Maybe.eqMaybe(dictEq);
};
var boundedFirst = function (dictBounded) {
    return Data_Maybe.boundedMaybe(dictBounded);
};
var bindFirst = Data_Maybe.bindMaybe;
var applyFirst = Data_Maybe.applyMaybe;
var applicativeFirst = Data_Maybe.applicativeMaybe;
module.exports = {
    First: First, 
    newtypeFirst: newtypeFirst, 
    eqFirst: eqFirst, 
    ordFirst: ordFirst, 
    boundedFirst: boundedFirst, 
    functorFirst: functorFirst, 
    invariantFirst: invariantFirst, 
    applyFirst: applyFirst, 
    applicativeFirst: applicativeFirst, 
    bindFirst: bindFirst, 
    monadFirst: monadFirst, 
    extendFirst: extendFirst, 
    showFirst: showFirst, 
    semigroupFirst: semigroupFirst, 
    monoidFirst: monoidFirst
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Show":128,"../Prelude":148}],103:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Last = function (x) {
    return x;
};
var showLast = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Last " + (Data_Show.show(Data_Maybe.showMaybe(dictShow))(v) + ")");
    });
};
var semigroupLast = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v1 instanceof Data_Maybe.Just) {
            return v1;
        };
        if (v1 instanceof Data_Maybe.Nothing) {
            return v;
        };
        throw new Error("Failed pattern match at Data.Maybe.Last line 48, column 3 - line 48, column 39: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var ordLast = function (dictOrd) {
    return Data_Maybe.ordMaybe(dictOrd);
};
var newtypeLast = new Data_Newtype.Newtype(function (n) {
    return n;
}, Last);
var monoidLast = new Data_Monoid.Monoid(function () {
    return semigroupLast;
}, Data_Maybe.Nothing.value);
var monadLast = Data_Maybe.monadMaybe;
var invariantLast = Data_Maybe.invariantMaybe;
var functorLast = Data_Maybe.functorMaybe;
var extendLast = Data_Maybe.extendMaybe;
var eqLast = function (dictEq) {
    return Data_Maybe.eqMaybe(dictEq);
};
var boundedLast = function (dictBounded) {
    return Data_Maybe.boundedMaybe(dictBounded);
};
var bindLast = Data_Maybe.bindMaybe;
var applyLast = Data_Maybe.applyMaybe;
var applicativeLast = Data_Maybe.applicativeMaybe;
module.exports = {
    Last: Last, 
    newtypeLast: newtypeLast, 
    eqLast: eqLast, 
    ordLast: ordLast, 
    boundedLast: boundedLast, 
    functorLast: functorLast, 
    invariantLast: invariantLast, 
    applyLast: applyLast, 
    applicativeLast: applicativeLast, 
    bindLast: bindLast, 
    monadLast: monadLast, 
    extendLast: extendLast, 
    showLast: showLast, 
    semigroupLast: semigroupLast, 
    monoidLast: monoidLast
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Show":128,"../Prelude":148}],104:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Extend = require("../Control.Extend");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Bounded = require("../Data.Bounded");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var Nothing = (function () {
    function Nothing() {

    };
    Nothing.value = new Nothing();
    return Nothing;
})();
var Just = (function () {
    function Just(value0) {
        this.value0 = value0;
    };
    Just.create = function (value0) {
        return new Just(value0);
    };
    return Just;
})();
var showMaybe = function (dictShow) {
    return new Data_Show.Show(function (v) {
        if (v instanceof Just) {
            return "(Just " + (Data_Show.show(dictShow)(v.value0) + ")");
        };
        if (v instanceof Nothing) {
            return "Nothing";
        };
        throw new Error("Failed pattern match at Data.Maybe line 202, column 3 - line 203, column 3: " + [ v.constructor.name ]);
    });
};
var semigroupMaybe = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            if (v instanceof Nothing) {
                return v1;
            };
            if (v1 instanceof Nothing) {
                return v;
            };
            if (v instanceof Just && v1 instanceof Just) {
                return new Just(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Maybe line 175, column 3 - line 175, column 23: " + [ v.constructor.name, v1.constructor.name ]);
        };
    });
};
var monoidMaybe = function (dictSemigroup) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMaybe(dictSemigroup);
    }, Nothing.value);
};
var maybe$prime = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Nothing) {
                return v(Data_Unit.unit);
            };
            if (v2 instanceof Just) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 227, column 1 - line 227, column 28: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var maybe = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Nothing) {
                return v;
            };
            if (v2 instanceof Just) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 214, column 1 - line 214, column 22: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var isNothing = maybe(true)(Data_Function["const"](false));
var isJust = maybe(false)(Data_Function["const"](true));
var functorMaybe = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Just) {
            return new Just(v(v1.value0));
        };
        return Nothing.value;
    };
});
var invariantMaybe = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorMaybe));
var fromMaybe$prime = function (a) {
    return maybe$prime(a)(Control_Category.id(Control_Category.categoryFn));
};
var fromMaybe = function (a) {
    return maybe(a)(Control_Category.id(Control_Category.categoryFn));
};
var fromJust = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar33) {
                return $dollar33;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Just) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Maybe line 265, column 1 - line 265, column 21: " + [ v.constructor.name ]);
        })());
    };
};
var extendMaybe = new Control_Extend.Extend(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v1 instanceof Nothing) {
            return Nothing.value;
        };
        return new Just(v(v1));
    };
});
var eqMaybe = function (dictEq) {
    return new Data_Eq.Eq(function (x) {
        return function (y) {
            if (x instanceof Nothing && y instanceof Nothing) {
                return true;
            };
            if (x instanceof Just && y instanceof Just) {
                return Data_Eq.eq(dictEq)(x.value0)(y.value0);
            };
            return false;
        };
    });
};
var ordMaybe = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqMaybe(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (x) {
        return function (y) {
            if (x instanceof Nothing && y instanceof Nothing) {
                return Data_Ordering.EQ.value;
            };
            if (x instanceof Nothing) {
                return Data_Ordering.LT.value;
            };
            if (y instanceof Nothing) {
                return Data_Ordering.GT.value;
            };
            if (x instanceof Just && y instanceof Just) {
                return Data_Ord.compare(dictOrd)(x.value0)(y.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 192, column 1 - line 192, column 51: " + [ x.constructor.name, y.constructor.name ]);
        };
    });
};
var boundedMaybe = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordMaybe(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Nothing.value, new Just(Data_Bounded.top(dictBounded)));
};
var applyMaybe = new Control_Apply.Apply(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Just) {
            return Data_Functor.map(functorMaybe)(v.value0)(v1);
        };
        if (v instanceof Nothing) {
            return Nothing.value;
        };
        throw new Error("Failed pattern match at Data.Maybe line 67, column 3 - line 67, column 31: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindMaybe = new Control_Bind.Bind(function () {
    return applyMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Just) {
            return v1(v.value0);
        };
        if (v instanceof Nothing) {
            return Nothing.value;
        };
        throw new Error("Failed pattern match at Data.Maybe line 126, column 3 - line 126, column 24: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var applicativeMaybe = new Control_Applicative.Applicative(function () {
    return applyMaybe;
}, Just.create);
var monadMaybe = new Control_Monad.Monad(function () {
    return applicativeMaybe;
}, function () {
    return bindMaybe;
});
var altMaybe = new Control_Alt.Alt(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Nothing) {
            return v1;
        };
        return v;
    };
});
var plusMaybe = new Control_Plus.Plus(function () {
    return altMaybe;
}, Nothing.value);
var alternativeMaybe = new Control_Alternative.Alternative(function () {
    return applicativeMaybe;
}, function () {
    return plusMaybe;
});
var monadZeroMaybe = new Control_MonadZero.MonadZero(function () {
    return alternativeMaybe;
}, function () {
    return monadMaybe;
});
module.exports = {
    Nothing: Nothing, 
    Just: Just, 
    fromJust: fromJust, 
    fromMaybe: fromMaybe, 
    "fromMaybe'": fromMaybe$prime, 
    isJust: isJust, 
    isNothing: isNothing, 
    maybe: maybe, 
    "maybe'": maybe$prime, 
    functorMaybe: functorMaybe, 
    applyMaybe: applyMaybe, 
    applicativeMaybe: applicativeMaybe, 
    altMaybe: altMaybe, 
    plusMaybe: plusMaybe, 
    alternativeMaybe: alternativeMaybe, 
    bindMaybe: bindMaybe, 
    monadMaybe: monadMaybe, 
    monadZeroMaybe: monadZeroMaybe, 
    extendMaybe: extendMaybe, 
    invariantMaybe: invariantMaybe, 
    semigroupMaybe: semigroupMaybe, 
    monoidMaybe: monoidMaybe, 
    eqMaybe: eqMaybe, 
    ordMaybe: ordMaybe, 
    boundedMaybe: boundedMaybe, 
    showMaybe: showMaybe
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Extend":24,"../Control.Monad":57,"../Control.MonadZero":59,"../Control.Plus":62,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Function":89,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Monoid":111,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Show":128,"../Data.Unit":140,"../Prelude":148}],105:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Additive = function (x) {
    return x;
};
var showAdditive = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Additive " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupAdditive = function (dictSemiring) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semiring.add(dictSemiring)(v)(v1);
        };
    });
};
var ordAdditive = function (dictOrd) {
    return dictOrd;
};
var newtypeAdditive = new Data_Newtype.Newtype(function (n) {
    return n;
}, Additive);
var monoidAdditive = function (dictSemiring) {
    return new Data_Monoid.Monoid(function () {
        return semigroupAdditive(dictSemiring);
    }, Data_Semiring.zero(dictSemiring));
};
var invariantAdditive = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorAdditive = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendAdditive = new Control_Extend.Extend(function () {
    return functorAdditive;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqAdditive = function (dictEq) {
    return dictEq;
};
var comonadAdditive = new Control_Comonad.Comonad(function () {
    return extendAdditive;
}, Data_Newtype.unwrap(newtypeAdditive));
var boundedAdditive = function (dictBounded) {
    return dictBounded;
};
var applyAdditive = new Control_Apply.Apply(function () {
    return functorAdditive;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindAdditive = new Control_Bind.Bind(function () {
    return applyAdditive;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeAdditive = new Control_Applicative.Applicative(function () {
    return applyAdditive;
}, Additive);
var monadAdditive = new Control_Monad.Monad(function () {
    return applicativeAdditive;
}, function () {
    return bindAdditive;
});
module.exports = {
    Additive: Additive, 
    newtypeAdditive: newtypeAdditive, 
    eqAdditive: eqAdditive, 
    ordAdditive: ordAdditive, 
    boundedAdditive: boundedAdditive, 
    functorAdditive: functorAdditive, 
    invariantAdditive: invariantAdditive, 
    applyAdditive: applyAdditive, 
    applicativeAdditive: applicativeAdditive, 
    bindAdditive: bindAdditive, 
    monadAdditive: monadAdditive, 
    extendAdditive: extendAdditive, 
    comonadAdditive: comonadAdditive, 
    showAdditive: showAdditive, 
    semigroupAdditive: semigroupAdditive, 
    monoidAdditive: monoidAdditive
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Prelude":148}],106:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Conj = function (x) {
    return x;
};
var showConj = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Conj " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringConj = function (dictHeytingAlgebra) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra), Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var semigroupConj = function (dictHeytingAlgebra) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    });
};
var ordConj = function (dictOrd) {
    return dictOrd;
};
var newtypeConj = new Data_Newtype.Newtype(function (n) {
    return n;
}, Conj);
var monoidConj = function (dictHeytingAlgebra) {
    return new Data_Monoid.Monoid(function () {
        return semigroupConj(dictHeytingAlgebra);
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var invariantConj = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorConj = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendConj = new Control_Extend.Extend(function () {
    return functorConj;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqConj = function (dictEq) {
    return dictEq;
};
var comonadConj = new Control_Comonad.Comonad(function () {
    return extendConj;
}, Data_Newtype.unwrap(newtypeConj));
var boundedConj = function (dictBounded) {
    return dictBounded;
};
var applyConj = new Control_Apply.Apply(function () {
    return functorConj;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindConj = new Control_Bind.Bind(function () {
    return applyConj;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeConj = new Control_Applicative.Applicative(function () {
    return applyConj;
}, Conj);
var monadConj = new Control_Monad.Monad(function () {
    return applicativeConj;
}, function () {
    return bindConj;
});
module.exports = {
    Conj: Conj, 
    newtypeConj: newtypeConj, 
    eqConj: eqConj, 
    ordConj: ordConj, 
    boundedConj: boundedConj, 
    functorConj: functorConj, 
    invariantConj: invariantConj, 
    applyConj: applyConj, 
    applicativeConj: applicativeConj, 
    bindConj: bindConj, 
    monadConj: monadConj, 
    extendConj: extendConj, 
    comonadConj: comonadConj, 
    showConj: showConj, 
    semigroupConj: semigroupConj, 
    monoidConj: monoidConj, 
    semiringConj: semiringConj
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.HeytingAlgebra":97,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Prelude":148}],107:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Disj = function (x) {
    return x;
};
var showDisj = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Disj " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringDisj = function (dictHeytingAlgebra) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra), Data_HeytingAlgebra.ff(dictHeytingAlgebra));
};
var semigroupDisj = function (dictHeytingAlgebra) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    });
};
var ordDisj = function (dictOrd) {
    return dictOrd;
};
var newtypeDisj = new Data_Newtype.Newtype(function (n) {
    return n;
}, Disj);
var monoidDisj = function (dictHeytingAlgebra) {
    return new Data_Monoid.Monoid(function () {
        return semigroupDisj(dictHeytingAlgebra);
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra));
};
var invariantDisj = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorDisj = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendDisj = new Control_Extend.Extend(function () {
    return functorDisj;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqDisj = function (dictEq) {
    return dictEq;
};
var comonadDisj = new Control_Comonad.Comonad(function () {
    return extendDisj;
}, Data_Newtype.unwrap(newtypeDisj));
var boundedDisj = function (dictBounded) {
    return dictBounded;
};
var applyDisj = new Control_Apply.Apply(function () {
    return functorDisj;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindDisj = new Control_Bind.Bind(function () {
    return applyDisj;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeDisj = new Control_Applicative.Applicative(function () {
    return applyDisj;
}, Disj);
var monadDisj = new Control_Monad.Monad(function () {
    return applicativeDisj;
}, function () {
    return bindDisj;
});
module.exports = {
    Disj: Disj, 
    newtypeDisj: newtypeDisj, 
    eqDisj: eqDisj, 
    ordDisj: ordDisj, 
    boundedDisj: boundedDisj, 
    functorDisj: functorDisj, 
    invariantDisj: invariantDisj, 
    applyDisj: applyDisj, 
    applicativeDisj: applicativeDisj, 
    bindDisj: bindDisj, 
    monadDisj: monadDisj, 
    extendDisj: extendDisj, 
    comonadDisj: comonadDisj, 
    showDisj: showDisj, 
    semigroupDisj: semigroupDisj, 
    monoidDisj: monoidDisj, 
    semiringDisj: semiringDisj
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.HeytingAlgebra":97,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Prelude":148}],108:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Dual = function (x) {
    return x;
};
var showDual = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Dual " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupDual = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semigroup.append(dictSemigroup)(v1)(v);
        };
    });
};
var ordDual = function (dictOrd) {
    return dictOrd;
};
var newtypeDual = new Data_Newtype.Newtype(function (n) {
    return n;
}, Dual);
var monoidDual = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupDual(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Data_Monoid.mempty(dictMonoid));
};
var invariantDual = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorDual = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendDual = new Control_Extend.Extend(function () {
    return functorDual;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqDual = function (dictEq) {
    return dictEq;
};
var comonadDual = new Control_Comonad.Comonad(function () {
    return extendDual;
}, Data_Newtype.unwrap(newtypeDual));
var boundedDual = function (dictBounded) {
    return dictBounded;
};
var applyDual = new Control_Apply.Apply(function () {
    return functorDual;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindDual = new Control_Bind.Bind(function () {
    return applyDual;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeDual = new Control_Applicative.Applicative(function () {
    return applyDual;
}, Dual);
var monadDual = new Control_Monad.Monad(function () {
    return applicativeDual;
}, function () {
    return bindDual;
});
module.exports = {
    Dual: Dual, 
    newtypeDual: newtypeDual, 
    eqDual: eqDual, 
    ordDual: ordDual, 
    boundedDual: boundedDual, 
    functorDual: functorDual, 
    invariantDual: invariantDual, 
    applyDual: applyDual, 
    applicativeDual: applicativeDual, 
    bindDual: bindDual, 
    monadDual: monadDual, 
    extendDual: extendDual, 
    comonadDual: comonadDual, 
    showDual: showDual, 
    semigroupDual: semigroupDual, 
    monoidDual: monoidDual
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Show":128,"../Prelude":148}],109:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Category = require("../Control.Category");
var Endo = function (x) {
    return x;
};
var semigroupEndo = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        return function ($11) {
            return v(v1($11));
        };
    };
});
var newtypeEndo = new Data_Newtype.Newtype(function (n) {
    return n;
}, Endo);
var monoidEndo = new Data_Monoid.Monoid(function () {
    return semigroupEndo;
}, Control_Category.id(Control_Category.categoryFn));
var invariantEndo = new Data_Functor_Invariant.Invariant(function (ab) {
    return function (ba) {
        return function (v) {
            return function ($12) {
                return ab(v(ba($12)));
            };
        };
    };
});
module.exports = {
    Endo: Endo, 
    newtypeEndo: newtypeEndo, 
    invariantEndo: invariantEndo, 
    semigroupEndo: semigroupEndo, 
    monoidEndo: monoidEndo
};

},{"../Control.Category":20,"../Control.Semigroupoid":63,"../Data.Functor.Invariant":91,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Semigroup":123,"../Prelude":148}],110:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Bounded = require("../Data.Bounded");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Multiplicative = function (x) {
    return x;
};
var showMultiplicative = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Multiplicative " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupMultiplicative = function (dictSemiring) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semiring.mul(dictSemiring)(v)(v1);
        };
    });
};
var ordMultiplicative = function (dictOrd) {
    return dictOrd;
};
var newtypeMultiplicative = new Data_Newtype.Newtype(function (n) {
    return n;
}, Multiplicative);
var monoidMultiplicative = function (dictSemiring) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMultiplicative(dictSemiring);
    }, Data_Semiring.one(dictSemiring));
};
var invariantMultiplicative = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorMultiplicative = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendMultiplicative = new Control_Extend.Extend(function () {
    return functorMultiplicative;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqMultiplicative = function (dictEq) {
    return dictEq;
};
var comonadMultiplicative = new Control_Comonad.Comonad(function () {
    return extendMultiplicative;
}, Data_Newtype.unwrap(newtypeMultiplicative));
var boundedMultiplicative = function (dictBounded) {
    return dictBounded;
};
var applyMultiplicative = new Control_Apply.Apply(function () {
    return functorMultiplicative;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindMultiplicative = new Control_Bind.Bind(function () {
    return applyMultiplicative;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeMultiplicative = new Control_Applicative.Applicative(function () {
    return applyMultiplicative;
}, Multiplicative);
var monadMultiplicative = new Control_Monad.Monad(function () {
    return applicativeMultiplicative;
}, function () {
    return bindMultiplicative;
});
module.exports = {
    Multiplicative: Multiplicative, 
    newtypeMultiplicative: newtypeMultiplicative, 
    eqMultiplicative: eqMultiplicative, 
    ordMultiplicative: ordMultiplicative, 
    boundedMultiplicative: boundedMultiplicative, 
    functorMultiplicative: functorMultiplicative, 
    invariantMultiplicative: invariantMultiplicative, 
    applyMultiplicative: applyMultiplicative, 
    applicativeMultiplicative: applicativeMultiplicative, 
    bindMultiplicative: bindMultiplicative, 
    monadMultiplicative: monadMultiplicative, 
    extendMultiplicative: extendMultiplicative, 
    comonadMultiplicative: comonadMultiplicative, 
    showMultiplicative: showMultiplicative, 
    semigroupMultiplicative: semigroupMultiplicative, 
    monoidMultiplicative: monoidMultiplicative
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Monad":57,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Prelude":148}],111:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Unit = require("../Data.Unit");
var Data_Function = require("../Data.Function");
var Data_Ord = require("../Data.Ord");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Boolean = require("../Data.Boolean");
var Monoid = function (__superclass_Data$dotSemigroup$dotSemigroup_0, mempty) {
    this["__superclass_Data.Semigroup.Semigroup_0"] = __superclass_Data$dotSemigroup$dotSemigroup_0;
    this.mempty = mempty;
};
var monoidUnit = new Monoid(function () {
    return Data_Semigroup.semigroupUnit;
}, Data_Unit.unit);
var monoidString = new Monoid(function () {
    return Data_Semigroup.semigroupString;
}, "");
var monoidArray = new Monoid(function () {
    return Data_Semigroup.semigroupArray;
}, [  ]);
var mempty = function (dict) {
    return dict.mempty;
};
var monoidFn = function (dictMonoid) {
    return new Monoid(function () {
        return Data_Semigroup.semigroupFn(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Data_Function["const"](mempty(dictMonoid)));
};
var power = function (dictMonoid) {
    return function (x) {
        var go = function (p) {
            if (p <= 0) {
                return mempty(dictMonoid);
            };
            if (p === 1) {
                return x;
            };
            if (p % 2 === 0) {
                var x$prime = go(p / 2 | 0);
                return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(x$prime)(x$prime);
            };
            if (Data_Boolean.otherwise) {
                var x$prime = go(p / 2 | 0);
                return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(x$prime)(Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(x$prime)(x));
            };
            throw new Error("Failed pattern match at Data.Monoid line 49, column 3 - line 53, column 57: " + [ p.constructor.name ]);
        };
        return go;
    };
};
module.exports = {
    Monoid: Monoid, 
    mempty: mempty, 
    power: power, 
    monoidUnit: monoidUnit, 
    monoidFn: monoidFn, 
    monoidString: monoidString, 
    monoidArray: monoidArray
};

},{"../Data.Boolean":73,"../Data.Eq":81,"../Data.EuclideanRing":83,"../Data.Function":89,"../Data.Ord":118,"../Data.Semigroup":123,"../Data.Unit":140,"../Prelude":148}],112:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
module.exports = {};

},{}],113:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Functor = require("../Data.Functor");
var Newtype = function (unwrap, wrap) {
    this.unwrap = unwrap;
    this.wrap = wrap;
};
var wrap = function (dict) {
    return dict.wrap;
};
var unwrap = function (dict) {
    return dict.unwrap;
};
var underF = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($34) {
                            return Data_Functor.map(dictFunctor1)(unwrap(dictNewtype1))(f(Data_Functor.map(dictFunctor)(wrap(dictNewtype))($34)));
                        };
                    };
                };
            };
        };
    };
};
var under = function (dictNewtype) {
    return function (dictNewtype1) {
        return function (v) {
            return function (f) {
                return function ($35) {
                    return unwrap(dictNewtype1)(f(wrap(dictNewtype)($35)));
                };
            };
        };
    };
};
var un = function (dictNewtype) {
    return function (v) {
        return unwrap(dictNewtype);
    };
};
var traverse = function (dictFunctor) {
    return function (dictNewtype) {
        return function (v) {
            return function (f) {
                return function ($36) {
                    return Data_Functor.map(dictFunctor)(wrap(dictNewtype))(f(unwrap(dictNewtype)($36)));
                };
            };
        };
    };
};
var overF = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($37) {
                            return Data_Functor.map(dictFunctor1)(wrap(dictNewtype1))(f(Data_Functor.map(dictFunctor)(unwrap(dictNewtype))($37)));
                        };
                    };
                };
            };
        };
    };
};
var over = function (dictNewtype) {
    return function (dictNewtype1) {
        return function (v) {
            return function (f) {
                return function ($38) {
                    return wrap(dictNewtype1)(f(unwrap(dictNewtype)($38)));
                };
            };
        };
    };
};
var op = function (dictNewtype) {
    return un(dictNewtype);
};
var collect = function (dictFunctor) {
    return function (dictNewtype) {
        return function (v) {
            return function (f) {
                return function ($39) {
                    return wrap(dictNewtype)(f(Data_Functor.map(dictFunctor)(unwrap(dictNewtype))($39)));
                };
            };
        };
    };
};
var alaF = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($40) {
                            return Data_Functor.map(dictFunctor1)(unwrap(dictNewtype1))(f(Data_Functor.map(dictFunctor)(wrap(dictNewtype))($40)));
                        };
                    };
                };
            };
        };
    };
};
var ala = function (dictFunctor) {
    return function (dictNewtype) {
        return function (dictNewtype1) {
            return function (v) {
                return function (f) {
                    return Data_Functor.map(dictFunctor)(unwrap(dictNewtype))(f(wrap(dictNewtype1)));
                };
            };
        };
    };
};
module.exports = {
    Newtype: Newtype, 
    ala: ala, 
    alaF: alaF, 
    collect: collect, 
    op: op, 
    over: over, 
    overF: overF, 
    traverse: traverse, 
    un: un, 
    under: under, 
    underF: underF, 
    unwrap: unwrap, 
    wrap: wrap
};

},{"../Control.Semigroupoid":63,"../Data.Functor":93,"../Prelude":148}],114:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Plus = require("../Control.Plus");
var Data_Foldable = require("../Data.Foldable");
var Data_Traversable = require("../Data.Traversable");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Category = require("../Control.Category");
var NonEmpty = (function () {
    function NonEmpty(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    NonEmpty.create = function (value0) {
        return function (value1) {
            return new NonEmpty(value0, value1);
        };
    };
    return NonEmpty;
})();
var tail = function (v) {
    return v.value1;
};
var singleton = function (dictPlus) {
    return function (a) {
        return new NonEmpty(a, Control_Plus.empty(dictPlus));
    };
};
var showNonEmpty = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            return "(NonEmpty " + (Data_Show.show(dictShow)(v.value0) + (" " + (Data_Show.show(dictShow1)(v.value1) + ")")));
        });
    };
};
var oneOf = function (dictAlternative) {
    return function (v) {
        return Control_Alt.alt((dictAlternative["__superclass_Control.Plus.Plus_1"]())["__superclass_Control.Alt.Alt_0"]())(Control_Applicative.pure(dictAlternative["__superclass_Control.Applicative.Applicative_0"]())(v.value0))(v.value1);
    };
};
var head = function (v) {
    return v.value0;
};
var functorNonEmpty = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return new NonEmpty(f(v.value0), Data_Functor.map(dictFunctor)(f)(v.value1));
        };
    });
};
var fromNonEmpty = function (f) {
    return function (v) {
        return f(v.value0)(v.value1);
    };
};
var foldl1 = function (dictFoldable) {
    return function (f) {
        return function (v) {
            return Data_Foldable.foldl(dictFoldable)(f)(v.value0)(v.value1);
        };
    };
};
var foldableNonEmpty = function (dictFoldable) {
    return new Data_Foldable.Foldable(function (dictMonoid) {
        return function (f) {
            return function (v) {
                return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(v.value0))(Data_Foldable.foldMap(dictFoldable)(dictMonoid)(f)(v.value1));
            };
        };
    }, function (f) {
        return function (b) {
            return function (v) {
                return Data_Foldable.foldl(dictFoldable)(f)(f(b)(v.value0))(v.value1);
            };
        };
    }, function (f) {
        return function (b) {
            return function (v) {
                return f(v.value0)(Data_Foldable.foldr(dictFoldable)(f)(b)(v.value1));
            };
        };
    });
};
var traversableNonEmpty = function (dictTraversable) {
    return new Data_Traversable.Traversable(function () {
        return foldableNonEmpty(dictTraversable["__superclass_Data.Foldable.Foldable_1"]());
    }, function () {
        return functorNonEmpty(dictTraversable["__superclass_Data.Functor.Functor_0"]());
    }, function (dictApplicative) {
        return function (v) {
            return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(NonEmpty.create)(v.value0))(Data_Traversable.sequence(dictTraversable)(dictApplicative)(v.value1));
        };
    }, function (dictApplicative) {
        return function (f) {
            return function (v) {
                return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(NonEmpty.create)(f(v.value0)))(Data_Traversable.traverse(dictTraversable)(dictApplicative)(f)(v.value1));
            };
        };
    });
};
var foldMap1 = function (dictSemigroup) {
    return function (dictFoldable) {
        return function (f) {
            return function (v) {
                return Data_Foldable.foldl(dictFoldable)(function (s) {
                    return function (a1) {
                        return Data_Semigroup.append(dictSemigroup)(s)(f(a1));
                    };
                })(f(v.value0))(v.value1);
            };
        };
    };
};
var fold1 = function (dictSemigroup) {
    return function (dictFoldable) {
        return foldMap1(dictSemigroup)(dictFoldable)(Control_Category.id(Control_Category.categoryFn));
    };
};
var eqNonEmpty = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (x) {
            return function (y) {
                return Data_Eq.eq(dictEq)(x.value0)(y.value0) && Data_Eq.eq(dictEq1)(x.value1)(y.value1);
            };
        });
    };
};
var ordNonEmpty = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqNonEmpty(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
        }, function (x) {
            return function (y) {
                var $101 = Data_Ord.compare(dictOrd)(x.value0)(y.value0);
                if ($101 instanceof Data_Ordering.LT) {
                    return Data_Ordering.LT.value;
                };
                if ($101 instanceof Data_Ordering.GT) {
                    return Data_Ordering.GT.value;
                };
                return Data_Ord.compare(dictOrd1)(x.value1)(y.value1);
            };
        });
    };
};
module.exports = {
    NonEmpty: NonEmpty, 
    fold1: fold1, 
    foldMap1: foldMap1, 
    foldl1: foldl1, 
    fromNonEmpty: fromNonEmpty, 
    head: head, 
    oneOf: oneOf, 
    singleton: singleton, 
    tail: tail, 
    showNonEmpty: showNonEmpty, 
    eqNonEmpty: eqNonEmpty, 
    ordNonEmpty: ordNonEmpty, 
    functorNonEmpty: functorNonEmpty, 
    foldableNonEmpty: foldableNonEmpty, 
    traversableNonEmpty: traversableNonEmpty
};

},{"../Control.Alt":11,"../Control.Alternative":12,"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Control.Plus":62,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Show":128,"../Data.Traversable":134,"../Prelude":148}],115:[function(require,module,exports){
"use strict";

exports.unsafeCompareImpl = function (lt) {
  return function (eq) {
    return function (gt) {
      return function (x) {
        return function (y) {
          return x < y ? lt : x === y ? eq : gt;
        };
      };
    };
  };
};

},{}],116:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Ordering = require("../Data.Ordering");
var unsafeCompare = $foreign.unsafeCompareImpl(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
module.exports = {
    unsafeCompare: unsafeCompare
};

},{"../Data.Ordering":119,"./foreign":115}],117:[function(require,module,exports){
"use strict";

exports.ordArrayImpl = function (f) {
  return function (xs) {
    return function (ys) {
      var i = 0;
      var xlen = xs.length;
      var ylen = ys.length;
      while (i < xlen && i < ylen) {
        var x = xs[i];
        var y = ys[i];
        var o = f(x)(y);
        if (o !== 0) {
          return o;
        }
        i++;
      }
      if (xlen === ylen) {
        return 0;
      } else if (xlen > ylen) {
        return -1;
      } else {
        return 1;
      }
    };
  };
};

},{}],118:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Ord_Unsafe = require("../Data.Ord.Unsafe");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Data_Semiring = require("../Data.Semiring");
var Ord = function (__superclass_Data$dotEq$dotEq_0, compare) {
    this["__superclass_Data.Eq.Eq_0"] = __superclass_Data$dotEq$dotEq_0;
    this.compare = compare;
};
var ordVoid = new Ord(function () {
    return Data_Eq.eqVoid;
}, function (v) {
    return function (v1) {
        return Data_Ordering.EQ.value;
    };
});
var ordUnit = new Ord(function () {
    return Data_Eq.eqUnit;
}, function (v) {
    return function (v1) {
        return Data_Ordering.EQ.value;
    };
});
var ordString = new Ord(function () {
    return Data_Eq.eqString;
}, Data_Ord_Unsafe.unsafeCompare);
var ordOrdering = new Ord(function () {
    return Data_Ordering.eqOrdering;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Ordering.LT && v1 instanceof Data_Ordering.LT) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.EQ) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.GT && v1 instanceof Data_Ordering.GT) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.LT) {
            return Data_Ordering.LT.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.LT) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.GT) {
            return Data_Ordering.LT.value;
        };
        if (v instanceof Data_Ordering.GT) {
            return Data_Ordering.GT.value;
        };
        throw new Error("Failed pattern match at Data.Ord line 68, column 3 - line 68, column 21: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var ordNumber = new Ord(function () {
    return Data_Eq.eqNumber;
}, Data_Ord_Unsafe.unsafeCompare);
var ordInt = new Ord(function () {
    return Data_Eq.eqInt;
}, Data_Ord_Unsafe.unsafeCompare);
var ordChar = new Ord(function () {
    return Data_Eq.eqChar;
}, Data_Ord_Unsafe.unsafeCompare);
var ordBoolean = new Ord(function () {
    return Data_Eq.eqBoolean;
}, Data_Ord_Unsafe.unsafeCompare);
var compare = function (dict) {
    return dict.compare;
};
var comparing = function (dictOrd) {
    return function (f) {
        return Data_Function.on(compare(dictOrd))(f);
    };
};
var greaterThan = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $22 = compare(dictOrd)(a1)(a2);
            if ($22 instanceof Data_Ordering.GT) {
                return true;
            };
            return false;
        };
    };
};
var greaterThanOrEq = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $23 = compare(dictOrd)(a1)(a2);
            if ($23 instanceof Data_Ordering.LT) {
                return false;
            };
            return true;
        };
    };
};
var signum = function (dictOrd) {
    return function (dictRing) {
        return function (x) {
            var $24 = greaterThanOrEq(dictOrd)(x)(Data_Semiring.zero(dictRing["__superclass_Data.Semiring.Semiring_0"]()));
            if ($24) {
                return Data_Semiring.one(dictRing["__superclass_Data.Semiring.Semiring_0"]());
            };
            if (!$24) {
                return Data_Ring.negate(dictRing)(Data_Semiring.one(dictRing["__superclass_Data.Semiring.Semiring_0"]()));
            };
            throw new Error("Failed pattern match at Data.Ord line 163, column 12 - line 163, column 46: " + [ $24.constructor.name ]);
        };
    };
};
var lessThan = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $25 = compare(dictOrd)(a1)(a2);
            if ($25 instanceof Data_Ordering.LT) {
                return true;
            };
            return false;
        };
    };
};
var lessThanOrEq = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $26 = compare(dictOrd)(a1)(a2);
            if ($26 instanceof Data_Ordering.GT) {
                return false;
            };
            return true;
        };
    };
};
var max = function (dictOrd) {
    return function (x) {
        return function (y) {
            var $27 = compare(dictOrd)(x)(y);
            if ($27 instanceof Data_Ordering.LT) {
                return y;
            };
            if ($27 instanceof Data_Ordering.EQ) {
                return x;
            };
            if ($27 instanceof Data_Ordering.GT) {
                return x;
            };
            throw new Error("Failed pattern match at Data.Ord line 122, column 3 - line 125, column 12: " + [ $27.constructor.name ]);
        };
    };
};
var min = function (dictOrd) {
    return function (x) {
        return function (y) {
            var $28 = compare(dictOrd)(x)(y);
            if ($28 instanceof Data_Ordering.LT) {
                return x;
            };
            if ($28 instanceof Data_Ordering.EQ) {
                return x;
            };
            if ($28 instanceof Data_Ordering.GT) {
                return y;
            };
            throw new Error("Failed pattern match at Data.Ord line 113, column 3 - line 116, column 12: " + [ $28.constructor.name ]);
        };
    };
};
var ordArray = function (dictOrd) {
    return new Ord(function () {
        return Data_Eq.eqArray(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, (function () {
        var toDelta = function (x) {
            return function (y) {
                var $29 = compare(dictOrd)(x)(y);
                if ($29 instanceof Data_Ordering.EQ) {
                    return 0;
                };
                if ($29 instanceof Data_Ordering.LT) {
                    return 1;
                };
                if ($29 instanceof Data_Ordering.GT) {
                    return -1;
                };
                throw new Error("Failed pattern match at Data.Ord line 60, column 7 - line 65, column 1: " + [ $29.constructor.name ]);
            };
        };
        return function (xs) {
            return function (ys) {
                return compare(ordInt)(0)($foreign.ordArrayImpl(toDelta)(xs)(ys));
            };
        };
    })());
};
var clamp = function (dictOrd) {
    return function (low) {
        return function (hi) {
            return function (x) {
                return min(dictOrd)(hi)(max(dictOrd)(low)(x));
            };
        };
    };
};
var between = function (dictOrd) {
    return function (low) {
        return function (hi) {
            return function (x) {
                if (lessThan(dictOrd)(x)(low)) {
                    return false;
                };
                if (greaterThan(dictOrd)(x)(hi)) {
                    return false;
                };
                if (true) {
                    return true;
                };
                throw new Error("Failed pattern match at Data.Ord line 150, column 1 - line 153, column 16: " + [ low.constructor.name, hi.constructor.name, x.constructor.name ]);
            };
        };
    };
};
var abs = function (dictOrd) {
    return function (dictRing) {
        return function (x) {
            var $33 = greaterThanOrEq(dictOrd)(x)(Data_Semiring.zero(dictRing["__superclass_Data.Semiring.Semiring_0"]()));
            if ($33) {
                return x;
            };
            if (!$33) {
                return Data_Ring.negate(dictRing)(x);
            };
            throw new Error("Failed pattern match at Data.Ord line 158, column 9 - line 158, column 42: " + [ $33.constructor.name ]);
        };
    };
};
module.exports = {
    Ord: Ord, 
    abs: abs, 
    between: between, 
    clamp: clamp, 
    compare: compare, 
    comparing: comparing, 
    greaterThan: greaterThan, 
    greaterThanOrEq: greaterThanOrEq, 
    lessThan: lessThan, 
    lessThanOrEq: lessThanOrEq, 
    max: max, 
    min: min, 
    signum: signum, 
    ordBoolean: ordBoolean, 
    ordInt: ordInt, 
    ordNumber: ordNumber, 
    ordString: ordString, 
    ordChar: ordChar, 
    ordUnit: ordUnit, 
    ordVoid: ordVoid, 
    ordArray: ordArray, 
    ordOrdering: ordOrdering
};

},{"../Data.Eq":81,"../Data.Function":89,"../Data.Ord.Unsafe":116,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semiring":125,"../Data.Unit":140,"../Data.Void":141,"./foreign":117}],119:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Eq = require("../Data.Eq");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var LT = (function () {
    function LT() {

    };
    LT.value = new LT();
    return LT;
})();
var GT = (function () {
    function GT() {

    };
    GT.value = new GT();
    return GT;
})();
var EQ = (function () {
    function EQ() {

    };
    EQ.value = new EQ();
    return EQ;
})();
var showOrdering = new Data_Show.Show(function (v) {
    if (v instanceof LT) {
        return "LT";
    };
    if (v instanceof GT) {
        return "GT";
    };
    if (v instanceof EQ) {
        return "EQ";
    };
    throw new Error("Failed pattern match at Data.Ordering line 27, column 3 - line 28, column 3: " + [ v.constructor.name ]);
});
var semigroupOrdering = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v instanceof LT) {
            return LT.value;
        };
        if (v instanceof GT) {
            return GT.value;
        };
        if (v instanceof EQ) {
            return v1;
        };
        throw new Error("Failed pattern match at Data.Ordering line 22, column 3 - line 22, column 19: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var invert = function (v) {
    if (v instanceof GT) {
        return LT.value;
    };
    if (v instanceof EQ) {
        return EQ.value;
    };
    if (v instanceof LT) {
        return GT.value;
    };
    throw new Error("Failed pattern match at Data.Ordering line 34, column 1 - line 34, column 15: " + [ v.constructor.name ]);
};
var eqOrdering = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof LT && v1 instanceof LT) {
            return true;
        };
        if (v instanceof GT && v1 instanceof GT) {
            return true;
        };
        if (v instanceof EQ && v1 instanceof EQ) {
            return true;
        };
        return false;
    };
});
module.exports = {
    LT: LT, 
    GT: GT, 
    EQ: EQ, 
    invert: invert, 
    eqOrdering: eqOrdering, 
    semigroupOrdering: semigroupOrdering, 
    showOrdering: showOrdering
};

},{"../Data.Eq":81,"../Data.Semigroup":123,"../Data.Show":128}],120:[function(require,module,exports){
"use strict";

exports.intSub = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x - y | 0;
  };
};

exports.numSub = function (n1) {
  return function (n2) {
    return n1 - n2;
  };
};

},{}],121:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Ring = function (__superclass_Data$dotSemiring$dotSemiring_0, sub) {
    this["__superclass_Data.Semiring.Semiring_0"] = __superclass_Data$dotSemiring$dotSemiring_0;
    this.sub = sub;
};
var sub = function (dict) {
    return dict.sub;
};
var ringUnit = new Ring(function () {
    return Data_Semiring.semiringUnit;
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var ringNumber = new Ring(function () {
    return Data_Semiring.semiringNumber;
}, $foreign.numSub);
var ringInt = new Ring(function () {
    return Data_Semiring.semiringInt;
}, $foreign.intSub);
var negate = function (dictRing) {
    return function (a) {
        return sub(dictRing)(Data_Semiring.zero(dictRing["__superclass_Data.Semiring.Semiring_0"]()))(a);
    };
};
module.exports = {
    Ring: Ring, 
    negate: negate, 
    sub: sub, 
    ringInt: ringInt, 
    ringNumber: ringNumber, 
    ringUnit: ringUnit
};

},{"../Data.Semiring":125,"../Data.Unit":140,"./foreign":120}],122:[function(require,module,exports){
"use strict";

exports.concatString = function (s1) {
  return function (s2) {
    return s1 + s2;
  };
};

exports.concatArray = function (xs) {
  return function (ys) {
    if (xs.length === 0) return ys;
    if (ys.length === 0) return xs;
    return xs.concat(ys);
  };
};

},{}],123:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Semigroup = function (append) {
    this.append = append;
};
var semigroupVoid = new Semigroup(function (v) {
    return Data_Void.absurd;
});
var semigroupUnit = new Semigroup(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var semigroupString = new Semigroup($foreign.concatString);
var semigroupArray = new Semigroup($foreign.concatArray);
var append = function (dict) {
    return dict.append;
};
var semigroupFn = function (dictSemigroup) {
    return new Semigroup(function (f) {
        return function (g) {
            return function (x) {
                return append(dictSemigroup)(f(x))(g(x));
            };
        };
    });
};
module.exports = {
    Semigroup: Semigroup, 
    append: append, 
    semigroupString: semigroupString, 
    semigroupUnit: semigroupUnit, 
    semigroupVoid: semigroupVoid, 
    semigroupFn: semigroupFn, 
    semigroupArray: semigroupArray
};

},{"../Data.Unit":140,"../Data.Void":141,"./foreign":122}],124:[function(require,module,exports){
"use strict";

exports.intAdd = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x + y | 0;
  };
};

exports.intMul = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x * y | 0;
  };
};

exports.numAdd = function (n1) {
  return function (n2) {
    return n1 + n2;
  };
};

exports.numMul = function (n1) {
  return function (n2) {
    return n1 * n2;
  };
};

},{}],125:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Semiring = function (add, mul, one, zero) {
    this.add = add;
    this.mul = mul;
    this.one = one;
    this.zero = zero;
};
var zero = function (dict) {
    return dict.zero;
};
var semiringUnit = new Semiring(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, Data_Unit.unit, Data_Unit.unit);
var semiringNumber = new Semiring($foreign.numAdd, $foreign.numMul, 1.0, 0.0);
var semiringInt = new Semiring($foreign.intAdd, $foreign.intMul, 1, 0);
var one = function (dict) {
    return dict.one;
};
var mul = function (dict) {
    return dict.mul;
};
var add = function (dict) {
    return dict.add;
};
module.exports = {
    Semiring: Semiring, 
    add: add, 
    mul: mul, 
    one: one, 
    zero: zero, 
    semiringInt: semiringInt, 
    semiringNumber: semiringNumber, 
    semiringUnit: semiringUnit
};

},{"../Data.Unit":140,"./foreign":124}],126:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_ST = require("../Control.Monad.ST");
var Data_Array = require("../Data.Array");
var Data_Array_ST = require("../Data.Array.ST");
var Data_Foldable = require("../Data.Foldable");
var Data_List = require("../Data.List");
var Data_Map = require("../Data.Map");
var Data_Monoid = require("../Data.Monoid");
var Data_Unfoldable = require("../Data.Unfoldable");
var Partial_Unsafe = require("../Partial.Unsafe");
var Data_Eq = require("../Data.Eq");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Ord = require("../Data.Ord");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Unit = require("../Data.Unit");
var Data_List_Types = require("../Data.List.Types");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ordering = require("../Data.Ordering");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Control_Applicative = require("../Control.Applicative");
var Data_Semiring = require("../Data.Semiring");
var $$Set = (function () {
    function $$Set(value0) {
        this.value0 = value0;
    };
    $$Set.create = function (value0) {
        return new $$Set(value0);
    };
    return $$Set;
})();
var union = function (dictOrd) {
    return function (v) {
        return function (v1) {
            return new $$Set(Data_Map.union(dictOrd)(v.value0)(v1.value0));
        };
    };
};
var toList = function (v) {
    return Data_Map.keys(v.value0);
};
var toUnfoldable = function (dictUnfoldable) {
    return function ($59) {
        return Data_List.toUnfoldable(dictUnfoldable)(toList($59));
    };
};
var size = function (v) {
    return Data_Map.size(v.value0);
};
var singleton = function (a) {
    return new $$Set(Data_Map.singleton(a)(Data_Unit.unit));
};
var showSet = function (dictShow) {
    return new Data_Show.Show(function (s) {
        return "(fromFoldable " + (Data_Show.show(Data_List_Types.showList(dictShow))(toList(s)) + ")");
    });
};
var semigroupSet = function (dictOrd) {
    return new Data_Semigroup.Semigroup(union(dictOrd));
};
var member = function (dictOrd) {
    return function (a) {
        return function (v) {
            return Data_Map.member(dictOrd)(a)(v.value0);
        };
    };
};
var isEmpty = function (v) {
    return Data_Map.isEmpty(v.value0);
};
var insert = function (dictOrd) {
    return function (a) {
        return function (v) {
            return new $$Set(Data_Map.insert(dictOrd)(a)(Data_Unit.unit)(v.value0));
        };
    };
};
var foldableSet = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function ($60) {
            return Data_Foldable.foldMap(Data_List_Types.foldableList)(dictMonoid)(f)(toList($60));
        };
    };
}, function (f) {
    return function (x) {
        return function ($61) {
            return Data_Foldable.foldl(Data_List_Types.foldableList)(f)(x)(toList($61));
        };
    };
}, function (f) {
    return function (x) {
        return function ($62) {
            return Data_Foldable.foldr(Data_List_Types.foldableList)(f)(x)(toList($62));
        };
    };
});
var eqSet = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(Data_Map.eqMap(dictEq)(Data_Eq.eqUnit))(v.value0)(v1.value0);
        };
    });
};
var ordSet = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqSet(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (s1) {
        return function (s2) {
            return Data_Ord.compare(Data_List_Types.ordList(dictOrd))(toList(s1))(toList(s2));
        };
    });
};
var empty = new $$Set(Data_Map.empty);
var fromFoldable = function (dictFoldable) {
    return function (dictOrd) {
        return Data_Foldable.foldl(dictFoldable)(function (m) {
            return function (a) {
                return insert(dictOrd)(a)(m);
            };
        })(empty);
    };
};
var intersection = function (dictOrd) {
    return function (s1) {
        return function (s2) {
            var toArray = function ($63) {
                return Data_Array.fromFoldable(Data_List_Types.foldableList)(toList($63));
            };
            var rs = toArray(s2);
            var rl = Data_Array.length(rs);
            var ls = toArray(s1);
            var ll = Data_Array.length(ls);
            var intersect = function (acc) {
                var go = Partial_Unsafe.unsafePartial(function (dictPartial) {
                    return function (l) {
                        return function (r) {
                            var $52 = l < ll && r < rl;
                            if ($52) {
                                var $53 = Data_Ord.compare(dictOrd)(ls[l])(rs[r]);
                                if ($53 instanceof Data_Ordering.EQ) {
                                    return function __do() {
                                        Data_Array_ST.pushSTArray(acc)(ls[l])();
                                        return new Control_Monad_Rec_Class.Loop({
                                            a: l + 1 | 0, 
                                            b: r + 1 | 0
                                        });
                                    };
                                };
                                if ($53 instanceof Data_Ordering.LT) {
                                    return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(new Control_Monad_Rec_Class.Loop({
                                        a: l + 1 | 0, 
                                        b: r
                                    }));
                                };
                                if ($53 instanceof Data_Ordering.GT) {
                                    return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(new Control_Monad_Rec_Class.Loop({
                                        a: l, 
                                        b: r + 1 | 0
                                    }));
                                };
                                throw new Error("Failed pattern match at Data.Set line 158, column 12 - line 163, column 43: " + [ $53.constructor.name ]);
                            };
                            if (!$52) {
                                return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(new Control_Monad_Rec_Class.Done(acc));
                            };
                            throw new Error("Failed pattern match at Data.Set line 157, column 7 - line 164, column 24: " + [ $52.constructor.name ]);
                        };
                    };
                });
                return Control_Monad_Rec_Class.tailRecM2(Control_Monad_Rec_Class.monadRecEff)(go)(0)(0);
            };
            return fromFoldable(Data_Foldable.foldableArray)(dictOrd)(Control_Monad_Eff.runPure(Data_Array_ST.runSTArray(Control_Bind.bind(Control_Monad_Eff.bindEff)(Data_Array_ST.emptySTArray)(intersect))));
        };
    };
};
var map = function (dictOrd) {
    return function (f) {
        return Data_Foldable.foldl(foldableSet)(function (m) {
            return function (a) {
                return insert(dictOrd)(f(a))(m);
            };
        })(empty);
    };
};
var monoidSet = function (dictOrd) {
    return new Data_Monoid.Monoid(function () {
        return semigroupSet(dictOrd);
    }, empty);
};
var unions = function (dictFoldable) {
    return function (dictOrd) {
        return Data_Foldable.foldl(dictFoldable)(union(dictOrd))(empty);
    };
};
var $$delete = function (dictOrd) {
    return function (a) {
        return function (v) {
            return new $$Set(Data_Map["delete"](dictOrd)(a)(v.value0));
        };
    };
};
var difference = function (dictOrd) {
    return function (s1) {
        return function (s2) {
            return Data_Foldable.foldl(Data_List_Types.foldableList)(Data_Function.flip($$delete(dictOrd)))(s1)(toList(s2));
        };
    };
};
var subset = function (dictOrd) {
    return function (s1) {
        return function (s2) {
            return isEmpty(difference(dictOrd)(s1)(s2));
        };
    };
};
var properSubset = function (dictOrd) {
    return function (s1) {
        return function (s2) {
            return subset(dictOrd)(s1)(s2) && Data_Eq.notEq(eqSet(dictOrd["__superclass_Data.Eq.Eq_0"]()))(s1)(s2);
        };
    };
};
var checkValid = function (v) {
    return Data_Map.checkValid(v.value0);
};
module.exports = {
    checkValid: checkValid, 
    "delete": $$delete, 
    difference: difference, 
    empty: empty, 
    fromFoldable: fromFoldable, 
    insert: insert, 
    intersection: intersection, 
    isEmpty: isEmpty, 
    map: map, 
    member: member, 
    properSubset: properSubset, 
    singleton: singleton, 
    size: size, 
    subset: subset, 
    toUnfoldable: toUnfoldable, 
    union: union, 
    unions: unions, 
    eqSet: eqSet, 
    showSet: showSet, 
    ordSet: ordSet, 
    monoidSet: monoidSet, 
    semigroupSet: semigroupSet, 
    foldableSet: foldableSet
};

},{"../Control.Applicative":13,"../Control.Bind":19,"../Control.Monad.Eff":44,"../Control.Monad.Rec.Class":50,"../Control.Monad.ST":52,"../Control.Semigroupoid":63,"../Data.Array":69,"../Data.Array.ST":67,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.HeytingAlgebra":97,"../Data.List":100,"../Data.List.Types":99,"../Data.Map":101,"../Data.Monoid":111,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.Unfoldable":138,"../Data.Unit":140,"../Partial.Unsafe":145,"../Prelude":148}],127:[function(require,module,exports){
"use strict";

exports.showIntImpl = function (n) {
  return n.toString();
};

exports.showNumberImpl = function (n) {
  var str = n.toString();
  return isNaN(str + ".0") ? str : str + ".0";
};

exports.showCharImpl = function (c) {
  var code = c.charCodeAt(0);
  if (code < 0x20 || code === 0x7F) {
    switch (c) {
      case "\x07": return "'\\a'";
      case "\b": return "'\\b'";
      case "\f": return "'\\f'";
      case "\n": return "'\\n'";
      case "\r": return "'\\r'";
      case "\t": return "'\\t'";
      case "\v": return "'\\v'";
    }
    return "'\\" + code.toString(10) + "'";
  }
  return c === "'" || c === "\\" ? "'\\" + c + "'" : "'" + c + "'";
};

exports.showStringImpl = function (s) {
  var l = s.length;
  return "\"" + s.replace(
    /[\0-\x1F\x7F"\\]/g,
    function (c, i) { // jshint ignore:line
      switch (c) {
        case "\"":
        case "\\":
          return "\\" + c;
        case "\x07": return "\\a";
        case "\b": return "\\b";
        case "\f": return "\\f";
        case "\n": return "\\n";
        case "\r": return "\\r";
        case "\t": return "\\t";
        case "\v": return "\\v";
      }
      var k = i + 1;
      var empty = k < l && s[k] >= "0" && s[k] <= "9" ? "\\&" : "";
      return "\\" + c.charCodeAt(0).toString(10) + empty;
    }
  ) + "\"";
};

exports.showArrayImpl = function (f) {
  return function (xs) {
    var ss = [];
    for (var i = 0, l = xs.length; i < l; i++) {
      ss[i] = f(xs[i]);
    }
    return "[" + ss.join(",") + "]";
  };
};

},{}],128:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Show = function (show) {
    this.show = show;
};
var showString = new Show($foreign.showStringImpl);
var showNumber = new Show($foreign.showNumberImpl);
var showInt = new Show($foreign.showIntImpl);
var showChar = new Show($foreign.showCharImpl);
var showBoolean = new Show(function (v) {
    if (v) {
        return "true";
    };
    if (!v) {
        return "false";
    };
    throw new Error("Failed pattern match at Data.Show line 13, column 3 - line 14, column 3: " + [ v.constructor.name ]);
});
var show = function (dict) {
    return dict.show;
};
var showArray = function (dictShow) {
    return new Show($foreign.showArrayImpl(show(dictShow)));
};
module.exports = {
    Show: Show, 
    show: show, 
    showBoolean: showBoolean, 
    showInt: showInt, 
    showNumber: showNumber, 
    showChar: showChar, 
    showString: showString, 
    showArray: showArray
};

},{"./foreign":127}],129:[function(require,module,exports){
"use strict";

exports.charCodeAt = function (i) {
  return function (s) {
    if (i >= 0 && i < s.length) return s.charCodeAt(i);
    throw new Error("Data.String.Unsafe.charCodeAt: Invalid index.");
  };
};

exports.charAt = function (i) {
  return function (s) {
    if (i >= 0 && i < s.length) return s.charAt(i);
    throw new Error("Data.String.Unsafe.charAt: Invalid index.");
  };
};

exports.char = function (s) {
  if (s.length === 1) return s.charAt(0);
  throw new Error("Data.String.Unsafe.char: Expected string of length 1.");
};

},{}],130:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
module.exports = {
    "char": $foreign["char"], 
    charAt: $foreign.charAt, 
    charCodeAt: $foreign.charCodeAt
};

},{"./foreign":129}],131:[function(require,module,exports){
"use strict";

exports._charAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ? just(s.charAt(i)) : nothing;
      };
    };
  };
};

exports.singleton = function (c) {
  return c;
};

exports._charCodeAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ? just(s.charCodeAt(i)) : nothing;
      };
    };
  };
};

exports._toChar = function (just) {
  return function (nothing) {
    return function (s) {
      return s.length === 1 ? just(s) : nothing;
    };
  };
};

exports.fromCharArray = function (a) {
  return a.join("");
};

exports._indexOf = function (just) {
  return function (nothing) {
    return function (x) {
      return function (s) {
        var i = s.indexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};

exports["_indexOf'"] = function (just) {
  return function (nothing) {
    return function (x) {
      return function (startAt) {
        return function (s) {
          if (startAt < 0 || startAt > s.length) return nothing;
          var i = s.indexOf(x, startAt);
          return i === -1 ? nothing : just(i);
        };
      };
    };
  };
};

exports._lastIndexOf = function (just) {
  return function (nothing) {
    return function (x) {
      return function (s) {
        var i = s.lastIndexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};

exports["_lastIndexOf'"] = function (just) {
  return function (nothing) {
    return function (x) {
      return function (startAt) {
        return function (s) {
          if (startAt < 0 || startAt > s.length) return nothing;
          var i = s.lastIndexOf(x, startAt);
          return i === -1 ? nothing : just(i);
        };
      };
    };
  };
};

exports.length = function (s) {
  return s.length;
};

exports._localeCompare = function (lt) {
  return function (eq) {
    return function (gt) {
      return function (s1) {
        return function (s2) {
          var result = s1.localeCompare(s2);
          return result < 0 ? lt : result > 0 ? gt : eq;
        };
      };
    };
  };
};

exports.replace = function (s1) {
  return function (s2) {
    return function (s3) {
      return s3.replace(s1, s2);
    };
  };
};

exports.replaceAll = function (s1) {
  return function (s2) {
    return function (s3) {
      return s3.replace(new RegExp(s1.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"), s2);
    };
  };
};

exports.take = function (n) {
  return function (s) {
    return s.substr(0, n);
  };
};

exports.drop = function (n) {
  return function (s) {
    return s.substring(n);
  };
};

exports.count = function (p) {
  return function (s) {
    for (var i = 0; i < s.length && p(s.charAt(i)); i++); {}
    return i;
  };
};

exports.split = function (sep) {
  return function (s) {
    return s.split(sep);
  };
};

exports._splitAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ?
               just([s.substring(0, i), s.substring(i)]) : nothing;
      };
    };
  };
};

exports.toCharArray = function (s) {
  return s.split("");
};

exports.toLower = function (s) {
  return s.toLowerCase();
};

exports.toUpper = function (s) {
  return s.toUpperCase();
};

exports.trim = function (s) {
  return s.trim();
};

exports.joinWith = function (s) {
  return function (xs) {
    return xs.join(s);
  };
};

},{}],132:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Data_Maybe = require("../Data.Maybe");
var Data_Newtype = require("../Data.Newtype");
var Data_String_Unsafe = require("../Data.String.Unsafe");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Function = require("../Data.Function");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Replacement = function (x) {
    return x;
};
var Pattern = function (x) {
    return x;
};
var uncons = function (v) {
    if (v === "") {
        return Data_Maybe.Nothing.value;
    };
    return new Data_Maybe.Just({
        head: Data_String_Unsafe.charAt(0)(v), 
        tail: $foreign.drop(1)(v)
    });
};
var toChar = $foreign._toChar(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var takeWhile = function (p) {
    return function (s) {
        return $foreign.take($foreign.count(p)(s))(s);
    };
};
var splitAt = $foreign._splitAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var showReplacement = new Data_Show.Show(function (v) {
    return "(Replacement " + (v + ")");
});
var showPattern = new Data_Show.Show(function (v) {
    return "(Pattern " + (v + ")");
});
var $$null = function (s) {
    return s === "";
};
var newtypeReplacement = new Data_Newtype.Newtype(function (n) {
    return n;
}, Replacement);
var newtypePattern = new Data_Newtype.Newtype(function (n) {
    return n;
}, Pattern);
var localeCompare = $foreign._localeCompare(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
var lastIndexOf$prime = $foreign["_lastIndexOf'"](Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var lastIndexOf = $foreign._lastIndexOf(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var stripSuffix = function (v) {
    return function (str) {
        var $32 = lastIndexOf(v)(str);
        if ($32 instanceof Data_Maybe.Just && $32.value0 === $foreign.length(str) - $foreign.length(v)) {
            return Data_Maybe.Just.create($foreign.take($32.value0)(str));
        };
        return Data_Maybe.Nothing.value;
    };
};
var indexOf$prime = $foreign["_indexOf'"](Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var indexOf = $foreign._indexOf(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var stripPrefix = function (v) {
    return function (str) {
        var $36 = indexOf(v)(str);
        if ($36 instanceof Data_Maybe.Just && $36.value0 === 0) {
            return Data_Maybe.Just.create($foreign.drop($foreign.length(v))(str));
        };
        return Data_Maybe.Nothing.value;
    };
};
var eqReplacement = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordReplacement = new Data_Ord.Ord(function () {
    return eqReplacement;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordString)(x)(y);
    };
});
var eqPattern = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordPattern = new Data_Ord.Ord(function () {
    return eqPattern;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordString)(x)(y);
    };
});
var dropWhile = function (p) {
    return function (s) {
        return $foreign.drop($foreign.count(p)(s))(s);
    };
};
var contains = function (pat) {
    return function ($46) {
        return Data_Maybe.isJust(indexOf(pat)($46));
    };
};
var charCodeAt = $foreign._charCodeAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var charAt = $foreign._charAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
module.exports = {
    Pattern: Pattern, 
    Replacement: Replacement, 
    charAt: charAt, 
    charCodeAt: charCodeAt, 
    contains: contains, 
    dropWhile: dropWhile, 
    indexOf: indexOf, 
    "indexOf'": indexOf$prime, 
    lastIndexOf: lastIndexOf, 
    "lastIndexOf'": lastIndexOf$prime, 
    localeCompare: localeCompare, 
    "null": $$null, 
    splitAt: splitAt, 
    stripPrefix: stripPrefix, 
    stripSuffix: stripSuffix, 
    takeWhile: takeWhile, 
    toChar: toChar, 
    uncons: uncons, 
    eqPattern: eqPattern, 
    ordPattern: ordPattern, 
    newtypePattern: newtypePattern, 
    showPattern: showPattern, 
    eqReplacement: eqReplacement, 
    ordReplacement: ordReplacement, 
    newtypeReplacement: newtypeReplacement, 
    showReplacement: showReplacement, 
    count: $foreign.count, 
    drop: $foreign.drop, 
    fromCharArray: $foreign.fromCharArray, 
    joinWith: $foreign.joinWith, 
    length: $foreign.length, 
    replace: $foreign.replace, 
    replaceAll: $foreign.replaceAll, 
    singleton: $foreign.singleton, 
    split: $foreign.split, 
    take: $foreign.take, 
    toCharArray: $foreign.toCharArray, 
    toLower: $foreign.toLower, 
    toUpper: $foreign.toUpper, 
    trim: $foreign.trim
};

},{"../Control.Semigroupoid":63,"../Data.Eq":81,"../Data.Function":89,"../Data.Maybe":104,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.String.Unsafe":130,"../Prelude":148,"./foreign":131}],133:[function(require,module,exports){
"use strict";

// jshint maxparams: 3

exports.traverseArrayImpl = function () {
  function Cont(fn) {
    this.fn = fn;
  }

  var emptyList = {};

  var ConsCell = function (head, tail) {
    this.head = head;
    this.tail = tail;
  };

  function consList(x) {
    return function (xs) {
      return new ConsCell(x, xs);
    };
  }

  function listToArray(list) {
    var arr = [];
    while (list !== emptyList) {
      arr.push(list.head);
      list = list.tail;
    }
    return arr;
  }

  return function (apply) {
    return function (map) {
      return function (pure) {
        return function (f) {
          var buildFrom = function (x, ys) {
            return apply(map(consList)(f(x)))(ys);
          };

          var go = function (acc, currentLen, xs) {
            if (currentLen === 0) {
              return acc;
            } else {
              var last = xs[currentLen - 1];
              return new Cont(function () {
                return go(buildFrom(last, acc), currentLen - 1, xs);
              });
            }
          };

          return function (array) {
            var result = go(pure(emptyList), array.length, array);
            while (result instanceof Cont) {
              result = result.fn();
            }

            return map(listToArray)(result);
          };
        };
      };
    };
  };
}();

},{}],134:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Data_Foldable = require("../Data.Foldable");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Maybe_Last = require("../Data.Maybe.Last");
var Data_Monoid_Additive = require("../Data.Monoid.Additive");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Multiplicative = require("../Data.Monoid.Multiplicative");
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Control_Applicative = require("../Control.Applicative");
var Control_Category = require("../Control.Category");
var StateL = function (x) {
    return x;
};
var StateR = function (x) {
    return x;
};
var Traversable = function (__superclass_Data$dotFoldable$dotFoldable_1, __superclass_Data$dotFunctor$dotFunctor_0, sequence, traverse) {
    this["__superclass_Data.Foldable.Foldable_1"] = __superclass_Data$dotFoldable$dotFoldable_1;
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.sequence = sequence;
    this.traverse = traverse;
};
var traverse = function (dict) {
    return dict.traverse;
};
var traversableMultiplicative = new Traversable(function () {
    return Data_Foldable.foldableMultiplicative;
}, function () {
    return Data_Monoid_Multiplicative.functorMultiplicative;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Multiplicative.Multiplicative)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Multiplicative.Multiplicative)(f(v));
        };
    };
});
var traversableMaybe = new Traversable(function () {
    return Data_Foldable.foldableMaybe;
}, function () {
    return Data_Maybe.functorMaybe;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Data_Maybe.Nothing) {
            return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
        };
        if (v instanceof Data_Maybe.Just) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Traversable line 85, column 3 - line 85, column 35: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
            };
            if (v1 instanceof Data_Maybe.Just) {
                return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)(v(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Traversable line 83, column 3 - line 83, column 37: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
});
var traversableDual = new Traversable(function () {
    return Data_Foldable.foldableDual;
}, function () {
    return Data_Monoid_Dual.functorDual;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Dual.Dual)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Dual.Dual)(f(v));
        };
    };
});
var traversableDisj = new Traversable(function () {
    return Data_Foldable.foldableDisj;
}, function () {
    return Data_Monoid_Disj.functorDisj;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Disj.Disj)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Disj.Disj)(f(v));
        };
    };
});
var traversableConj = new Traversable(function () {
    return Data_Foldable.foldableConj;
}, function () {
    return Data_Monoid_Conj.functorConj;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Conj.Conj)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Conj.Conj)(f(v));
        };
    };
});
var traversableAdditive = new Traversable(function () {
    return Data_Foldable.foldableAdditive;
}, function () {
    return Data_Monoid_Additive.functorAdditive;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Additive.Additive)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Additive.Additive)(f(v));
        };
    };
});
var stateR = function (v) {
    return v;
};
var stateL = function (v) {
    return v;
};
var sequenceDefault = function (dictTraversable) {
    return function (dictApplicative) {
        return function (tma) {
            return traverse(dictTraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(tma);
        };
    };
};
var traversableArray = new Traversable(function () {
    return Data_Foldable.foldableArray;
}, function () {
    return Data_Functor.functorArray;
}, function (dictApplicative) {
    return sequenceDefault(traversableArray)(dictApplicative);
}, function (dictApplicative) {
    return $foreign.traverseArrayImpl(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]()))(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]()))(Control_Applicative.pure(dictApplicative));
});
var sequence = function (dict) {
    return dict.sequence;
};
var traversableFirst = new Traversable(function () {
    return Data_Foldable.foldableFirst;
}, function () {
    return Data_Maybe_First.functorFirst;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_First.First)(sequence(traversableMaybe)(dictApplicative)(v));
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_First.First)(traverse(traversableMaybe)(dictApplicative)(f)(v));
        };
    };
});
var traversableLast = new Traversable(function () {
    return Data_Foldable.foldableLast;
}, function () {
    return Data_Maybe_Last.functorLast;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_Last.Last)(sequence(traversableMaybe)(dictApplicative)(v));
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_Last.Last)(traverse(traversableMaybe)(dictApplicative)(f)(v));
        };
    };
});
var traverseDefault = function (dictTraversable) {
    return function (dictApplicative) {
        return function (f) {
            return function (ta) {
                return sequence(dictTraversable)(dictApplicative)(Data_Functor.map(dictTraversable["__superclass_Data.Functor.Functor_0"]())(f)(ta));
            };
        };
    };
};
var functorStateR = new Data_Functor.Functor(function (f) {
    return function (k) {
        return function (s) {
            var $75 = stateR(k)(s);
            return {
                accum: $75.accum, 
                value: f($75.value)
            };
        };
    };
});
var functorStateL = new Data_Functor.Functor(function (f) {
    return function (k) {
        return function (s) {
            var $78 = stateL(k)(s);
            return {
                accum: $78.accum, 
                value: f($78.value)
            };
        };
    };
});
var $$for = function (dictApplicative) {
    return function (dictTraversable) {
        return function (x) {
            return function (f) {
                return traverse(dictTraversable)(dictApplicative)(f)(x);
            };
        };
    };
};
var applyStateR = new Control_Apply.Apply(function () {
    return functorStateR;
}, function (f) {
    return function (x) {
        return function (s) {
            var $81 = stateR(x)(s);
            var $82 = stateR(f)($81.accum);
            return {
                accum: $82.accum, 
                value: $82.value($81.value)
            };
        };
    };
});
var applyStateL = new Control_Apply.Apply(function () {
    return functorStateL;
}, function (f) {
    return function (x) {
        return function (s) {
            var $87 = stateL(f)(s);
            var $88 = stateL(x)($87.accum);
            return {
                accum: $88.accum, 
                value: $87.value($88.value)
            };
        };
    };
});
var applicativeStateR = new Control_Applicative.Applicative(function () {
    return applyStateR;
}, function (a) {
    return function (s) {
        return {
            accum: s, 
            value: a
        };
    };
});
var mapAccumR = function (dictTraversable) {
    return function (f) {
        return function (s0) {
            return function (xs) {
                return stateR(traverse(dictTraversable)(applicativeStateR)(function (a) {
                    return function (s) {
                        return f(s)(a);
                    };
                })(xs))(s0);
            };
        };
    };
};
var scanr = function (dictTraversable) {
    return function (f) {
        return function (b0) {
            return function (xs) {
                return (mapAccumR(dictTraversable)(function (b) {
                    return function (a) {
                        var b$prime = f(a)(b);
                        return {
                            accum: b$prime, 
                            value: b$prime
                        };
                    };
                })(b0)(xs)).value;
            };
        };
    };
};
var applicativeStateL = new Control_Applicative.Applicative(function () {
    return applyStateL;
}, function (a) {
    return function (s) {
        return {
            accum: s, 
            value: a
        };
    };
});
var mapAccumL = function (dictTraversable) {
    return function (f) {
        return function (s0) {
            return function (xs) {
                return stateL(traverse(dictTraversable)(applicativeStateL)(function (a) {
                    return function (s) {
                        return f(s)(a);
                    };
                })(xs))(s0);
            };
        };
    };
};
var scanl = function (dictTraversable) {
    return function (f) {
        return function (b0) {
            return function (xs) {
                return (mapAccumL(dictTraversable)(function (b) {
                    return function (a) {
                        var b$prime = f(b)(a);
                        return {
                            accum: b$prime, 
                            value: b$prime
                        };
                    };
                })(b0)(xs)).value;
            };
        };
    };
};
module.exports = {
    Traversable: Traversable, 
    "for": $$for, 
    mapAccumL: mapAccumL, 
    mapAccumR: mapAccumR, 
    scanl: scanl, 
    scanr: scanr, 
    sequence: sequence, 
    sequenceDefault: sequenceDefault, 
    traverse: traverse, 
    traverseDefault: traverseDefault, 
    traversableArray: traversableArray, 
    traversableMaybe: traversableMaybe, 
    traversableFirst: traversableFirst, 
    traversableLast: traversableLast, 
    traversableAdditive: traversableAdditive, 
    traversableDual: traversableDual, 
    traversableConj: traversableConj, 
    traversableDisj: traversableDisj, 
    traversableMultiplicative: traversableMultiplicative
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Category":20,"../Data.Foldable":86,"../Data.Functor":93,"../Data.Maybe":104,"../Data.Maybe.First":102,"../Data.Maybe.Last":103,"../Data.Monoid.Additive":105,"../Data.Monoid.Conj":106,"../Data.Monoid.Disj":107,"../Data.Monoid.Dual":108,"../Data.Monoid.Multiplicative":110,"../Prelude":148,"./foreign":133}],135:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var uncurry9 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0)(v.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value1.value1.value0);
    };
};
var uncurry8 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0)(v.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value1.value0);
    };
};
var uncurry7 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0)(v.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value0);
    };
};
var uncurry6 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0)(v.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value0);
    };
};
var uncurry5 = function (f) {
    return function (v) {
        return f(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0)(v.value1.value1.value1.value1.value0);
    };
};
var uncurry4 = function (f) {
    return function (v) {
        return f(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0);
    };
};
var uncurry3 = function (f) {
    return function (v) {
        return f(v.value0)(v.value1.value0)(v.value1.value1.value0);
    };
};
var uncurry2 = function (f) {
    return function (v) {
        return f(v.value0)(v.value1.value0);
    };
};
var uncurry10 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0)(v.value1.value0)(v.value1.value1.value0)(v.value1.value1.value1.value0)(v.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value1.value1.value0)(v.value1.value1.value1.value1.value1.value1.value1.value1.value1.value0);
    };
};
var uncurry1 = function (f) {
    return function (v) {
        return f(v.value0);
    };
};
var tuple9 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return function (h) {
                                return function (i) {
                                    return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, new Data_Tuple.Tuple(h, new Data_Tuple.Tuple(i, Data_Unit.unit)))))))));
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var tuple8 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return function (h) {
                                return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, new Data_Tuple.Tuple(h, Data_Unit.unit))))))));
                            };
                        };
                    };
                };
            };
        };
    };
};
var tuple7 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, Data_Unit.unit)))))));
                        };
                    };
                };
            };
        };
    };
};
var tuple6 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, Data_Unit.unit))))));
                    };
                };
            };
        };
    };
};
var tuple5 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, Data_Unit.unit)))));
                };
            };
        };
    };
};
var tuple4 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, Data_Unit.unit))));
            };
        };
    };
};
var tuple3 = function (a) {
    return function (b) {
        return function (c) {
            return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, Data_Unit.unit)));
        };
    };
};
var tuple2 = function (a) {
    return function (b) {
        return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, Data_Unit.unit));
    };
};
var tuple10 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return function (h) {
                                return function (i) {
                                    return function (j) {
                                        return new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, new Data_Tuple.Tuple(h, new Data_Tuple.Tuple(i, new Data_Tuple.Tuple(j, Data_Unit.unit))))))))));
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var tuple1 = function (a) {
    return new Data_Tuple.Tuple(a, Data_Unit.unit);
};
var over9 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value1.value1.value1.value1.value1.value0), v.value1.value1.value1.value1.value1.value1.value1.value1.value1)))))))));
    };
};
var over8 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value1.value1.value1.value1.value0), v.value1.value1.value1.value1.value1.value1.value1.value1))))))));
    };
};
var over7 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value1.value1.value1.value0), v.value1.value1.value1.value1.value1.value1.value1)))))));
    };
};
var over6 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value1.value1.value0), v.value1.value1.value1.value1.value1.value1))))));
    };
};
var over5 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value1.value0), v.value1.value1.value1.value1.value1)))));
    };
};
var over4 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value0), v.value1.value1.value1.value1))));
    };
};
var over3 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value0), v.value1.value1.value1)));
    };
};
var over2 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(o(v.value1.value0), v.value1.value1));
    };
};
var over10 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(v.value0, new Data_Tuple.Tuple(v.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(v.value1.value1.value1.value1.value1.value1.value1.value1.value0, new Data_Tuple.Tuple(o(v.value1.value1.value1.value1.value1.value1.value1.value1.value1.value0), v.value1.value1.value1.value1.value1.value1.value1.value1.value1.value1))))))))));
    };
};
var over1 = function (o) {
    return function (v) {
        return new Data_Tuple.Tuple(o(v.value0), v.value1);
    };
};
var get9 = function (v) {
    return v.value1.value1.value1.value1.value1.value1.value1.value1.value0;
};
var get8 = function (v) {
    return v.value1.value1.value1.value1.value1.value1.value1.value0;
};
var get7 = function (v) {
    return v.value1.value1.value1.value1.value1.value1.value0;
};
var get6 = function (v) {
    return v.value1.value1.value1.value1.value1.value0;
};
var get5 = function (v) {
    return v.value1.value1.value1.value1.value0;
};
var get4 = function (v) {
    return v.value1.value1.value1.value0;
};
var get3 = function (v) {
    return v.value1.value1.value0;
};
var get2 = function (v) {
    return v.value1.value0;
};
var get10 = function (v) {
    return v.value1.value1.value1.value1.value1.value1.value1.value1.value1.value0;
};
var get1 = function (v) {
    return v.value0;
};
var curry9 = function (z) {
    return function (f$prime) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return function (f) {
                                return function (g) {
                                    return function (h) {
                                        return function (i) {
                                            return f$prime(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, new Data_Tuple.Tuple(h, new Data_Tuple.Tuple(i, z))))))))));
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry8 = function (z) {
    return function (f$prime) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return function (f) {
                                return function (g) {
                                    return function (h) {
                                        return f$prime(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, new Data_Tuple.Tuple(h, z)))))))));
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry7 = function (z) {
    return function (f$prime) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return function (f) {
                                return function (g) {
                                    return f$prime(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, z))))))));
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry6 = function (z) {
    return function (f$prime) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return function (f) {
                                return f$prime(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, z)))))));
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry5 = function (z) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return f(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, z))))));
                        };
                    };
                };
            };
        };
    };
};
var curry4 = function (z) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return f(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, z)))));
                    };
                };
            };
        };
    };
};
var curry3 = function (z) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return f(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, z))));
                };
            };
        };
    };
};
var curry2 = function (z) {
    return function (f) {
        return function (a) {
            return function (b) {
                return f(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, z)));
            };
        };
    };
};
var curry10 = function (z) {
    return function (f$prime) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return function (f) {
                                return function (g) {
                                    return function (h) {
                                        return function (i) {
                                            return function (j) {
                                                return f$prime(new Data_Tuple.Tuple(a, new Data_Tuple.Tuple(b, new Data_Tuple.Tuple(c, new Data_Tuple.Tuple(d, new Data_Tuple.Tuple(e, new Data_Tuple.Tuple(f, new Data_Tuple.Tuple(g, new Data_Tuple.Tuple(h, new Data_Tuple.Tuple(i, new Data_Tuple.Tuple(j, z)))))))))));
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry1 = function (z) {
    return function (f) {
        return function (a) {
            return f(new Data_Tuple.Tuple(a, z));
        };
    };
};
module.exports = {
    curry1: curry1, 
    curry10: curry10, 
    curry2: curry2, 
    curry3: curry3, 
    curry4: curry4, 
    curry5: curry5, 
    curry6: curry6, 
    curry7: curry7, 
    curry8: curry8, 
    curry9: curry9, 
    get1: get1, 
    get10: get10, 
    get2: get2, 
    get3: get3, 
    get4: get4, 
    get5: get5, 
    get6: get6, 
    get7: get7, 
    get8: get8, 
    get9: get9, 
    over1: over1, 
    over10: over10, 
    over2: over2, 
    over3: over3, 
    over4: over4, 
    over5: over5, 
    over6: over6, 
    over7: over7, 
    over8: over8, 
    over9: over9, 
    tuple1: tuple1, 
    tuple10: tuple10, 
    tuple2: tuple2, 
    tuple3: tuple3, 
    tuple4: tuple4, 
    tuple5: tuple5, 
    tuple6: tuple6, 
    tuple7: tuple7, 
    tuple8: tuple8, 
    tuple9: tuple9, 
    uncurry1: uncurry1, 
    uncurry10: uncurry10, 
    uncurry2: uncurry2, 
    uncurry3: uncurry3, 
    uncurry4: uncurry4, 
    uncurry5: uncurry5, 
    uncurry6: uncurry6, 
    uncurry7: uncurry7, 
    uncurry8: uncurry8, 
    uncurry9: uncurry9
};

},{"../Data.Tuple":136,"../Data.Unit":140,"../Prelude":148}],136:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Prelude = require("../Prelude");
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Lazy = require("../Control.Lazy");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bitraversable = require("../Data.Bitraversable");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Traversable = require("../Data.Traversable");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Bounded = require("../Data.Bounded");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Semiring = require("../Data.Semiring");
var Data_Ring = require("../Data.Ring");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Tuple = (function () {
    function Tuple(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Tuple.create = function (value0) {
        return function (value1) {
            return new Tuple(value0, value1);
        };
    };
    return Tuple;
})();
var uncurry = function (f) {
    return function (v) {
        return f(v.value0)(v.value1);
    };
};
var swap = function (v) {
    return new Tuple(v.value1, v.value0);
};
var snd = function (v) {
    return v.value1;
};
var showTuple = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            return "(Tuple " + (Data_Show.show(dictShow)(v.value0) + (" " + (Data_Show.show(dictShow1)(v.value1) + ")")));
        });
    };
};
var semiringTuple = function (dictSemiring) {
    return function (dictSemiring1) {
        return new Data_Semiring.Semiring(function (v) {
            return function (v1) {
                return new Tuple(Data_Semiring.add(dictSemiring)(v.value0)(v1.value0), Data_Semiring.add(dictSemiring1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_Semiring.mul(dictSemiring)(v.value0)(v1.value0), Data_Semiring.mul(dictSemiring1)(v.value1)(v1.value1));
            };
        }, new Tuple(Data_Semiring.one(dictSemiring), Data_Semiring.one(dictSemiring1)), new Tuple(Data_Semiring.zero(dictSemiring), Data_Semiring.zero(dictSemiring1)));
    };
};
var semigroupoidTuple = new Control_Semigroupoid.Semigroupoid(function (v) {
    return function (v1) {
        return new Tuple(v1.value0, v.value1);
    };
});
var semigroupTuple = function (dictSemigroup) {
    return function (dictSemigroup1) {
        return new Data_Semigroup.Semigroup(function (v) {
            return function (v1) {
                return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), Data_Semigroup.append(dictSemigroup1)(v.value1)(v1.value1));
            };
        });
    };
};
var ringTuple = function (dictRing) {
    return function (dictRing1) {
        return new Data_Ring.Ring(function () {
            return semiringTuple(dictRing["__superclass_Data.Semiring.Semiring_0"]())(dictRing1["__superclass_Data.Semiring.Semiring_0"]());
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_Ring.sub(dictRing)(v.value0)(v1.value0), Data_Ring.sub(dictRing1)(v.value1)(v1.value1));
            };
        });
    };
};
var monoidTuple = function (dictMonoid) {
    return function (dictMonoid1) {
        return new Data_Monoid.Monoid(function () {
            return semigroupTuple(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictMonoid1["__superclass_Data.Semigroup.Semigroup_0"]());
        }, new Tuple(Data_Monoid.mempty(dictMonoid), Data_Monoid.mempty(dictMonoid1)));
    };
};
var lookup = function (dictFoldable) {
    return function (dictEq) {
        return function (a) {
            return function ($255) {
                return Data_Newtype.unwrap(Data_Maybe_First.newtypeFirst)(Data_Foldable.foldMap(dictFoldable)(Data_Maybe_First.monoidFirst)(function (v) {
                    var $135 = Data_Eq.eq(dictEq)(a)(v.value0);
                    if ($135) {
                        return new Data_Maybe.Just(v.value1);
                    };
                    if (!$135) {
                        return Data_Maybe.Nothing.value;
                    };
                    throw new Error("Failed pattern match at Data.Tuple line 170, column 55 - line 170, column 90: " + [ $135.constructor.name ]);
                })($255));
            };
        };
    };
};
var heytingAlgebraTuple = function (dictHeytingAlgebra) {
    return function (dictHeytingAlgebra1) {
        return new Data_HeytingAlgebra.HeytingAlgebra(function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.conj(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.disj(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, new Tuple(Data_HeytingAlgebra.ff(dictHeytingAlgebra), Data_HeytingAlgebra.ff(dictHeytingAlgebra1)), function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.implies(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.implies(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return new Tuple(Data_HeytingAlgebra.not(dictHeytingAlgebra)(v.value0), Data_HeytingAlgebra.not(dictHeytingAlgebra1)(v.value1));
        }, new Tuple(Data_HeytingAlgebra.tt(dictHeytingAlgebra), Data_HeytingAlgebra.tt(dictHeytingAlgebra1)));
    };
};
var functorTuple = new Data_Functor.Functor(function (f) {
    return function (v) {
        return new Tuple(v.value0, f(v.value1));
    };
});
var invariantTuple = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorTuple));
var fst = function (v) {
    return v.value0;
};
var lazyTuple = function (dictLazy) {
    return function (dictLazy1) {
        return new Control_Lazy.Lazy(function (f) {
            return new Tuple(Control_Lazy.defer(dictLazy)(function (v) {
                return fst(f(Data_Unit.unit));
            }), Control_Lazy.defer(dictLazy1)(function (v) {
                return snd(f(Data_Unit.unit));
            }));
        });
    };
};
var foldableTuple = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v.value1);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v.value1);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v.value1)(z);
        };
    };
});
var traversableTuple = new Data_Traversable.Traversable(function () {
    return foldableTuple;
}, function () {
    return functorTuple;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create(v.value0))(v.value1);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create(v.value0))(f(v.value1));
        };
    };
});
var extendTuple = new Control_Extend.Extend(function () {
    return functorTuple;
}, function (f) {
    return function (v) {
        return new Tuple(v.value0, f(v));
    };
});
var eqTuple = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (x) {
            return function (y) {
                return Data_Eq.eq(dictEq)(x.value0)(y.value0) && Data_Eq.eq(dictEq1)(x.value1)(y.value1);
            };
        });
    };
};
var ordTuple = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqTuple(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
        }, function (x) {
            return function (y) {
                var $201 = Data_Ord.compare(dictOrd)(x.value0)(y.value0);
                if ($201 instanceof Data_Ordering.LT) {
                    return Data_Ordering.LT.value;
                };
                if ($201 instanceof Data_Ordering.GT) {
                    return Data_Ordering.GT.value;
                };
                return Data_Ord.compare(dictOrd1)(x.value1)(y.value1);
            };
        });
    };
};
var curry = function (f) {
    return function (a) {
        return function (b) {
            return f(new Tuple(a, b));
        };
    };
};
var comonadTuple = new Control_Comonad.Comonad(function () {
    return extendTuple;
}, snd);
var commutativeRingTuple = function (dictCommutativeRing) {
    return function (dictCommutativeRing1) {
        return new Data_CommutativeRing.CommutativeRing(function () {
            return ringTuple(dictCommutativeRing["__superclass_Data.Ring.Ring_0"]())(dictCommutativeRing1["__superclass_Data.Ring.Ring_0"]());
        });
    };
};
var boundedTuple = function (dictBounded) {
    return function (dictBounded1) {
        return new Data_Bounded.Bounded(function () {
            return ordTuple(dictBounded["__superclass_Data.Ord.Ord_0"]())(dictBounded1["__superclass_Data.Ord.Ord_0"]());
        }, new Tuple(Data_Bounded.bottom(dictBounded), Data_Bounded.bottom(dictBounded1)), new Tuple(Data_Bounded.top(dictBounded), Data_Bounded.top(dictBounded1)));
    };
};
var booleanAlgebraTuple = function (dictBooleanAlgebra) {
    return function (dictBooleanAlgebra1) {
        return new Data_BooleanAlgebra.BooleanAlgebra(function () {
            return heytingAlgebraTuple(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]())(dictBooleanAlgebra1["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]());
        });
    };
};
var bifunctorTuple = new Data_Bifunctor.Bifunctor(function (f) {
    return function (g) {
        return function (v) {
            return new Tuple(f(v.value0), g(v.value1));
        };
    };
});
var bifoldableTuple = new Data_Bifoldable.Bifoldable(function (dictMonoid) {
    return function (f) {
        return function (g) {
            return function (v) {
                return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(v.value0))(g(v.value1));
            };
        };
    };
}, function (f) {
    return function (g) {
        return function (z) {
            return function (v) {
                return g(f(z)(v.value0))(v.value1);
            };
        };
    };
}, function (f) {
    return function (g) {
        return function (z) {
            return function (v) {
                return f(v.value0)(g(v.value1)(z));
            };
        };
    };
});
var bitraversableTuple = new Data_Bitraversable.Bitraversable(function () {
    return bifoldableTuple;
}, function () {
    return bifunctorTuple;
}, function (dictApplicative) {
    return function (v) {
        return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create)(v.value0))(v.value1);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (g) {
            return function (v) {
                return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create)(f(v.value0)))(g(v.value1));
            };
        };
    };
});
var biapplyTuple = new Control_Biapply.Biapply(function () {
    return bifunctorTuple;
}, function (v) {
    return function (v1) {
        return new Tuple(v.value0(v1.value0), v.value1(v1.value1));
    };
});
var biapplicativeTuple = new Control_Biapplicative.Biapplicative(function () {
    return biapplyTuple;
}, Tuple.create);
var applyTuple = function (dictSemigroup) {
    return new Control_Apply.Apply(function () {
        return functorTuple;
    }, function (v) {
        return function (v1) {
            return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), v.value1(v1.value1));
        };
    });
};
var bindTuple = function (dictSemigroup) {
    return new Control_Bind.Bind(function () {
        return applyTuple(dictSemigroup);
    }, function (v) {
        return function (f) {
            var $250 = f(v.value1);
            return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)($250.value0), $250.value1);
        };
    });
};
var applicativeTuple = function (dictMonoid) {
    return new Control_Applicative.Applicative(function () {
        return applyTuple(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Tuple.create(Data_Monoid.mempty(dictMonoid)));
};
var monadTuple = function (dictMonoid) {
    return new Control_Monad.Monad(function () {
        return applicativeTuple(dictMonoid);
    }, function () {
        return bindTuple(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    });
};
module.exports = {
    Tuple: Tuple, 
    curry: curry, 
    fst: fst, 
    lookup: lookup, 
    snd: snd, 
    swap: swap, 
    uncurry: uncurry, 
    showTuple: showTuple, 
    eqTuple: eqTuple, 
    ordTuple: ordTuple, 
    boundedTuple: boundedTuple, 
    semigroupoidTuple: semigroupoidTuple, 
    semigroupTuple: semigroupTuple, 
    monoidTuple: monoidTuple, 
    semiringTuple: semiringTuple, 
    ringTuple: ringTuple, 
    commutativeRingTuple: commutativeRingTuple, 
    heytingAlgebraTuple: heytingAlgebraTuple, 
    booleanAlgebraTuple: booleanAlgebraTuple, 
    functorTuple: functorTuple, 
    invariantTuple: invariantTuple, 
    bifunctorTuple: bifunctorTuple, 
    applyTuple: applyTuple, 
    biapplyTuple: biapplyTuple, 
    applicativeTuple: applicativeTuple, 
    biapplicativeTuple: biapplicativeTuple, 
    bindTuple: bindTuple, 
    monadTuple: monadTuple, 
    extendTuple: extendTuple, 
    comonadTuple: comonadTuple, 
    lazyTuple: lazyTuple, 
    foldableTuple: foldableTuple, 
    bifoldableTuple: bifoldableTuple, 
    traversableTuple: traversableTuple, 
    bitraversableTuple: bitraversableTuple
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Biapplicative":16,"../Control.Biapply":17,"../Control.Bind":19,"../Control.Comonad":21,"../Control.Extend":24,"../Control.Lazy":25,"../Control.Monad":57,"../Control.Semigroupoid":63,"../Data.Bifoldable":70,"../Data.Bifunctor":71,"../Data.Bitraversable":72,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.CommutativeRing":77,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":89,"../Data.Functor":93,"../Data.Functor.Invariant":91,"../Data.HeytingAlgebra":97,"../Data.Maybe":104,"../Data.Maybe.First":102,"../Data.Monoid":111,"../Data.Newtype":113,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.Traversable":134,"../Data.Unit":140,"../Prelude":148}],137:[function(require,module,exports){
"use strict";

exports.unfoldrArrayImpl = function (isNothing) {
  return function (fromJust) {
    return function (fst) {
      return function (snd) {
        return function (f) {
          return function (b) {
            var result = [];
            while (true) {
              var maybe = f(b);
              if (isNothing(maybe)) return result;
              var tuple = fromJust(maybe);
              result.push(fst(tuple));
              b = snd(tuple);
            }
          };
        };
      };
    };
  };
};

},{}],138:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Data_Maybe = require("../Data.Maybe");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Partial_Unsafe = require("../Partial.Unsafe");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Data_Functor = require("../Data.Functor");
var Unfoldable = function (unfoldr) {
    this.unfoldr = unfoldr;
};
var unfoldr = function (dict) {
    return dict.unfoldr;
};
var unfoldableArray = new Unfoldable($foreign.unfoldrArrayImpl(Data_Maybe.isNothing)(Partial_Unsafe.unsafePartial(function (dictPartial) {
    return Data_Maybe.fromJust(dictPartial);
}))(Data_Tuple.fst)(Data_Tuple.snd));
var replicate = function (dictUnfoldable) {
    return function (n) {
        return function (v) {
            var step = function (i) {
                var $8 = i <= 0;
                if ($8) {
                    return Data_Maybe.Nothing.value;
                };
                if (!$8) {
                    return new Data_Maybe.Just(new Data_Tuple.Tuple(v, i - 1));
                };
                throw new Error("Failed pattern match at Data.Unfoldable line 59, column 7 - line 60, column 34: " + [ $8.constructor.name ]);
            };
            return unfoldr(dictUnfoldable)(step)(n);
        };
    };
};
var replicateA = function (dictApplicative) {
    return function (dictUnfoldable) {
        return function (dictTraversable) {
            return function (n) {
                return function (m) {
                    return Data_Traversable.sequence(dictTraversable)(dictApplicative)(replicate(dictUnfoldable)(n)(m));
                };
            };
        };
    };
};
var singleton = function (dictUnfoldable) {
    return replicate(dictUnfoldable)(1);
};
var none = function (dictUnfoldable) {
    return unfoldr(dictUnfoldable)(Data_Function["const"](Data_Maybe.Nothing.value))(Data_Unit.unit);
};
var fromMaybe = function (dictUnfoldable) {
    return unfoldr(dictUnfoldable)(function (b) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Function.flip(Data_Tuple.Tuple.create)(Data_Maybe.Nothing.value))(b);
    });
};
module.exports = {
    Unfoldable: Unfoldable, 
    fromMaybe: fromMaybe, 
    none: none, 
    replicate: replicate, 
    replicateA: replicateA, 
    singleton: singleton, 
    unfoldr: unfoldr, 
    unfoldableArray: unfoldableArray
};

},{"../Data.Function":89,"../Data.Functor":93,"../Data.Maybe":104,"../Data.Ord":118,"../Data.Ring":121,"../Data.Traversable":134,"../Data.Tuple":136,"../Data.Unit":140,"../Partial.Unsafe":145,"../Prelude":148,"./foreign":137}],139:[function(require,module,exports){
"use strict";

exports.unit = {};

},{}],140:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Data_Show = require("../Data.Show");
var showUnit = new Data_Show.Show(function (v) {
    return "unit";
});
module.exports = {
    showUnit: showUnit, 
    unit: $foreign.unit
};

},{"../Data.Show":128,"./foreign":139}],141:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Data_Show = require("../Data.Show");
var Void = function (x) {
    return x;
};
var absurd = function (a) {
    var spin = function (__copy_v) {
        var v = __copy_v;
        tco: while (true) {
            var __tco_v = v;
            v = __tco_v;
            continue tco;
        };
    };
    return spin(a);
};
var showVoid = new Data_Show.Show(absurd);
module.exports = {
    absurd: absurd, 
    showVoid: showVoid
};

},{"../Data.Show":128}],142:[function(require,module,exports){
exports.onKeyboardDown = function (eff) {
  window.onkeydown = function (e) {
    eff(e.keyCode)();
  };
};


exports.writeToDOM = function(s) {
  return function () {
    a.innerText = s;
  };
};

},{}],143:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Cycle = require("../Control.Cycle");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_XStream = require("../Control.XStream");
var Data_Generic = require("../Data.Generic");
var Data_Monoid = require("../Data.Monoid");
var Data_Set = require("../Data.Set");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Control_Apply = require("../Control.Apply");
var Data_Maybe = require("../Data.Maybe");
var Data_Unit = require("../Data.Unit");
var Data_Show = require("../Data.Show");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Data_Semiring = require("../Data.Semiring");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Up = (function () {
    function Up() {

    };
    Up.value = new Up();
    return Up;
})();
var Down = (function () {
    function Down() {

    };
    Down.value = new Down();
    return Down;
})();
var Left = (function () {
    function Left() {

    };
    Left.value = new Left();
    return Left;
})();
var Right = (function () {
    function Right() {

    };
    Right.value = new Right();
    return Right;
})();
var MoveCursor = (function () {
    function MoveCursor(value0) {
        this.value0 = value0;
    };
    MoveCursor.create = function (value0) {
        return new MoveCursor(value0);
    };
    return MoveCursor;
})();
var Coords = (function () {
    function Coords(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Coords.create = function (value0) {
        return function (value1) {
            return new Coords(value0, value1);
        };
    };
    return Coords;
})();
var State = (function () {
    function State(value0) {
        this.value0 = value0;
    };
    State.create = function (value0) {
        return new State(value0);
    };
    return State;
})();
var Output = (function () {
    function Output(value0) {
        this.value0 = value0;
    };
    Output.create = function (value0) {
        return new Output(value0);
    };
    return Output;
})();
var SomeOtherCommand = (function () {
    function SomeOtherCommand() {

    };
    SomeOtherCommand.value = new SomeOtherCommand();
    return SomeOtherCommand;
})();
var App = (function () {
    function App(value0) {
        this.value0 = value0;
    };
    App.create = function (value0) {
        return new App(value0);
    };
    return App;
})();
var SomeOtherAction = (function () {
    function SomeOtherAction() {

    };
    SomeOtherAction.value = new SomeOtherAction();
    return SomeOtherAction;
})();
var kb = (function () {
    var keyCodeToQuery = function (v) {
        if (v === 38) {
            return Control_Applicative.pure(Control_XStream.applicativeStream)(Up.value);
        };
        if (v === 40) {
            return Control_Applicative.pure(Control_XStream.applicativeStream)(Down.value);
        };
        if (v === 37) {
            return Control_Applicative.pure(Control_XStream.applicativeStream)(Left.value);
        };
        if (v === 39) {
            return Control_Applicative.pure(Control_XStream.applicativeStream)(Right.value);
        };
        return Data_Monoid.mempty(Control_XStream.monoidStream);
    };
    return function __do() {
        var v = Control_XStream.fromCallback($foreign.onKeyboardDown)();
        return Control_Bind.bindFlipped(Control_XStream.bindStream)(keyCodeToQuery)(v);
    };
})();
var isInvalidPoint = function (v) {
    return function (v1) {
        return v.value0 < 0 || ((v1.value0.increment * v.value0 | 0) > v1.value0.width - v1.value0.increment || (v.value1 < 0 || (v1.value0.increment * v.value1 | 0) > v1.value0.height - v1.value0.increment));
    };
};
var genericCoords = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Main.Coords" && v.value1.length === 2)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Coords.create))(Data_Generic.fromSpine(Data_Generic.genericInt)(v.value1[0](Data_Unit.unit))))(Data_Generic.fromSpine(Data_Generic.genericInt)(v.value1[1](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Main.Coords", [ {
        sigConstructor: "Main.Coords", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericInt)(Data_Generic.anyProxy);
        }, function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericInt)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Main.Coords", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericInt)(v.value0);
    }, function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericInt)(v.value1);
    } ]);
});
var showCoords = new Data_Show.Show(Data_Generic.gShow(genericCoords));
var logState = function (v) {
    return $foreign.writeToDOM("cursor: " + Data_Show.show(showCoords)(v.value0.cursor));
};
var eqCoords = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x.value0 === y.value0 && x.value1 === y.value1;
    };
});
var ordCoords = new Data_Ord.Ord(function () {
    return eqCoords;
}, function (x) {
    return function (y) {
        var $53 = Data_Ord.compare(Data_Ord.ordInt)(x.value0)(y.value0);
        if ($53 instanceof Data_Ordering.LT) {
            return Data_Ordering.LT.value;
        };
        if ($53 instanceof Data_Ordering.GT) {
            return Data_Ordering.GT.value;
        };
        return Data_Ord.compare(Data_Ord.ordInt)(x.value1)(y.value1);
    };
});
var initialState = new State({
    cursor: new Coords(0, 0), 
    points: Data_Monoid.mempty(Data_Set.monoidSet(ordCoords)), 
    width: 800, 
    height: 600, 
    increment: 10
});
var driver = function (commands) {
    var extractOutput = function (v) {
        if (v instanceof Output) {
            return Control_Applicative.pure(Control_XStream.applicativeStream)(v.value0);
        };
        return Data_Monoid.mempty(Control_XStream.monoidStream);
    };
    return function __do() {
        Control_XStream.addListener({
            next: logState, 
            error: Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)), 
            complete: Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit))
        })(Control_Bind.bindFlipped(Control_XStream.bindStream)(extractOutput)(commands))();
        var v = kb();
        return Data_Functor.map(Control_XStream.functorStream)(function ($75) {
            return App.create(MoveCursor.create($75));
        })(v);
    };
};
var app = function (actions) {
    var shiftCursor = function (direction) {
        return function (v) {
            if (direction instanceof Up) {
                return new Coords(v.value0, v.value1 - 1);
            };
            if (direction instanceof Down) {
                return new Coords(v.value0, v.value1 + 1 | 0);
            };
            if (direction instanceof Left) {
                return new Coords(v.value0 - 1, v.value1);
            };
            if (direction instanceof Right) {
                return new Coords(v.value0 + 1 | 0, v.value1);
            };
            throw new Error("Failed pattern match at Main line 96, column 42 - line 100, column 32: " + [ direction.constructor.name ]);
        };
    };
    var $$eval = function (v) {
        return function (v1) {
            if (v1 instanceof App) {
                var cursor$prime = shiftCursor(v1.value0.value0)(v.value0.cursor);
                var $68 = isInvalidPoint(cursor$prime)(v);
                if ($68) {
                    return v;
                };
                if (!$68) {
                    return State.create((function () {
                        var $69 = {};
                        for (var $70 in v.value0) {
                            if (v.value0.hasOwnProperty($70)) {
                                $69[$70] = v.value0[$70];
                            };
                        };
                        $69.cursor = cursor$prime;
                        $69.points = Data_Set.insert(ordCoords)(v.value0.cursor)(v.value0.points);
                        return $69;
                    })());
                };
                throw new Error("Failed pattern match at Main line 103, column 7 - line 109, column 12: " + [ $68.constructor.name ]);
            };
            return v;
        };
    };
    return Data_Functor.map(Control_XStream.functorStream)(Output.create)(Control_XStream.fold($$eval)(initialState)(actions));
};
var main = Control_Cycle.run(app)(driver);
module.exports = {
    App: App, 
    SomeOtherAction: SomeOtherAction, 
    Output: Output, 
    SomeOtherCommand: SomeOtherCommand, 
    Coords: Coords, 
    Up: Up, 
    Down: Down, 
    Left: Left, 
    Right: Right, 
    MoveCursor: MoveCursor, 
    State: State, 
    app: app, 
    driver: driver, 
    initialState: initialState, 
    isInvalidPoint: isInvalidPoint, 
    kb: kb, 
    logState: logState, 
    main: main, 
    eqCoords: eqCoords, 
    ordCoords: ordCoords, 
    genericCoords: genericCoords, 
    showCoords: showCoords, 
    onKeyboardDown: $foreign.onKeyboardDown, 
    writeToDOM: $foreign.writeToDOM
};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Cycle":23,"../Control.Monad.Eff":44,"../Control.Semigroupoid":63,"../Control.XStream":65,"../Data.Eq":81,"../Data.Function":89,"../Data.Functor":93,"../Data.Generic":95,"../Data.HeytingAlgebra":97,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Set":126,"../Data.Show":128,"../Data.Unit":140,"../Prelude":148,"./foreign":142}],144:[function(require,module,exports){
"use strict";

// module Partial.Unsafe

exports.unsafePartial = function (f) {
  return f();
};

exports.unsafePartialBecause = function (reason) {
  return function (f) {
    try {
      return exports.unsafePartial(f);
    } catch (err) {
      throw new Error("unsafePartial failed. The following " +
                      "assumption was incorrect: '" + reason + "'.");
    }
  };
};

},{}],145:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var Partial = require("../Partial");
var unsafeCrashWith = function (msg) {
    return $foreign.unsafePartial(function (dictPartial) {
        return Partial.crashWith(dictPartial)(msg);
    });
};
module.exports = {
    unsafeCrashWith: unsafeCrashWith, 
    unsafePartial: $foreign.unsafePartial, 
    unsafePartialBecause: $foreign.unsafePartialBecause
};

},{"../Partial":147,"./foreign":144}],146:[function(require,module,exports){
"use strict";

// module Partial

exports.crashWith = function () {
  return function (msg) {
    throw new Error(msg);
  };
};

},{}],147:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
var crash = function (dictPartial) {
    return $foreign.crashWith(dictPartial)("Partial.crash: partial function");
};
module.exports = {
    crash: crash, 
    crashWith: $foreign.crashWith
};

},{"./foreign":146}],148:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Boolean = require("../Data.Boolean");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Field = require("../Data.Field");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_NaturalTransformation = require("../Data.NaturalTransformation");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
module.exports = {};

},{"../Control.Applicative":13,"../Control.Apply":15,"../Control.Bind":19,"../Control.Category":20,"../Control.Monad":57,"../Control.Semigroupoid":63,"../Data.Boolean":73,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.CommutativeRing":77,"../Data.Eq":81,"../Data.EuclideanRing":83,"../Data.Field":84,"../Data.Function":89,"../Data.Functor":93,"../Data.HeytingAlgebra":97,"../Data.NaturalTransformation":112,"../Data.Ord":118,"../Data.Ordering":119,"../Data.Ring":121,"../Data.Semigroup":123,"../Data.Semiring":125,"../Data.Show":128,"../Data.Unit":140,"../Data.Void":141}],149:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var Proxy3 = (function () {
    function Proxy3() {

    };
    Proxy3.value = new Proxy3();
    return Proxy3;
})();
var Proxy2 = (function () {
    function Proxy2() {

    };
    Proxy2.value = new Proxy2();
    return Proxy2;
})();
var $$Proxy = (function () {
    function $$Proxy() {

    };
    $$Proxy.value = new $$Proxy();
    return $$Proxy;
})();
module.exports = {
    "Proxy": $$Proxy, 
    Proxy2: Proxy2, 
    Proxy3: Proxy3
};

},{}],150:[function(require,module,exports){
"use strict";

// module Unsafe.Coerce

exports.unsafeCoerce = function (x) {
  return x;
};

},{}],151:[function(require,module,exports){
// Generated by psc version 0.10.2
"use strict";
var $foreign = require("./foreign");
module.exports = {
    unsafeCoerce: $foreign.unsafeCoerce
};

},{"./foreign":150}],152:[function(require,module,exports){
require('Main').main();

},{"Main":143}]},{},[152]);
