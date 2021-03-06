/*
custom apis:
core,
device.isMobileQQ,
app.isAppInstalled,
app.isAppInstalledBatch,
app.launchApp,
app.launchAppWithTokens,
app.sendFunnyFace,
app.checkAppInstalled,
app.checkAppInstalledBatch
*/
;
(function(name, definition) {

    this[name] = definition();

    if (typeof define === 'function') {
        define(this[name]);
    } else if (typeof module === 'object') {
        module.exports = this[name];
    }

})('mqq', function(undefined) {
    "use strict";

    var exports = {};

    var ua = navigator.userAgent;

    var SLICE = Array.prototype.slice;
    var REGEXP_IOS_QQ = /(iPad|iPhone|iPod).*? (IPad)?QQ\/([\d\.]+)/;
    var REGEXP_ANDROID_QQ = /\bV1_AND_SQI?_([\d\.]+)(.*? QQ\/([\d\.]+))?/; // 国际版的 QQ 的 ua 是 sqi

    var UUIDSeed = 1; //从1开始, 因为QQ浏览器的注入广告占用了0, 避免冲突

    var aCallbacks = {}; // 调用回调

    var aReports = {}; // API 调用的名字跟回调序号的映射

    var aSupports = {}; // 保存 API 的版本支持信息

    var CODE_API_CALL = -100000; // 定义为 API 调用, 跟 API 的回调区分

    var CODE_API_CALLBACK = -200000; // 定义为 API 调用的返回, 但是不知道确切返回码

    var NEW_PROTOCOL_BACK_LIST = { // 4.7启用了新协议, 但是部分接口不支持, 这里做个黑名单, 目前都是 android 的接口
        'qbizApi': '5.0', // 5.0 会支持新协议
        'pay': '999999', // pay相关的暂时没有修改计划
        'SetPwdJsInterface': '999999', // 设置密码?
        'GCApi': '999999', //游戏中心
        'q_download': '999999', // 下载器
        'qqZoneAppList': '999999', // 
        'qzone_app': '999999', // 
        'qzone_http': '999999', // 
        'qzone_imageCache': '999999', // 
        'RoamMapJsPlugin': '999999' //
    };

    exports.debuging = false;

    exports.iOS = REGEXP_IOS_QQ.test(ua);
    exports.android = REGEXP_ANDROID_QQ.test(ua);
    if (exports.iOS && exports.android) {

        /*
         * 同时是 iOS 和 android 是不可能的, 但是有些国产神机很恶心,
         * 明明是 android, ua 上还加上个 iPhone 5s...
         * 这里要 fix 掉
         */
        exports.iOS = false;
    }

    exports.version = '20140916001';

    exports.QQVersion = '0';

    exports.ERROR_NO_SUCH_METHOD = 'no such method';
    exports.ERROR_PERMISSION_DENIED = 'permission denied';

    if (!exports.android && !exports.iOS) {
        console.log('mqqapi: not android or ios');
    }

    /**
     * 当a<b返回-1, 当a==b返回0, 当a>b返回1,
     * 约定当a或b非法则返回-1
     */
    function compareVersion(a, b) {
        a = String(a).split('.');
        b = String(b).split('.');
        try {
            for (var i = 0, len = Math.max(a.length, b.length); i < len; i++) {
                var l = isFinite(a[i]) && Number(a[i]) || 0,
                    r = isFinite(b[i]) && Number(b[i]) || 0;
                if (l < r) {
                    return -1;
                } else if (l > r) {
                    return 1;
                }
            }
        } catch (e) {
            return -1;
        }
        return 0;
    }

    exports.compare = function(ver) {
        return compareVersion(exports.QQVersion, ver);
    };

    if (exports.android) {
        exports.QQVersion = function(m) { // 从 ua 拿版本号
            return m && (m[3] || m[1]) || 0;
        }(ua.match(REGEXP_ANDROID_QQ));

        if (!window.JsBridge) { // 兼容 android
            window.JsBridge = {};
        }
        window.JsBridge.callMethod = invokeClientMethod;
        window.JsBridge.callback = execGlobalCallback;
        window.JsBridge.compareVersion = exports.compare;

    }

    if (exports.iOS) {

        window.iOSQQApi = exports; // 兼容 iOS
        exports.__RETURN_VALUE = undefined; // 用于接收客户端返回值

        exports.QQVersion = function(m) { // 从 ua 拿版本号
            return m && m[3] || 0;
        }(ua.match(REGEXP_IOS_QQ));

        // exports.QQVersion = function(){
        //     return invokeClientMethod('device', 'qqVersion') || 0;
        // }();

    }

    exports.platform = exports.iOS ? 'IPH' : exports.android ? 'AND' : 'OTH';


    var Report = (function() {
        var reportCache = [];

        var sendFrequency = 500;

        var timer = 0;

        var lastTimerTime = 0;

        var APP_ID = 1000218;

        var mainVersion = String(exports.QQVersion).split('.').slice(0, 3).join('.');

        var releaseVersion = exports.platform + "_MQQ_" + mainVersion;

        var qua = exports.platform + exports.QQVersion + '/' + exports.version;

        function sendReport() {
            var arr = reportCache;
            reportCache = [];
            timer = 0;

            if (!arr.length) {

                // 这次没有要上报的, 就关掉定时器
                return;
            }
            var params = {};

            params.appid = APP_ID; // 手机QQ JS API
            params.releaseversion = releaseVersion;
            // params.build = location.hostname + location.pathname;
            params.sdkversion = exports.version;
            params.qua = qua;
            params.frequency = 1;

            params.t = Date.now();

            params.key = ['commandid', 'resultcode', 'tmcost'].join(',');

            arr.forEach(function(a, i) {

                params[i + 1 + '_1'] = a[0];
                params[i + 1 + '_2'] = a[1];
                params[i + 1 + '_3'] = a[2];
            });

            params = new String(toQuery(params));

            // api 的上报量太大了, 后台撑不住
            // if (supportVersion('mqq.data.pbReport')) {

            //     // 优先用客户端接口上报
            //     setTimeout(function() {

            //         params.__internalReport = true; // 使用有点hack的方式避免再次上报这次api调用
            //         mqq.data.pbReport(101, params);
            //     }, 0);

            // } else {
            var img = new Image();
            img.onload = function() {
                img = null;
            };
            img.src = 'http://wspeed.qq.com/w.cgi?' + params;
            // }

            timer = setTimeout(sendReport, sendFrequency);
        }

        function send(api, retCode, costTime) {

            reportCache.push([api, retCode || 0, costTime || 0]);

            // if(Date.now() - lastTimerTime < sendFrequency){

            //     // 连续的 sendFrequency 时间内的上报都合并掉
            //     clearTimeout(timer);
            //     timer = 0;
            // }
            if (!timer) {
                lastTimerTime = Date.now();
                timer = setTimeout(sendReport, sendFrequency);
            }

        }

        return {
            send: send
        };

    })();


    var Console = (function() {

        function debug() {
            if (!exports.debuging) {
                return;
            }
            var argus = SLICE.call(arguments);
            var result = [];
            argus.forEach(function(a) {
                if (typeof a === 'object') {
                    a = JSON.stringify(a);
                }
                result.push(a);
            });
            alert(result.join('\n'));
        }

        return {
            debug: debug
        };
    })();

    /**
     * 上报 API 调用和把 API 的回调跟 API 名字关联起来, 用于上报返回码和返回时间
     */
    function reportAPI(schema, ns, method, argus, sn) {

        if (!schema || !ns || !method) {

            // 非正常的 API 调用就不上报了
            return;
        }

        var uri = schema + '://' + ns + '/' + method;
        var a, i, l, m;

        argus = argus || [];

        if (!sn || !(aCallbacks[sn] || window[sn])) {

            // 尝试从参数中找到回调参数名作为 sn
            sn = null;
            for (i = 0, l = argus.length; i < l; i++) {
                a = argus[i];
                if (typeof a === 'object' && a !== null) {

                    a = a.callbackName || a.callback;
                }
                if (a && (aCallbacks[a] || window[a])) {
                    sn = a;
                    break;
                }
            }
        }

        if (sn) { // 记录 sn 和 uri 的对应关系
            aReports[sn] = {
                uri: uri,
                startTime: Date.now()
            };
            m = String(sn).match(/__MQQ_CALLBACK_(\d+)/);
            if (m) { //  兼容直接使用 createCallbackName 生成回调的情况
                aReports[m[1]] = aReports[sn];
            }
        }
        // Console.debug('sn: ' + sn, aReports);
        // 发上报请求
        Report.send(uri, CODE_API_CALL);
    }

    /**
     * 创建名字空间
     * @param  {String} name
     */
    function createNamespace(name) {
        var arr = name.split('.');
        var space = window;
        arr.forEach(function(a) {
            !space[a] && (space[a] = {});
            space = space[a];
        });
        return space;
    }

    /**
     * 创建回调的名字
     * @param  {Function} func
     * @param  {Boolean} deleteOnExec  为 true 则执行一次之后就删除该 function
     * @param  {Boolean} execOnNewThread
     * @return {String}
     */
    function createCallbackName(callback, deleteOnExec, execOnNewThread) {

        callback = (typeof callback === "function") ? callback : window[callback];
        if (!callback) {
            return;
        }

        var sn = storeCallback(callback);

        var name = '__MQQ_CALLBACK_' + sn;

        window[name] = function() {

            var argus = SLICE.call(arguments);

            fireCallback(sn, argus, deleteOnExec, execOnNewThread);

        };
        return name;
    }

    function storeCallback(callback) {
        var sn = UUIDSeed++;
        if (callback) {
            aCallbacks[sn] = callback;
        }
        return sn;
    }

    /**
     * 所有回调的最终被执行的入口函数
     */
    function fireCallback(sn, argus, deleteOnExec, execOnNewThread) {
        var callback = typeof sn === 'function' ? sn : (aCallbacks[sn] || window[sn]);
        var endTime = Date.now();
        argus = argus || [];
        // Console.debug('fireCallback, sn: ' + sn);
        if (typeof callback === 'function') {
            if (execOnNewThread) {
                setTimeout(function() {

                    callback.apply(null, argus);
                }, 0);
            } else {
                callback.apply(null, argus);
            }
        } else {

            console.log('mqqapi: not found such callback: ' + sn);
        }
        if (deleteOnExec) {
            delete aCallbacks[sn];
            delete window['__MQQ_CALLBACK_' + sn];
        }

        // Console.debug('sn: ' + sn + ', aReports[sn]: ' + aReports[sn])
        // 上报 API 调用返回
        if (aReports[sn]) {
            var obj = aReports[sn];
            delete aReports[sn];
            if (Number(sn)) {
                delete aReports['__MQQ_CALLBACK_' + sn];
            }
            var retCode = CODE_API_CALLBACK;

            // 提取返回结果中的 retCode
            var keys = ['retCode', 'retcode', 'resultCode', 'ret', 'code', 'r'];
            var a, j, n;
            // Console.debug(argus);
            if (argus.length) {
                a = argus[0]; // 只取第一个参数来判断

                if (typeof a === 'object' && a !== null) { // 返回码可能在 object 里
                    for (j = 0, n = keys.length; j < n; j++) {
                        if (keys[j] in a) {
                            retCode = a[keys[j]];
                            break;
                        }
                    }
                } else if (/^-?\d+$/.test(String(a))) { // 第一个参数是个整数, 认为是返回码
                    retCode = a;
                }
            }

            // 发上报请求
            Report.send(obj.uri + '#callback', retCode, endTime - obj.startTime);
        }
    }

    /**
     * android / iOS 5.0 开始, client回调 js, 都通过这个入口函数处理
     */
    function execGlobalCallback(sn /*, data*/ ) {
        Console.debug('execGlobalCallback: ' + JSON.stringify(arguments));

        var argus = SLICE.call(arguments, 1);

        if (exports.android && argus && argus.length) {

            // 对 android 的回调结果进行兼容
            // android 的旧接口返回会包装个 {r:0,result:123}, 要提取出来
            argus.forEach(function(data, i) {
                if (typeof data === 'object' && ('r' in data) && ('result' in data)) {
                    argus[i] = data.result;
                }
            });
        }

        fireCallback(sn, argus);
    }

    /**
     * 空的api实现, 用于兼容在浏览器调试, 让mqq的调用不报错
     */
    function emptyAPI() {
        // var argus = SLICE.call(arguments);
        // var callback = argus.length && argus[argus.length-1];
        // return (typeof callback === 'function') ? callback(null) : null;
    }

    /**
     * 创建 api 方法, 把指定 api 包装为固定的调用形式
     */
    function buildAPI(name, data) {
        var func = null;
        var index = name.lastIndexOf('.');
        var nsName = name.substring(0, index);
        var methodName = name.substring(index + 1);

        var ns = createNamespace(nsName);
        if (ns[methodName]) {

            // 已经有这个API了, 抛出异常
            throw new Error('[mqqapi]already has ' + name);
        }
        if (data.iOS && exports.iOS) {

            // 这里担心有业务没有判断方法是否存在就调用了, 还是去掉这个吧 az 2014/8/19
            // if (data.support && data.support.iOS) {
            //     if (exports.compare(data.support.iOS) > -1) {
            //         func = data.iOS;
            //     }
            // } else {
            func = data.iOS;
            // }
        } else if (data.android && exports.android) {

            // if (data.support && data.support.android) {
            //     if (exports.compare(data.support.android) > -1) {
            //         func = data.android;
            //     }
            // } else {
            func = data.android;
            // }
        } else if (data.browser) { // 某些 api 可能有浏览器兼容的方式
            func = data.browser;
        }
        ns[methodName] = func || emptyAPI;
        aSupports[name] = data.support;

    }

    function supportVersion(name) {

        var support = aSupports[name] || aSupports[name.replace('qw.', 'mqq.')];
        var env = exports.iOS ? 'iOS' : exports.android ? 'android' : 'browser';

        if (!support || !support[env]) {
            return false;
        }

        return exports.compare(support[env]) > -1;
    }

    /**
     * 使用 iframe 发起伪协议请求给客户端
     */
    function openURL(url, sn) {
        Console.debug('openURL: ' + url);
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'display:none;width:0px;height:0px;';
        var failCallback = function() {

            /*
                正常情况下是不会回调到这里的, 只有客户端没有捕获这个 url 请求,
                浏览器才会发起 iframe 的加载, 但这个 url 实际上是不存在的, 
                会触发 404 页面的 onload 事件
            */
            execGlobalCallback(sn, {
                r: -201,
                result: 'error'
            });
        };
        if (exports.iOS) {

            /* 
                ios 必须先赋值, 然后 append, 否者连续的 api调用会间隔着失败
                也就是 api1(); api2(); api3(); api4(); 的连续调用, 
                只有 api1 和 api3 会真正调用到客户端
            */
            iframe.onload = failCallback;
            iframe.src = url;
        }
        var container = document.body || document.documentElement;
        container.appendChild(iframe);

        /*
            android 这里必须先添加到页面, 然后再绑定 onload 和设置 src
            1. 先设置 src 再 append 到页面, 会导致在接口回调(callback)中嵌套调用 api会失败, 
                iframe会直接当成普通url来解析
            2. 先设置onload 在 append , 会导致 iframe 先触发一次 about:blank 的 onload 事件

         */
        if (exports.android) { // android 必须先append 然后赋值
            iframe.onload = failCallback;
            iframe.src = url;
        }

        // iOS 可以同步获取返回值, 因为 iframe 的url 被客户端捕获之后, 会挂起 js 进程
        var returnValue = exports.__RETURN_VALUE;
        exports.__RETURN_VALUE = undefined;

        // android 捕获了iframe的url之后, 也是中断 js 进程的, 所以这里可以用个 setTimeout 0 来删除 iframe
        setTimeout(function() {
            iframe.parentNode.removeChild(iframe);
        }, 0);

        return returnValue;
    }

    // 三星特供版, 从 4.2.1 开始有, 4.2.1 已经去掉了注入到全局对象的方法
    exports.__androidForSamsung = /_NZ\b/.test(ua);

    // android 的 jsbridge 协议开始支持的版本 4.5, 三星特供版也可以用 jsbridge 协议
    exports.__supportAndroidJSBridge = exports.android && (exports.compare('4.5') > -1 || exports.__androidForSamsung);

    // android 新 jsbridge 协议
    exports.__supportAndroidNewJSBridge = exports.android && exports.compare('4.7.2') > -1;

    function canUseNewProtocal(ns /*, method*/ ) {
        if (exports.iOS) { // iOS 旧版本的客户端也能很好兼容新协议
            return true;
        }
        if (exports.android && exports.__supportAndroidNewJSBridge) {

            if (NEW_PROTOCOL_BACK_LIST[ns] && exports.compare(NEW_PROTOCOL_BACK_LIST[ns]) < 0) {

                // 部分接口在 4.7.2 还不能使用新协议, 后续版本会修复该问题
                return false;
            }
            return true;
        }
        return false;
    }

    function invokeClientMethod(ns, method, argus, callback) {
        if (!ns || !method) {
            return null;
        }
        var url, sn; // sn 是回调函数的序列号
        argus = SLICE.call(arguments, 2);
        callback = argus.length && argus[argus.length - 1];

        if (callback && typeof callback === 'function') { // args最后一个参数是function, 说明存着callback
            argus.pop();
        } else if (typeof callback === 'undefined') {

            // callback 是undefined的情况, 可能是 api 定义了callback, 但是用户没传 callback, 这时候要把这个 undefined的参数删掉
            argus.pop();
        } else {
            callback = null;
        }

        // 统一生成回调序列号, callback 为空也会返回 sn 
        sn = storeCallback(callback);

        // 上报 API 调用, openURL 会阻塞 js 线程, 因此要先打点和上报
        if (method === 'pbReport' && argus[0] && argus[0].__internalReport) {

            // 内部的API调用就不要上报了, 否则就死循环了
        } else {
            reportAPI('jsbridge', ns, method, argus, sn);
        }

        if (exports.android && !exports.__supportAndroidJSBridge) {

            /* 
                兼容Android QQ 4.5以下版本的客户端API调用方式
                排除掉三星特供版, 他可以用 jsbridge 协议
            */
            if (window[ns] && window[ns][method]) {
                var result = window[ns][method].apply(window[ns], argus);
                if (callback) {

                    fireCallback(sn, [result]);
                } else {
                    return result;
                }
            } else if (callback) {
                fireCallback(sn, [exports.ERROR_NO_SUCH_METHOD]);
            }
        } else if (canUseNewProtocal(ns, method)) {

            /* 
                android 4.7 以上的支持 ios的协议, 但是客户端的旧接口需要迁移, 4.7赶不上, 需要等到 4.7.2
                jsbridge://ns/method?p=test&p2=xxx&p3=yyy#123
            */
            url = 'jsbridge://' + encodeURIComponent(ns) + '/' + encodeURIComponent(method);

            argus.forEach(function(a, i) {
                if (typeof a === 'object') {
                    a = JSON.stringify(a);
                }
                if (i === 0) {
                    url += '?p=';
                } else {
                    url += '&p' + i + '=';
                }
                url += encodeURIComponent(String(a));
            });

            if (method === 'pbReport') {

                /**
                 * pbReport 这个接口不能加回调序号, 这个接口本来就不支持回调
                 * 但是 android 的 jsbridge 即使接口没有回调结果, 也会调用一次 js 表示这次接口调用到达了客户端
                 * 同时, 由于 android 一执行 loadUrl('javascript:xxx') 就会导致软键盘收起
                 * 所以上报的时候经常会引发这个问题, 这里就直接不加回调序号了
                 */
            } else {

                // 加上回调序列号
                url += '#' + sn;
            }

            var r = openURL(url);
            if (exports.iOS) {

                // FIXME 这里可能会导致回调两次, 但是 iOS 4.7.2以前的接口是依靠这里实现异步回调, 因此要验证下
                r = r ? r.result : null;
                if (callback) {
                    fireCallback(sn, [r], false /*deleteOnExec*/ , true /*execOnNewThread*/ );
                } else {
                    return r;
                }
            }

        } else if (exports.android) { // android 4.7 以前的旧协议, 不能使用新协议的 android 会 fallback 到这里

            // jsbridge://ns/method/123/test/xxx/yyy
            url = 'jsbridge://' + encodeURIComponent(ns) + '/' + encodeURIComponent(method) + '/' + sn;

            argus.forEach(function(a) {
                if (typeof a === 'object') {
                    a = JSON.stringify(a);
                }
                url += '/' + encodeURIComponent(String(a));
            });

            openURL(url, sn);
        }

        return null;
    }

    // 执行原有的伪协议接口
    function invokeSchemaMethod(schema, ns, method, params, callback) {
        if (!schema || !ns || !method) {
            return null;
        }

        var argus = SLICE.call(arguments),
            sn;
        if (typeof argus[argus.length - 1] === 'function') {
            callback = argus[argus.length - 1];
            argus.pop();
        } else {
            callback = null;
        }
        if (argus.length === 4) {
            params = argus[argus.length - 1];
        } else {
            params = {};
        }
        if (callback) {
            params['callback_type'] = 'javascript';
            sn = createCallbackName(callback);
            params['callback_name'] = sn;
        }
        params['src_type'] = params['src_type'] || 'web';

        if (!params.version) {
            params.version = 1;
        }
        var url = schema + '://' + encodeURIComponent(ns) + '/' + encodeURIComponent(method) + '?' + toQuery(params);
        openURL(url);

        // 上报 API 调用
        reportAPI(schema, ns, method, argus, sn);
    }

    //////////////////////////////////// util /////////////////////////////////////////////////
    function mapQuery(uri) {
        var i,
            key,
            value,
            index = uri.indexOf("?"),
            pieces = uri.substring(index + 1).split("&"),
            params = {};
        for (i = 0; i < pieces.length; i++) {
            index = pieces[i].indexOf("=");
            key = pieces[i].substring(0, index);
            value = pieces[i].substring(index + 1);
            params[key] = decodeURIComponent(value);
        }
        return params;
    }

    function toQuery(obj) {
        var result = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                result.push(encodeURIComponent(String(key)) + "=" + encodeURIComponent(String(obj[key])));
            }
        }
        return result.join("&");
    }

    function removeQuery(url, keys) {
        var a = document.createElement('a');
        a.href = url;
        var obj;
        if (a.search) {
            obj = mapQuery(String(a.search).substring(1));
            keys.forEach(function(k) {
                delete obj[k];
            });
            a.search = '?' + toQuery(obj);
        }
        if (a.hash) {
            obj = mapQuery(String(a.hash).substring(1));
            keys.forEach(function(k) {
                delete obj[k];
            });
            a.hash = '#' + toQuery(obj);
        }
        url = a.href;
        a = null;

        return url;
    }

    //////////////////////////////////// end util /////////////////////////////////////////////////


    //////////////////////////////////// event /////////////////////////////////////////////////

    // 监听客户端或者其他 webview 抛出的事件
    function addEventListener(eventName, handler) {

        if (eventName === 'qbrowserVisibilityChange') {

            // 兼容旧的客户端事件
            document.addEventListener(eventName, handler, false);
            return true;
        }
        var evtKey = 'evt-' + eventName;
        (aCallbacks[evtKey] = aCallbacks[evtKey] || []).push(handler);
        return true;
    }

    // 移除事件监听, 如果没有传 handler, 就把该事件的所有监听都移除
    function removeEventListener(eventName, handler) {
        var evtKey = 'evt-' + eventName;
        var handlers = aCallbacks[evtKey];
        var flag = false;
        if (!handlers) {
            return false;
        }
        if (!handler) {
            delete aCallbacks[evtKey];
            return true;
        }

        for (var i = handlers.length - 1; i >= 0; i--) {
            if (handler === handlers[i]) {
                handlers.splice(i, 1);
                flag = true;
            }
        }

        return flag;
    }

    // 这个方法时客户端回调页面使用的, 当客户端要触发事件给页面时, 会调用这个方法
    function execEventCallback(eventName /*, data, source*/ ) {
        var evtKey = 'evt-' + eventName;
        var handlers = aCallbacks[evtKey];
        var argus = SLICE.call(arguments, 1);
        if (handlers) {
            handlers.forEach(function(handler) {
                fireCallback(handler, argus, false /*deleteOnExec*/ , true /*execOnNewThread*/ );
            });
        }
    }

    /**
    通知一个事件给客户端webview, 可以用于多个 webview 之间进行通信, 用 domains 来指定需要通知到的域名

    对应的协议为:
        jsbridge://event/dispatchEvent?p={
            event:eventName
            data:{...},
            options: {...}
        }#id

        options:
        {Boolean} [echo]: 当前webview是否能收到这个事件，默认为true
        {Boolean} [broadcast]: 是否广播模式给其他webview，默认为true
        {Array<String>} [domains]: 指定能接收到事件的域名，默认只有同域的webview能接收，支持通配符，比如‘*.qq.com’匹配所有qq.com和其子域、‘*’匹配所有域名。注意当前webview是否能接收到事件只通过echo来控制，这个domains限制的是非当前webview。
    */
    function dispatchEvent(eventName, data, options) {

        var params = {
            event: eventName,
            data: data || {},
            options: options || {}
        };

        if (exports.android && params.options.broadcast === false && exports.compare('5.2') <= 0) {
            // 对 android 的 broadcast 事件进行容错, broadcast 为 false 时, 
            // 没有 Webview会接收到该事件, 但客户端依然要能接收
            // 5.2 已经修复该问题
            params.options.domains = ['localhost'];
            params.options.broadcast = true;
        }

        var url = 'jsbridge://event/dispatchEvent?p=' + encodeURIComponent(JSON.stringify(params) || '');
        openURL(url);

        reportAPI('jsbridge', 'event', 'dispatchEvent');
    }


    //////////////////////////////////// end event /////////////////////////////////////////////////

    // for debug
    exports.__aCallbacks = aCallbacks;
    exports.__aReports = aReports;
    exports.__aSupports = aSupports;

    // for internal use
    exports.__fireCallback = fireCallback;
    exports.__reportAPI = reportAPI;

    exports.build = buildAPI;
    exports.support = supportVersion;
    exports.invoke = invokeClientMethod;
    exports.invokeSchema = invokeSchemaMethod;
    exports.callback = createCallbackName;
    exports.execGlobalCallback = execGlobalCallback;

    // util
    exports.mapQuery = mapQuery;
    exports.toQuery = toQuery;
    exports.removeQuery = removeQuery;

    // event
    exports.addEventListener = addEventListener;
    exports.removeEventListener = removeEventListener;

    exports.execEventCallback = execEventCallback;
    exports.dispatchEvent = dispatchEvent;

    return exports;

});;mqq.build('mqq.device.isMobileQQ', {
    iOS: function(callback) {
        var result = mqq.iOS;
        return callback ? callback(result) : result;
    },
    android: function(callback) {
        var result = mqq.android;
        return callback ? callback(result) : result;
    },
    browser: function(callback) {
        var result = mqq.android || mqq.iOS;
        return callback ? callback(result) : result;
    },
    support: {
        iOS: '4.2',
        android: '4.2'
    }
});;/**
 查询单个应用是否已安装
 @param {String} scheme 比如'mqq'
 @return {Boolean}
 */

