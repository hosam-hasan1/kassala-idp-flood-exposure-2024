# ===== PROJECT B – IDP flood exposure map, Kassala town, July 2024 =====
# Run in Google Colab. Input: IDP_exposure_Kassala_2024_v2.csv exported from
# Earth Engine (projectB/step2_idp_exposure) to Google Drive folder ProjectB_GEE.
#
# In Colab, first run (one cell):
#   !pip install -q contextily matplotlib-scalebar
#   from google.colab import drive; drive.mount('/content/drive')

FOLDER = '/content/drive/MyDrive/ProjectB_GEE'
CSV = f'{FOLDER}/IDP_exposure_Kassala_2024_v2.csv'
USE_BASEMAP = True          # satellite background (needs internet)

import numpy as np, pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter, MultipleLocator
from matplotlib_scalebar.scalebar import ScaleBar

# ---------- 1. Read and classify ----------
d = pd.read_csv(CSV)
# coordinates (from the IOM DTM list) for each site name + locality
COORDS = {
 ('Abw Khamsa','Madeinat Kassala'):(36.4096,15.4561), ('Al-Kara','Madeinat Kassala'):(36.3901,15.4565),
 ('Hai Al Inqaz','Madeinat Kassala'):(36.4311,15.4536), ('Hai Alamarganya','Madeinat Kassala'):(36.4100,15.4446),
 ('Hai Alarab','Madeinat Kassala'):(36.3413,15.4555), ('Hai Alhalnga Wast','Madeinat Kassala'):(36.4063,15.4793),
 ('Hai Aljesir','Madeinat Kassala'):(36.3923,15.4519), ('Hai Alkhatmia','Madeinat Kassala'):(36.4197,15.4404),
 ('Hai Alkhatmia Aljadeda','Madeinat Kassala'):(36.4089,15.4688), ('Hai Alkmayn','Madeinat Kassala'):(36.4040,15.4583),
 ('Hai Alkrmta','Madeinat Kassala'):(36.3504,15.4804), ('Hai Almorbat','Madeinat Kassala'):(36.4104,15.4577),
 ('Hai Almurqanya Shmal','Madeinat Kassala'):(36.3979,15.4499), ('Hai Alomal','Madeinat Kassala'):(36.3641,15.4430),
 ('Hai Alpoice','Madeinat Kassala'):(36.4018,15.4562), ('Hai Alrehab','Madeinat Kassala'):(36.4133,15.4383),
 ('Hai Alsawagi Aljunobia','Madeinat Kassala'):(36.3863,15.4346), ('Hai Alsawaqi Alshamlya','Madeinat Kassala'):(36.3409,15.4606),
 ('Hai Alshabya','Madeinat Kassala'):(36.4272,15.4564), ('Hai Alsheed Taj Alsir','Madeinat Kassala'):(36.4026,15.4338),
 ('Hai Alshheed','Madeinat Kassala'):(36.3510,15.4124), ('Hai Alsjoon','Madeinat Kassala'):(36.3994,15.4710),
 ('Hai Alsoruiba','Madeinat Kassala'):(36.4028,15.4441), ('Hai Alsoug Alshabi','Madeinat Kassala'):(36.3510,15.4225),
 ('Hai Althoura','Madeinat Kassala'):(36.4106,15.4564), ('Hai Altorua Shmal','Madeinat Kassala'):(36.4024,15.4557),
 ('Hai Altoura Janoub','Madeinat Kassala'):(36.4101,15.4490), ('Hai Alwali','Madeinat Kassala'):(36.4118,15.4601),
 ('Hai Arshai','Madeinat Kassala'):(36.3384,15.4619), ('Hai Bant','Madeinat Kassala'):(36.3668,15.4488),
 ('Hai Mokram','Madeinat Kassala'):(36.4316,15.4652), ('Hai Qarb Alqash','Madeinat Kassala'):(36.3517,15.4502),
 ('Hai Reiba','Madeinat Kassala'):(36.3415,15.4215),
}
SUSPECT = ['Hai Alamria', 'Hai Altoura Wast']          # coordinates far from town - excluded
d = d[~d['name'].isin(SUSPECT)].copy()

def classify(r):
    why = []
    if r.dist_channel_m < 1000: why.append('<1 km from Gash')
    if r.dist_hill_m < 1000:    why.append('<1 km from hill foot')
    if r.upstream_km2 > 1:      why.append('on drainage line')
    if why: return 'High', ', '.join(why)
    if r.dist_channel_m < 2000 or r.dist_hill_m < 2000:
        return 'Medium', '1-2 km from Gash or hills'
    return 'Lower', ''
d[['class', 'reason']] = d.apply(lambda r: pd.Series(classify(r)), axis=1)

print('All IOM DTM sites (46):')
print(d.groupby('class')['idps'].agg(['count', 'sum']).reindex(['High', 'Medium', 'Lower']))

# ---------- 2. Map of Kassala town ----------
k = d[d['locality'] == 'Madeinat Kassala'].copy()
k['lon'] = [COORDS[(n, l)][0] for n, l in zip(k['name'], k['locality'])]
k['lat'] = [COORDS[(n, l)][1] for n, l in zip(k['name'], k['locality'])]

