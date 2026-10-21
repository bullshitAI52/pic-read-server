// Isolated interaction-logic checks; no browser or external packages required.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../web/static/app.js'), 'utf8');
const elements = new Map();
const ctx2d = {fillRect(){}, drawImage(){this.drawn = true}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}};
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, {checked: true, style: {}, width: 240, naturalWidth: 900, naturalHeight: 700,
      src: 'preview-1', textContent: '', getContext: () => ctx2d,
      getBoundingClientRect: () => ({width: 450}),
      classList: {add:c=>classes.add(c), remove:c=>classes.delete(c), contains:c=>classes.has(c)}});
  }
  return elements.get(id);
}
let resolveFetch;
const context = vm.createContext({$: element, state: {jobId: 'test'}, isViewOpen:()=>true,
  renderCrop(){}, AbortController, setTimeout, clearTimeout,
  fetch:()=>new Promise(resolve=>{resolveFetch=resolve})});
vm.runInContext(source.slice(source.indexOf('let viewId ='), source.indexOf('const isViewOpen =')), context);
const run = code => vm.runInContext(code, context);
const points = [[.1,.1],[.9,.1],[.9,.9],[.1,.9]];
async function reply(body) { resolveFetch({ok:true,json:async()=>body}); }
(async()=>{
  run('viewId="page"; cropPoints=[[0,0],[900,0],[900,700],[0,700]];');
  let pending = run('detectCrop()');
  await reply({detected:true,points}); await pending;
  assert.equal(run('cropPoints[0][0]'), 90);
  pending = run('detectCrop()');
  run('cropVersion++; cropPoints[0]=[42,42]');
  await reply({detected:true,points}); await pending;
  assert.equal(run('cropPoints[0][0]'), 42, 'late detection must not overwrite manual input');
  pending = run('detectCrop()'); run('viewId="other"');
  await reply({detected:true,points}); await pending;
  assert.equal(run('cropPoints[0][0]'), 42, 'late result must not change another page');
  pending = run('detectCrop()'); await reply({detected:false,points:null}); await pending;
  assert.equal(run('cropPoints[0][0]'), 42);
  assert.match(element('cropDetectStatus').textContent, /手动/);
  pending = run('detectCrop()'); await reply({detected:true,points:[[null,0]]}); await pending;
  assert.equal(run('cropPoints[0][0]'), 42);
  run('cropDragging=0; renderMagnifier()');
  assert.equal(ctx2d.drawn, true);
  assert.equal(element('cropMagnifier').classList.contains('hidden'), false);
  element('cropMagnifyEnabled').checked = false;
  run('renderMagnifier()');
  assert.equal(element('cropMagnifier').classList.contains('hidden'), true);
  run('stopCropDrag()'); assert.equal(run('cropDragging'), -1);
  console.log('PASS: detection, stale-response protection, manual fallback, magnifier toggle/cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