mqq.build('mqq.app.isAppInstalled', {
    iOS: function(scheme, callback) {

        return mqq.invoke('app', 'isInstalled', {
            'scheme': scheme
        }, callback);
    },
    android: function(identifier, callback) {
        mqq.invoke('QQApi', 'isAppInstalled', identifier, callback);
    },
    support: {
        iOS: '4.2',
        android: '4.2'
    }
});;/**
 批量查询指定应用是否已安装
 @param {Array<String>} schemes 比如['mqq', 'mqqapi']
 @return {Array<Boolean>}
 */

mqq.build('mqq.app.isAppInstalledBatch', {
    iOS: function(schemes, callback) {

        return mqq.invoke('app', 'batchIsInstalled', {
            'schemes': schemes
        }, callback);
    },
    android: function(identifiers, callback) {
        identifiers = identifiers.join('|');

        mqq.invoke('QQApi', 'isAppInstalledBatch', identifiers, function(result) {
            var newResult = [];

            result = (result + '').split('|');
            for (var i = 0; i < result.length; i++) {
                newResult.push(parseInt(result[i]) === 1);
            }

            callback(newResult);
        });
    },
    support: {
        iOS: '4.2',
        android: '4.2'
    }
});;/**
 * 使用 schema(iOS) 或者 包名 (android) 启动一个 app
 */

