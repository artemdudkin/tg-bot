/** jq-min 0.2.0*/ 

//TODO fix show/hide
//TODO should I use fetch polyfill?
//TODO unit-tests?

/**
* jQuery-like ajax IE9+
* 
*  url [mandatory]
*  method           == POST by default
*  headers          == array of header; adds 'Content-Type'='application/json' by default
*  data             == data to send (not stringified if json)
*  success(responseText, data) == success callback, where data is parsed json from responseText
*  fail(status, statusText, responseText) == fail callback
**/
function ajax(opt){
	if (typeof opt.url !== 'string') {
		console.error("No URL at ajax. Doing nothing.");
		return;
	}

	var xhr = new XMLHttpRequest();

	xhr.open(opt.method || 'POST', encodeURI(opt.url));

	// set headers
	let content_type_defined = false;
        if (opt.headers instanceof Array) {
		opt.headers.forEach( _itm => {
	        	xhr.setRequestHeader(_itm.name, _itm.value);
			if (_itm.name.toLowerCase() === 'content-type') content_type_defined = true;
		})
        }
        if (!content_type_defined && !(opt.data instanceof FormData)) { // should not add any Content-Type if it is FormData
          xhr.setRequestHeader('Content-Type', 'application/json');
        }

	xhr.onreadystatechange = function() {
		if (this.readyState != 4) return;
		if (xhr.status === 200) {
			var data; try { data = JSON.parse(xhr.responseText); } catch (e) {}
			if (opt.success) opt.success(xhr.responseText, data);
		} else { //if (xhr.status !== 200)
			if (opt.fail) opt.fail(xhr.status, xhr.statusText, xhr.responseText);
		}
	};
	xhr.send( opt.data ? (opt.data instanceof FormData || typeof opt.data === 'string' ? opt.data : JSON.stringify(opt.data)) : undefined);
}


/**
 * jQuery-like ajax IE9+ (promisified)
 *
 *  url [mandatory]
 *  method          == POST by default
 *  headers         == array of {name, value}; adds 'Content-Type'='application/json' by default
 *  data            == data to send (not stringified if json)
 *
 * @returns Promise
 *  @resolve(responseText, data) == success callback, where data is parsed json from responseText
 *  @reject(status, statusText, responseText)
 */
function ajax_p(opt){
  return new Promise(function(resolve, reject){
    opt.success = function(responseText, data) {
      resolve({responseText, data});
    }
    opt.fail = function(status, statusText, responseText) {
      reject({status, statusText, responseText});
    }
    ajax(opt);
  });
}


