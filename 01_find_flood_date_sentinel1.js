/*****************************************************************
 PROJECT B – Step 1 (v4): find the 2024 flood date
 2024 floods and displacement settlements, Sudan
 Regions: Gash/Kassala, Shagarab camps, White Nile camps
 Method: Sentinel-1 VH change detection vs a normal year
         (same dates +/- 8 days, 2017-2023, same track) + dark-sand mask
 Author: Hosam Hasan Abdalla
*****************************************************************/

// ================= SETTINGS (edit AOI_NAME only) =================
var AOI_NAME = 'GashKassala';   // 'GashKassala', 'Shagarab' or 'WhiteNileCamps'

var REGIONS = {
  'GashKassala': {   // Kassala town, Wad Sherifey, Gash River north to Aroma
    box: ee.Geometry.Rectangle([36.00, 15.30, 36.60, 15.95]),
    start: '2024-06-01', end: '2024-10-31', show: '2024-07-24', zoom: 10
  },
  'Shagarab': {      // Shagarab refugee camps, ~80 km south of Kassala (CHECK on the map)
    box: ee.Geometry.Rectangle([35.70, 14.85, 36.05, 15.15]),
    start: '2024-06-01', end: '2024-10-31', show: '2024-07-24', zoom: 11
  },
  'WhiteNileCamps': { // Kosti south to Al Jabalain: As Salam + Al Jabalain camps
    box: ee.Geometry.Rectangle([32.40, 12.40, 33.00, 13.20]),
    start: '2024-07-01', end: '2024-11-30', show: '2024-09-15', zoom: 10
  }
};

var R = REGIONS[AOI_NAME];
var aoi = R.box;
var SHOW_DATE = R.show;      // after the first run, set this to the tallest bar's date

var THRESHOLD = 1.25;        // UN-SPIDER, same as Project A
var WINDOW_DAYS = 8;         // baseline = same dates +/- 8 days in 2017-2023
var MIN_BEFORE_DB = -22;     // ignore pixels very dark even in a normal year (dry sand)

// ================= DATA =================
var s1all = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filterBounds(aoi)
  .select('VH');
var s1 = s1all.filterDate(R.start, R.end);
print('Study area:', AOI_NAME, '2024 images:', s1.size());

var perm = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('seasonality').gte(10).unmask(0);

var boxHa = ee.Number(ee.Image.pixelArea().reduceRegion({
  reducer: ee.Reducer.sum(), geometry: aoi, scale: 30, maxPixels: 1e10
}).get('area')).divide(10000);

var sumHa = function (img) {
  return ee.Number(img.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: aoi, scale: 30,
    maxPixels: 1e10, bestEffort: true
  }).values().get(0)).divide(10000);
};

// Normal-year baseline for one 2024 image (same dates, same track)
var baselineFor = function (img) {
  var doy = img.date().getRelative('day', 'year').add(1);
  return s1all
    .filterDate('2017-01-01', '2024-01-01')
    .filter(ee.Filter.eq('relativeOrbitNumber_start', img.get('relativeOrbitNumber_start')))
    .filter(ee.Filter.calendarRange(doy.subtract(WINDOW_DAYS), doy.add(WINDOW_DAYS), 'day_of_year'));
};

// New water in one 2024 image
var newWaterFor = function (img) {
  var before = baselineFor(img).median().focal_mean(50, 'circle', 'meters');
  var after  = img.focal_mean(50, 'circle', 'meters');
  return after.divide(before).gt(THRESHOLD)
    .and(before.gt(MIN_BEFORE_DB))
    .and(perm.not());
};

// ================= NEW WATER PER IMAGE =================
var stats = s1.map(function (img) {
  return ee.Feature(null, {
    date: img.date().format('YYYY-MM-dd'),
    orbit: img.get('relativeOrbitNumber_start'),
    baseline_imgs: baselineFor(img).size(),
    new_water_ha: sumHa(newWaterFor(img)),
    coverage_pct: sumHa(img.mask()).divide(boxHa).multiply(100)
  });
}).sort('date');

print(ui.Chart.feature.byFeature(stats, 'date', ['new_water_ha'])
  .setChartType('ColumnChart')
  .setOptions({title: 'New water vs a normal year, ' + AOI_NAME + ' 2024',
               vAxis: {title: 'ha'}, legend: {position: 'none'}}));
print(ui.Chart.feature.byFeature(stats, 'date',
      ['orbit', 'baseline_imgs', 'new_water_ha', 'coverage_pct']).setChartType('Table'));

// ================= MAP =================
var showImg = ee.Image(s1.filterDate(SHOW_DATE, ee.Date(SHOW_DATE).advance(1, 'day')).first());
print('Map shows image of:', SHOW_DATE, '(if error: no image that day, pick a date from the table)');

Map.setOptions('SATELLITE');
Map.centerObject(aoi, R.zoom);
Map.addLayer(ee.Image().paint(aoi, 0, 2), {palette: ['ff0000']}, 'Study box');
Map.addLayer(perm.selfMask(), {palette: ['0000aa']}, 'Permanent water (JRC)', false);
Map.addLayer(showImg, {min: -25, max: 0}, 'Radar ' + SHOW_DATE, false);
Map.addLayer(newWaterFor(showImg).selfMask(), {palette: ['00bfff']}, 'New water ' + SHOW_DATE);