mqq.build('mqq.app.launchApp', {
    iOS: function(params) {

        mqq.invokeSchema(params.name, 'app', 'launch', params);
    },
    android: function(params) {

        mqq.invoke('QQApi', 'startAppWithPkgName', params.name);
    },
    support: {
        iOS: '4.2',
        android: '4.2'
    }
});;mqq.build('mqq.app.launchAppWithTokens', {
    iOS: function(params, paramsStr) {
        //判断参数是4.6的接口样式
        if (typeof params === 'object') {
            return mqq.invoke('app', 'launchApp', params);
        }
        //判断参数是4.5的接口样式
        return mqq.invoke('app', 'launchApp', {
            'appID': params,
            'paramsStr': paramsStr
        });
    },
    android: function(params) {
        if (mqq.compare('5.2') >= 0) {
            mqq.invoke('QQApi', 'launchAppWithTokens', params);
        } else if (mqq.compare('4.6') >= 0) {
            mqq.invoke('QQApi', 'launchAppWithTokens', params.appID,
                params.paramsStr, params.packageName, params.flags || params.falgs || 0);
        } else {
            mqq.invoke('QQApi', 'launchApp', params.appID,
                params.paramsStr, params.packageName);
        }
    },
    support: {
        iOS: '4.6',
        android: '4.6'
    }
});;/**
 发送趣味表情
 @param type 业务类型，一起玩为funnyFace
 @param sessionType 会话类型，1（群）、2（讨论组）、3（C2C聊天）
 @param gcode 会话ID，针对群，这里是外部可见的群号
 @param guin 针对群，这里是内部群号。讨论组和C2C类型这里指定为0
 @param faceID 标识特定表情，到connect.qq.com上申请
 */