COL = {'High': '#d7191c', 'Medium': '#fdae61', 'Lower': '#ffffbf'}
halo = [pe.withStroke(linewidth=3, foreground='black')]
W, E, S, N = 36.325, 36.445, 15.400, 15.495
lat0 = (S + N) / 2

fig, ax = plt.subplots(figsize=(13, 9))
ax.set_xlim(W, E); ax.set_ylim(S, N)
ax.set_aspect(1 / np.cos(np.radians(lat0)))

if USE_BASEMAP:
    import contextily as ctx
    ctx.add_basemap(ax, crs='EPSG:4326', source=ctx.providers.Esri.WorldImagery,
                    attribution=False, zoom=14)

for c in ['Lower', 'Medium', 'High']:          # High drawn last (on top)
    s = k[k['class'] == c]
    ax.scatter(s['lon'], s['lat'], s=s['idps'] / 6 + 20, c=COL[c],
               edgecolors='black', linewidths=0.8, zorder=3)

for _, r in k[(k['class'] == 'High') & (k['idps'] >= 520)].iterrows():
    ax.annotate(r['name'].replace('Hai ', ''), (r['lon'], r['lat']), xytext=(6, 6),
                textcoords='offset points', color='white', fontsize=8.5,
                fontweight='bold', path_effects=halo, zorder=4)

for name, x, y in [('Gash River', 36.378, 15.488), ('Taka hills', 36.432, 15.425)]:
    ax.text(x, y, name, color='white', fontsize=10, fontstyle='italic',
            fontweight='bold', path_effects=halo, ha='center')

# legend: classes + bubble sizes
h = [Line2D([], [], marker='o', ls='', mfc=COL[c], mec='black', ms=9, label=lab)
     for c, lab in [('High', 'High: <1 km from Gash or\nhill foot, or on a drainage line'),
                    ('Medium', 'Medium: 1-2 km from Gash or hills'),
                    ('Lower', 'Lower')]]
h += [Line2D([], [], marker='o', ls='', mfc='white', mec='black',
             ms=np.sqrt(v / 6 + 20), label=f'{v:,} IDPs') for v in [500, 2000, 4000]]
ax.legend(handles=h, loc='upper left', bbox_to_anchor=(1.02, 1), fontsize=8.5, frameon=False,
          labelspacing=1.3, borderpad=0.2, title='IDP locations (IOM DTM)', title_fontsize=9)

tot = k['idps'].sum(); hi = k.loc[k['class'] == 'High', 'idps'].sum()
ax.text(0.98, 0.98, f"{(k['class']=='High').sum()} of {len(k)} IDP locations: High\n"
        f"{hi:,} of {tot:,} IDPs ({hi/tot:.0%})", transform=ax.transAxes,
        ha='right', va='top', fontsize=9, bbox=dict(facecolor='white', alpha=0.85, edgecolor='none'))

ax.add_artist(ScaleBar(111320 * np.cos(np.radians(lat0)), units='m',
                       location='lower right', box_alpha=0.8, rotation='horizontal-only'))
ax.annotate('N', xy=(0.95, 0.86), xytext=(0.95, 0.78), xycoords='axes fraction',
            ha='center', va='center', fontsize=13, fontweight='bold', color='white',
            path_effects=halo, arrowprops=dict(facecolor='white', edgecolor='black', width=4, headwidth=12))
ax.xaxis.set_major_locator(MultipleLocator(0.02)); ax.yaxis.set_major_locator(MultipleLocator(0.02))
ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{v:.2f}°E'))
ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f'{v:.2f}°N'))
ax.tick_params(labelsize=8)
ax.set_title('Flood exposure of IDP locations, Kassala town – rains of 25–26 July 2024',
             fontsize=11, fontweight='bold', loc='left')
fig.text(0.01, 0.005,
         'IDP locations and numbers: IOM DTM Sudan (site data Aug 2023, master list Apr 2024). '
         'Exposure: distance to the Gash and to steep hills (slope >15°), and drainage lines\n'
         '(MERIT Hydro, Copernicus DEM GLO-30), processed in Google Earth Engine. Potential exposure, '
         'not observed flooding. Background: Esri World Imagery. Map: Hosam Hasan, Oct 2026.',
         fontsize=6.5, color='#444')
fig.subplots_adjust(bottom=0.08)
fig.savefig(f'{FOLDER}/Map_Kassala_IDP_exposure_2024.png', dpi=300, bbox_inches='tight')
plt.show()

# ---------- 3. Ranked table ----------
out = d.sort_values(['class', 'idps'], key=lambda s: s.map({'High': 0, 'Medium': 1, 'Lower': 2})
                    if s.name == 'class' else -s)
out = out[['name', 'locality', 'idps', 'class', 'reason', 'dist_channel_m', 'dist_hill_m',
           'upstream_km2', 'rain_chirps_mm', 'rain_imerg_mm']].round(1)
out.to_csv(f'{FOLDER}/Kassala_IDP_exposure_ranked.csv', index=False)
print(out[out['class'] == 'High'].to_string(index=False))
print('Saved map and ranked table to', FOLDER)
