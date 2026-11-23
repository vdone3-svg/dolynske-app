(function() {
  // d3 mock
  window.d3 = {
    format: function() { return function(v) { return String(v); }; },
    json: function() { return Promise.resolve(null); },
    csv: function() { return Promise.resolve([]); },
    select: function() {
      var dummy = {
        node: function() { return null; },
        append: function() { return dummy; },
        style: function() { return dummy; },
        attr: function() { return dummy; },
        text: function() { return dummy; },
        html: function() { return dummy; },
        call: function() { return dummy; },
        on: function() { return dummy; },
        remove: function() { return dummy; },
        selectAll: function() {
          return {
            data: function() {
              return { join: function() { return dummy; }, remove: function() { return dummy; } };
            },
            remove: function() { return dummy; }
          };
        }
      };
      return dummy;
    },
    scaleLinear: function() {
      var s = function(v) { return v; };
      s.domain = function() { return s; };
      s.range  = function() { return s; };
      s.nice   = function() { return s; };
      s.clamp  = function() { return s; };
      return s;
    },
    scaleBand: function() {
      var s = function(v) { return 0; };
      s.domain    = function() { return s; };
      s.range     = function() { return s; };
      s.padding   = function() { return s; };
      s.bandwidth = function() { return 10; };
      return s;
    },
    scaleOrdinal: function() {
      var s = function(v) { return '#888'; };
      s.domain = function() { return s; };
      s.range  = function() { return s; };
      return s;
    },
    axisBottom: function() { var a = function() {}; a.tickFormat = function() { return a; }; a.ticks = function() { return a; }; return a; },
    axisLeft:   function() { var a = function() {}; a.tickFormat = function() { return a; }; a.ticks = function() { return a; }; return a; },
    line: function() { var l = function() { return ''; }; l.x = function() { return l; }; l.y = function() { return l; }; l.defined = function() { return l; }; l.curve = function() { return l; }; return l; },
    area: function() { var a = function() { return ''; }; a.x = function() { return a; }; a.y0 = function() { return a; }; a.y1 = function() { return a; }; a.defined = function() { return a; }; a.curve = function() { return a; }; return a; },
    curveMonotoneX: {},
    rollup: function() { return new Map(); },
    group: function(arr, fn) {
      var m = new Map();
      if (arr && fn) arr.forEach(function(d) {
        var k = fn(d);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(d);
      });
      return m;
    },
    sum: function(arr, fn) { return (arr||[]).reduce(function(s,d) { return s + (fn ? fn(d) : d); }, 0); },
    max: function(arr, fn) { var mx = -Infinity; (arr||[]).forEach(function(d) { var v = fn?fn(d):d; if(v>mx) mx=v; }); return mx; },
    min: function(arr, fn) { var mn = Infinity;  (arr||[]).forEach(function(d) { var v = fn?fn(d):d; if(v<mn) mn=v; }); return mn; },
    extent: function(arr, fn) { return [window.d3.min(arr,fn), window.d3.max(arr,fn)]; },
    schemeTableau10: ['#888','#999','#aaa','#bbb','#ccc','#ddd','#eee','#fff','#111','#222'],
    schemeSet2: ['#888','#999','#aaa','#bbb','#ccc','#ddd','#eee','#fff'],
  };

  // XLSX mock
  window.XLSX = {
    read: function() { return { SheetNames: [], Sheets: {} }; },
    utils: {
      sheet_to_json: function() { return []; },
      aoa_to_sheet: function() { return {}; },
      book_new: function() { return { SheetNames: [], Sheets: {} }; },
      book_append_sheet: function() {},
      encode_cell: function(c) { return String.fromCharCode(65 + c.c) + String(c.r + 1); },
    },
    writeFile: function() {},
  };

  // Leaflet mock
  window.L = {
    map: function() {
      return { setView: function() { return this; }, addLayer: function() { return this; },
               on: function() { return this; }, remove: function() {} };
    },
    tileLayer: function() { return { addTo: function() { return this; } }; },
    marker: function() { return { addTo: function() { return this; }, bindPopup: function() { return this; }, openPopup: function() { return this; } }; },
    icon: function() { return {}; },
    layerGroup: function() { return { addTo: function() { return this; }, clearLayers: function() {}, addLayer: function() {} }; },
    control: { layers: function() { return { addTo: function() { return this; } }; } },
    LatLng: function(a, b) { this.lat = a; this.lng = b; },
    CRS: { EPSG3857: {} },
  };

  // Disable Service Worker
  if ('serviceWorker' in navigator) {
    Object.defineProperty(navigator, 'serviceWorker', {
      get: function() {
        return {
          register: function() { return Promise.reject(new Error('sw-disabled')); },
          getRegistration: function() { return Promise.resolve(undefined); }
        };
      }
    });
  }
})();