mqq.build('mqq.app.sendFunnyFace', {
    iOS: function(params) {
        mqq.invoke('app', 'sendFunnyFace', params);
    },
    android: function(params) {
        mqq.invoke('qbizApi', 'sendFunnyFace', params.type, params.sessionType,
            params.gcode, params.guin, params.faceID);
    },
    support: {
        iOS: '4.6',
        android: '4.6'
    }
});;/**
 * 通过packageName(Android)获取本地指定应用的本版号
 *
 * @for qw.app
 * @method checkAppInstalled
 * @param {String} identifier 要查询的 identifier。如：Android 微信是 "com.tencent.mm"。
 * @param {Function} callback 回调函数
 * 	@param {String} callback.result 返回查询结果。正常返回 app 的版本号字符串，若没有查询到则返回 0 字符串
 * @example
 * ```
 * var id = 'com.tencent.mm';
 *
 * qw.app.checkAppInstalled(id, function (ret) {
 *     console.log(ret); // 5.3.1
 * });
 * ```
 * @support androidVersion 4.2
 * @androidAutoTest com.tencent.mm
 */
mqq.build('mqq.app.checkAppInstalled', {
    android: function(identifier, callback){
        mqq.invoke('QQApi', 'checkAppInstalled', identifier, callback);
    },
    support: {
        android: '4.2'
    }
});


;/**
 * 通过packageName(Android)批量获取本地应用的版本号
 *
 * @for qw.app
 * @method checkAppInstalledBatch
 * @param {Array<String>} identifiers 要查询的 identifier 数组。如：Android 微信是 "com.tencent.mm"
 * @param {Function} callback 回调函数
 *  @param {Array<String>} callback.result 返回查询结果。正常返回 app 的版本号字符串，若没有查询到则返回 0 字符串
 * @example
 * ```
 * qw.app.checkAppInstalledBatch(["com.tencent.mobileqq", "no.no.no"], function(ret){
 *     console(JSON.stringify(ret)); // ["4.7.1", "0"]
 * });
 * ```
 * @support androidVersion 4.2
 * @androidAutoTest ["com.tencent.mobileqq", "com.tencent.mm"]
 */
mqq.build('mqq.app.checkAppInstalledBatch', {
    android: function(identifiers, callback){
        identifiers = identifiers.join('|');

        mqq.invoke('QQApi', 'checkAppInstalledBatch', identifiers, function (result) {
            result = (result || '').split('|');
            callback(result);
        });
    },
    support: {
        android: '4.2'
    }
});


;