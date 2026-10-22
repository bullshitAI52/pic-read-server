const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../crop-geometry.js');
test('valid rectangle keeps expected full-resolution size',()=>assert.deepEqual(validate([[0,0],[1200,0],[1200,900],[0,900]]),{width:1200,height:900}));
test('perspective quadrilateral can be cropped',()=>assert.ok(validate([[100,50],[1000,100],[1100,800],[50,850]]).width>1000));
test('crossed corners fail with actionable text',()=>assert.throws(()=>validate([[0,0],[800,800],[800,0],[0,800]]),/交叉/));
test('coincident and inward corners are rejected',()=>{assert.throws(()=>validate([[0,0],[0,0],[800,800],[0,800]]));assert.throws(()=>validate([[0,0],[800,0],[100,100],[0,800]]));});
test('tiny and oversized output are rejected',()=>{assert.throws(()=>validate([[0,0],[10,0],[10,10],[0,10]]),/太小/);assert.throws(()=>validate([[0,0],[8000,0],[8000,8000],[0,8000]]),/过大/);});
