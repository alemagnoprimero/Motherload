/** Editable procedural vector material kit. Eight-tile periods avoid tile-sized repetition. */
import { mkdir,writeFile } from 'node:fs/promises';
import { WORLD_BANDS } from '../../src/campaign/world-content.ts';
import { num } from './kit/svg.mjs';
const dir=new URL('./bands/',import.meta.url);
const shade=(hex,amount)=>'#'+hex.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+amount)).toString(16).padStart(2,'0')).join('');
const poly=(points,fill,stroke='none',width=0)=>`<path d="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
const rect=(x,y,w,h,fill)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
// Art item A12 with T9 (docs/ART_QUALITY_AUDIT.md §5.3 T9, §6.1 "Composition"):
// the tier mark is a small dark disc with a light glyph and no ring, at the
// ore's lower right, overlapping it by about 30 %. Its diameter is 16 of the
// 96-unit frame (0.167 ≤ 0.18). The glyphs are the journal legend's
// (src/mineral-legend.ts campaignOreMarker: dot, two vertical bars, three
// horizontal bars, triangle), as on the board: a dot on the pebble ore, II on
// copper. oreMarkGeometry() is the one source of the mark's place and size
// for the frames, the high-contrast overlays and scripts/check-render-assets.mjs.
export const ORE_MARK_GLYPHS=['dot','parallel','bars','triangle'];
export const ORE_MARK_FILL='#0e151d';
export const ORE_MARK_INK='#e8f0f5';
export const ORE_MARK_HC_FILL='#f4f1e8';
export const ORE_MARK_RADIUS=8;
/** The high-contrast mark's dark outline (thin, so the light field dominates). */
export const ORE_MARK_HC_OUTLINE=1.4;
// Centre per world and tier, in the 96-unit ore frame: the lower-right corner
// of each ore silhouette (W01: assets/campaign/source/w01-ore.mjs; W02:
// assets/campaign/w02/create-sources.mjs mineral()), set so about 30 % of the
// disc lies on the ore and on the package's ore (0.2 to 0.4, measured on the
// frames drawn without the mark), with the right-and-below quarter round the
// disc clear of the drawing. Package frames share the ore frame's centre, so
// one high-contrast overlay per world fits both.
export const ORE_MARK_CENTRES={
 W01:[[79,85],[79,74],[78,81.5],[78,83]],
 W02:[[78.5,80],[78,82.5],[78.5,79],[78,83]],
};
export function oreMarkGeometry(tier,world='W01'){
 const centres=ORE_MARK_CENTRES[world];
 if(!centres) throw new Error(`No tier-mark centres for world ${world}`);
 const [cx,cy]=centres[tier-1];
 return {cx,cy,r:ORE_MARK_RADIUS};
}
function markGlyph(tier,cx,cy,fill,k=1){
 const glyph=ORE_MARK_GLYPHS[tier-1];
 const box=(x,y,w,h)=>`<rect x="${num(cx+(x-w/2)*k)}" y="${num(cy+(y-h/2)*k)}" width="${num(w*k)}" height="${num(h*k)}" fill="${fill}"/>`;
 if(glyph==='dot') return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(2.6*k)}" fill="${fill}"/>`;
 if(glyph==='parallel') return box(-2.1,0,2.3,8.4)+box(2.1,0,2.3,8.4);
 if(glyph==='bars') return box(0,-3.3,8,1.8)+box(0,0,8,1.8)+box(0,3.3,8,1.8);
 const p=[[0,-4.6],[-4.4,3.2],[4.4,3.2]].map(([x,y])=>`${num(cx+x*k)} ${num(cy+y*k)}`);
 return `<path d="M${p.join(' L')} Z" fill="${fill}"/>`;
}
export function oreBadge(tier,world='W01'){
 const {cx,cy,r}=oreMarkGeometry(tier,world);
 return `<g id="tier-mark" data-glyph="${ORE_MARK_GLYPHS[tier-1]}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${ORE_MARK_FILL}"/>${markGlyph(tier,cx,cy,ORE_MARK_INK)}</g>`;
}
// The high-contrast mark (T9's HC variant, drawn over the ore by the game when
// high contrast is on): the same footprint, a light disc (L* 95, more than
// 20 L* from copper's body in greyscale) inside a thin dark outline, with the
// glyph dark. A frame of its own per world, so the HC variant costs a small
// mark, not a second set of ore frames (audit §7 budget;
// docs/art-direction/decisions.md, accepted deviations).
export function oreMarkHighContrast(tier,world='W01'){
 const {cx,cy,r}=oreMarkGeometry(tier,world);
 const w=ORE_MARK_HC_OUTLINE;
 return `<g id="tier-mark-hc" data-glyph="${ORE_MARK_GLYPHS[tier-1]}"><circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r-w/2)}" fill="${ORE_MARK_HC_FILL}" stroke="#14232b" stroke-width="${num(w)}"/>${markGlyph(tier,cx,cy,'#14232b',0.82)}</g>`;
}
export function sceneryFrames(){
 const frames=[];
 for(const [kind,color] of [['wreck','#789097'],['survey','#83b9b5'],['mission','#d3a36b'],['cache','#d5ba78'],['geode','#b7c5e3'],['beacon','#dcbb80'],['antenna','#8eafb2'],['core','#9cbdbc']]){
  let body=poly('M10 111 L24 101 L48 104 L66 96 L97 102 L136 98 L168 109 L183 114 Z','#253940');
  if(kind==='geode') body+=poly('M28 106 L39 65 L58 79 L71 25 L92 61 L113 44 L128 83 L153 59 L164 108 Z','#3d4e72','#9cadce',3)+poly('M71 25 L77 105 L92 61 L88 97 L113 44 L110 106','#b0c8e0','#d9e9e2',2);
  else if(kind==='cache') body+=rect(58,65,84,42,'#314d59')+rect(62,69,76,6,color)+poly('M62 78 V104 H138 V78 M81 66 V108 M121 66 V108','none','#8fa7a7',4)+rect(92,84,16,12,color);
  else {
   body+=poly('M25 97 L42 62 L70 53 L139 64 L164 100 Z','#344c57',color,3)+poly('M42 62 L76 72 L68 103 L25 97 Z','#526f77',color,2)+poly('M76 72 L139 64 L164 100 L68 103 Z','#253b48',color,2)+rect(95,76,37,12,'#101e2b')+rect(102,78,8,5,color);
   if(kind==='antenna'||kind==='beacon'||kind==='survey') body+=poly('M89 68 L87 15 M64 25 Q86 40 112 19 M70 18 Q88 29 104 15','none',color,5)+rect(81,13,12,8,'#edf3d8');
   if(kind==='core'||kind==='mission') body+=poly('M75 79 L96 61 L116 79 L99 98 Z',color,'#e9e6c9',3);
  }
  frames.push({name:`site-${kind}`,width:192,height:128,body,category:'scenery'});
 }
 frames.push({name:'cold-pocket',width:192,height:128,category:'hazard',body:poly('M9 87 Q27 48 54 57 Q76 14 107 41 Q142 18 160 61 Q186 64 182 93 Q116 115 52 101 Z','#84cbd2','none',0)+poly('M18 87 Q58 67 90 79 Q131 91 174 69','none','#b9f1e9',5)+poly('M36 60 Q65 45 91 59 M108 48 Q133 35 155 52','none','#d6f8ee',3)});
 frames.push({name:'pressure-seam',width:96,height:96,category:'hazard',body:poly('M5 70 L22 61 L32 42 L51 54 L68 22 L91 14','none','#dca972',7)+poly('M5 70 L22 61 L32 42 L51 54 L68 22 L91 14','none','#fbe5b3',2)});
 frames.push({name:'surface-salvage',width:192,height:96,category:'scenery',body:poly('M8 84 L32 55 L67 62 L85 38 L111 52 L137 46 L182 85 Z','#46565c','#9ba7a5',3)+poly('M32 55 L46 84 M85 38 L98 83 M137 46 L119 84','none','#263c48',4)});
 return frames;
}
export async function createBandSources(){
 await mkdir(dir,{recursive:true});const frames=[];
 for(const [world,bands] of Object.entries(WORLD_BANDS))for(const band of bands)for(const material of ['soil','rock','wall']){
  const base=material==='soil'?band.soil:material==='rock'?band.stone:band.backWall;
  let drawing=rect(0,0,768,768,base);
  // Smooth periodic functions meet exactly on all four edges. Broad formations cross cell boundaries.
  for(let l=0;l<12;l++){
   const points=[];
   for(let x=0;x<=768;x+=12){const y=l*64+32+Math.cos(x/768*Math.PI*2)*(material==='rock'?20:10);points.push(`${x===0?'M':'L'}${x} ${y.toFixed(2)}`);}
   drawing+=poly(points.join(' '),'none',shade(base,l%2?-18:16),material==='wall'?2:4);
  }
  for(let i=0;i<96;i++){
   const x=12+(i*139%744),y=12+(i*211%744),size=material==='rock'?6:3;
   if(material==='soil')drawing+=`<circle cx="${x}" cy="${y}" r="${size}" fill="${shade(base,i%2?9:-11)}"/>`;
   else drawing+=poly(`M${x-5} ${y-3} l10 2 l-4 6 l-8 -2 Z`,shade(base,i%2?11:-13));
  }
  // Continuous irregular plates span multiple collision cells. Soft wrap margins
  // retain identical edge pixels without a visible hard seam in the eight-tile page.
  const noise=(x,y)=>((Math.imul(x+57,73856093)^Math.imul(y+91,19349663))>>>0)%997/997;
  const vertex=(x,y)=>[x*192+(x===0||x===4?0:(noise(x,y)-.5)*60),y*96+(y===0||y===8?0:(noise(x+31,y+12)-.5)*36)];
  let plates='';
  for(let yy=0;yy<8;yy++)for(let xx=0;xx<4;xx++){
    const corners=[vertex(xx,yy),vertex(xx+1,yy),vertex(xx+1,yy+1),vertex(xx,yy+1)];
    const d=corners.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')+' Z';
    const variation=Math.round((noise(xx+18,yy+64)-.5)*(material==='wall'?13:25));
    plates+=poly(d,shade(base,variation),shade(base,material==='wall'?-9:-28),material==='wall'?2:3);
    if(material!=='wall'){
      const [x,y]=corners[0],[rx,ry]=corners[1];
      plates+=poly(`M${x+3} ${y+5} L${rx-3} ${ry+5}`,'none',shade(base,variation+22),2);
      if(xx%2===yy%2)plates+=poly(`M${x+35} ${y+22} l30 14 l-8 27`,'none',shade(base,variation-13),1.5);
    }
  }
  const fade=`<defs><linearGradient id="wrap-x"><stop stop-color="black"/><stop offset=".025" stop-color="white"/><stop offset=".975" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><linearGradient id="wrap-y" x2="0" y2="1"><stop stop-color="black"/><stop offset=".025" stop-color="white"/><stop offset=".975" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient><mask id="mx"><rect width="768" height="768" fill="url(#wrap-x)"/></mask><mask id="my"><rect width="768" height="768" fill="url(#wrap-y)"/></mask></defs>`;
  drawing+=fade+`<g mask="url(#mx)"><g mask="url(#my)">${plates}</g></g>`;
  if(world==='W02'&&band.id.endsWith('C'))for(let i=0;i<24;i++)drawing+=`<circle cx="${28+i*113%710}" cy="${28+i*179%710}" r="${5+i%3*3}" fill="none" stroke="${shade(base,25)}" stroke-width="2"/>`;
  const name=`${world.toLowerCase()}-${band.id.slice(-1).toLowerCase()}-${material}`;
  await writeFile(new URL(name+'.svg',dir),`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768"><title>${world} ${band.name} ${material}, continuous eight-tile material</title>${drawing}</svg>\n`);
  frames.push({name,width:768,height:768,world,band:band.id,material,logicalWidth:384,logicalHeight:384});
 }
 await writeFile(new URL('frames.json',dir),JSON.stringify({frames,backgrounds:[]},null,2)+'\n');return frames;
}