/**
* jQuery-like lib (with method chaining) IE9+
* 
*  $(...)                          == select all elements at page by css selector
*  $('<div id="123"></div>')       == creates new element(s) (returns array)
*  find('div a')                   == find all children of all elements by selector
*  html()                          == returns innerHTML of first element
*  html('aaa')                     == set up innerHTML for all elements
*  css('font-size')                == returns css value of first element
*  css('color:red;font-size:20px') == set up css for all elements 
*  addClass                        == add class to all elements
*  removeClass
*  hasClass                        == whether any element has specified class
*  toggleClass
*  event handlers, like $(...).click(f) where f is function == appends new event handler
**/
var $ = (function(){

//main function of constructor of $
//creates or find DOM nodes by specified css-selector
function findOrCreate(str_selector, parent){
	if (!parent) parent = document;

        var ret = [];
	if (typeof str_selector === 'string' && str_selector.trim().indexOf('<') == 0) {//creates DOM nodes like this $('<div class="a">b</div>')
                if (str_selector.trim().indexOf('<tr') == 0) {
			var e = document.createElement('table');
			e.innerHTML = str_selector;
			ret = e.tBodies[0].childNodes;
                } else if (str_selector.trim().indexOf('<td') == 0) {
			var e = document.createElement('table');
			e.innerHTML = '<tr>' + str_selector + '</tr>';
			ret = e.tBodies[0].childNodes[0].childNodes;
                } else {
			var e = document.createElement('div');
			e.innerHTML = str_selector;
			ret = e.childNodes;
		}
	} else if (str_selector instanceof Node || str_selector instanceof Window) {
	    ret = [str_selector] // if it is real dom node
	} else if (str_selector && typeof str_selector.html === 'function') {
		ret = str_selector; //if it is already $object, then just return it
	} else {
		ret = parent.querySelectorAll(str_selector);
	}
	ret = Array.prototype.slice.call(ret); //convert NodeList to array
	return ret;
}

//for $(...).<event>()
//apply addEventListener to all elements (if callback provided)
function eventFunc (name){ 
	return function(f){ 
		for (var i=0; i<this.length; i++) this[i].addEventListener(name, f);
		return this;
	}; 
}
var events = [
'click', 'contextmenu', 'dblclick', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseover', 'mouseout', 'mouseup', //Mouse Events
'keydown', 'keypress', 'keyup', //Keyboard Events
'abort', 'beforeunload', 'error', 'hashchange', 'load', 'pageshow', 'pagehide', 'resize', 'scroll', 'unload', //Frame/Object Events
'blur', 'change', 'focus', 'focusin', 'focusout', 'input', 'invalid', 'reset', 'search', 'select', 'submit', //Form Events
'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop' //Drag Events
];

//for $(...).css()
//dump computed style of element (from http://stackoverflow.com/questions/15000163/how-to-get-all-css-of-element)
function dumpCSSText(element){
	var s = '';
	var o = getComputedStyle(element);
	for(var i = 0; i < o.length; i++){
		s+=o[i] + ':' + o.getPropertyValue(o[i])+';';
	}
	return s;
}

//for $(...).css()
// translates css props to camelCase, i.e. 'font-size' to 'fontSize' (from jQuery core.js 20160315)
var rmsPrefix = /^-ms-/;
var rdashAlpha = /-([a-z])/g;
var fcamelCase = function( all, letter ) {
	return letter.toUpperCase();
};
var camelCase = function( string ) {
	return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
}

//for $(...).addClass / removeClass / hasClass
var parseClass = function(el, classToRemove) {
	var classes = (el.className || '').split(' ');
	var i=0; 
	while(i<classes.length) if (!classes[i] || classes[i]===classToRemove) classes.splice(i, 1); else i++;
	return classes;
}




function $(selector, parent){
        if (!(selector instanceof Array)) selector = [selector];

	var ret = [];
        for (var i=0; i<selector.length; i++) ret = ret.concat(findOrCreate(selector[i], parent));

	for (var i in $.fn) if (typeof $.fn[i] === 'function') ret[i] = $.fn[i].bind(ret);

	return ret;				
}

$.fn = {}

//allow add event listeners just by name, like $(...).click(...)
for (var i in events) $.fn[events[i]] = eventFunc(events[i]);

$.fn.show = function() { 
	for (var i=0; i<this.length; i++) this[i].style.display='';     
	return this;
}

$.fn.hide = function() { 
	for (var i=0; i<this.length; i++) this[i].style.display='none'; 
	return this;
}

$.fn.remove = function() { 
	for (var i=0; i<this.length; i++) this[i].remove();
	return this;
}

$.fn.find = function(selector){ 
	var ret = [];
	for (var i=0; i<this.length; i++) {
		ret = ret.concat( findOrCreate(selector, this[i]));
	}
	return $(ret);
}

$.fn.html = function(h){ 
		if (h) {
			for (var i=0; i<this.length; i++) this[i].innerHTML = h;
			return this; 
		} else {
			return this[0].innerHTML;
		}
		return this;
}
$.fn.css = function(c) {
		if (c) {
			if (c.indexOf(':')<0) {// c is css name -> return this css property of first element
				if (this.length > 0) { 
					var css = dumpCSSText(this[0]).split(';');
					for (var j in css) {
						if (css[j]) {
							var t = css[j].split(':');
							if (t[0] === c) return t[1];
						}
					}
				}
			} else {// c is css style like 'color:red;font-size:16px' -> apply it to all elements
				var css = c.split(';');
				for (var j in css) if (css[j]) css[j] = css[j].split(':');

				for (var i=0; i<this.length; i++) {
					for (var j in css) {
						if (css[j]) this[i].style[camelCase(css[j][0].trim())]=css[j][1];
					}
				}
			}
		} else {//if c==null just return all css of first element
		    return dumpCSSText(this[0]);
		}
		return this;
};
$.fn.hasClass = function(c) {
		var ret = false;
		for (var i=0; i<this.length; i++) {
			var classes = parseClass(this[i]);
			if (classes.indexOf(c)>=0) ret = true;
		}
		return this;
};
$.fn.addClass = function(c) {
		for (var i=0; i<this.length; i++) {
			var classes = parseClass(this[i]);
			if (classes.indexOf(c)<0) classes.push(c);
			this[i].className = classes.join(' ');
		} 
		return this;
};
$.fn.removeClass = function(c) {
		for (var i=0; i<this.length; i++) {
			var classes = parseClass(this[i], c);
			this[i].className = classes.join(' ');
		}
		return this;
};
$.fn.toggleClass = function(c) {
		if (this.hasClass(c)) {
			this.removeClass(c);
		} else {
			this.addClass(c);
		}
		return this;
};

return $;

})();
