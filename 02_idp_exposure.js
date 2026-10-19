// PROJECT B - Step 2 (v2): flood susceptibility of IDP locations, Kassala 2024
// IDP locations: IOM DTM Sudan, IDP Master List 25-04-2024 (lat/lon corrected)
// Author: Hosam Hasan Abdalla

// 1. IDP LOCATIONS  [name, locality (H=Halfa Aj Jadeedah, K=Kassala town, D=Shamal Ad Delta), lon, lat, IDPs]
var rows = [
  ['Hai Al Masnea','H',35.5522,15.4801,1600],['Hai Alabasia','H',35.5956,15.3412,460],['Hai Algafla','H',35.7313,15.3409,480],
  ['Hai Aljabl','H',35.5931,15.3403,900],['Hai Alomal','H',35.5638,15.4674,530],['Hai Althoura','H',35.6170,15.3256,6150],
  ['Hai Emtdad Almahalg','H',35.6051,15.3235,280],['Halfa Aljadeda(Town)','H',35.6096,15.3233,8790],['Village 1','H',35.7275,15.1469,1235],
  ['Village 11','H',35.5969,15.2511,1530],['Village 21','H',35.5805,15.3795,510],['Abw Khamsa','K',36.4096,15.4561,600],
  ['Al-Kara','K',36.3901,15.4565,990],['Hai Al Inqaz','K',36.4311,15.4536,75],['Hai Alamarganya','K',36.4100,15.4446,2385],
  ['Hai Alamria','K',36.2468,15.2668,1800],['Hai Alarab','K',36.3413,15.4555,2875],['Hai Alhalnga Wast','K',36.4063,15.4793,1050],
  ['Hai Aljesir','K',36.3923,15.4519,50],['Hai Alkhatmia','K',36.4197,15.4404,2500],['Hai Alkhatmia Aljadeda','K',36.4089,15.4688,520],
  ['Hai Alkmayn','K',36.4040,15.4583,155],['Hai Alkrmta','K',36.3504,15.4804,3070],['Hai Almorbat','K',36.4104,15.4577,625],
  ['Hai Almurqanya Shmal','K',36.3979,15.4499,255],['Hai Alomal','K',36.3641,15.4430,500],['Hai Alpoice','K',36.4018,15.4562,625],
  ['Hai Alrehab','K',36.4133,15.4383,15],['Hai Alsawagi Aljunobia','K',36.3863,15.4346,2430],['Hai Alsawaqi Alshamlya','K',36.3409,15.4606,1905],
  ['Hai Alshabya','K',36.4272,15.4564,615],['Hai Alsheed Taj Alsir','K',36.4026,15.4338,550],['Hai Alshheed','K',36.3510,15.4124,60],
  ['Hai Alsjoon','K',36.3994,15.4710,255],['Hai Alsoruiba','K',36.4028,15.4441,1300],['Hai Alsoug Alshabi','K',36.3510,15.4225,2015],
  ['Hai Althoura','K',36.4106,15.4564,40],['Hai Altorua Shmal','K',36.4024,15.4557,500],['Hai Altoura Janoub','K',36.4101,15.4490,270],
  ['Hai Altoura Wast','K',36.2458,15.1710,935],['Hai Alwali','K',36.4118,15.4601,660],['Hai Arshai','K',36.3384,15.4619,20],
  ['Hai Bant','K',36.3668,15.4488,4105],['Hai Mokram','K',36.4316,15.4652,670],['Hai Qarb Alqash','K',36.3517,15.4502,1345],
  ['Hai Reiba','K',36.3415,15.4215,35],['Awaleib Village','D',36.1876,16.0569,325],['Wagar Village','D',36.2061,16.1522,265]
];
var LOC = {H: 'Halfa Aj Jadeedah', K: 'Madeinat Kassala', D: 'Reifi Shamal Ad Delta'};
var dtm = ee.FeatureCollection(rows.map(function (r) {
  return ee.Feature(ee.Geometry.Point([r[2], r[3]]), {name: r[0], locality: LOC[r[1]], idps: r[4]});
}));
print('IDP locations:', dtm.size(), 'IDPs:', dtm.aggregate_sum('idps'));

// 2a. Relative elevation: height minus average within 250 m (negative = low ground)
//     (250 m, not 500 m: a larger window near the Taka hills gave false "deep hollows")
var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM').mosaic()
  .setDefaultProjection('EPSG:4326', null, 30);
var relElev = dem.subtract(dem.focal_mean(250, 'circle', 'meters')).rename('rel_elev_m');

// 2b. Upstream drainage area (km2), MERIT Hydro
var upa = ee.Image('MERIT/Hydro/v1_0_1').select('upa').rename('upstream_km2');
var p90 = upa.projection();

// 2c. Distance to the Gash / main channels (> 1,000 km2), at 90 m pixels
//     (0/1 image, NOT selfMasked: distance() ignores masked pixels)
var channels = upa.gt(1000);
var distChannel = channels.distance(ee.Kernel.euclidean(20000, 'meters'))
  .reproject({crs: p90}).unmask(20000).rename('dist_channel_m');

// 2d. Distance to steep hills (slope > 15 deg), e.g. Taka mountains: runoff source
var hills = ee.Terrain.slope(dem).gt(15).reproject({crs: p90});
var distHill = hills.distance(ee.Kernel.euclidean(5000, 'meters'))
  .reproject({crs: p90}).unmask(5000).rename('dist_hill_m');

// 2e. Rainfall 24-28 July 2024: CHIRPS (~5 km) and GPM IMERG (~10 km), mm
var rain = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate('2024-07-24', '2024-07-29').sum().rename('rain_chirps_mm');
var imerg = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
  .filterDate('2024-07-24', '2024-07-29').select('precipitation')
  .sum().multiply(0.5).rename('rain_imerg_mm');   // mm/hr every 30 min -> mm

var stack = relElev.addBands(upa).addBands(distChannel).addBands(distHill)
  .addBands(rain).addBands(imerg);

// 3. Values at each location (150 m around the point), lowest ground first
var sites = stack.reduceRegions({
  collection: dtm.map(function (f) { return f.buffer(150); }),
  reducer: ee.Reducer.mean(), scale: 30
}).sort('rel_elev_m');

print(ui.Chart.feature.byFeature(sites, 'name',
  ['idps', 'rel_elev_m', 'dist_channel_m', 'dist_hill_m', 'rain_chirps_mm', 'rain_imerg_mm'])
  .setChartType('Table'));

// 4. Export (Tasks tab -> RUN)
Export.table.toDrive({
  collection: sites, description: 'IDP_exposure_Kassala_2024_v2',
  folder: 'ProjectB_GEE', fileFormat: 'CSV',
  selectors: ['name', 'locality', 'idps', 'rel_elev_m', 'upstream_km2', 'dist_channel_m', 'dist_hill_m', 'rain_chirps_mm', 'rain_imerg_mm']
});

// 5. Map
var box = ee.Geometry.Rectangle([35.45, 15.10, 36.55, 16.20]);
Map.setOptions('SATELLITE');
Map.setCenter(36.39, 15.45, 13);
Map.addLayer(relElev.clip(box), {min: -3, max: 3, palette: ['0000ff', 'ffffff', 'a0522d']}, 'Relative elevation (blue = low)');
Map.addLayer(channels.selfMask().clip(box), {palette: ['00ffff']}, 'Gash / main channels');
Map.addLayer(hills.selfMask().clip(box), {palette: ['ff0000']}, 'Steep hills (> 15 deg)', false);
Map.addLayer(dtm, {color: 'ff8800'}, 'IDP locations (IOM DTM)');
