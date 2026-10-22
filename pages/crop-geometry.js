(function(root){
  function validate(points){
    if(!Array.isArray(points)||points.length!==4||points.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('四角坐标无效，请重新框选');
    const turns=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
    if(!turns.every(t=>t>1))throw new Error('四角不能交叉、重合或向内凹，请依次对准左上、右上、右下、左下');
    const [tl,tr,br,bl]=points,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const width=Math.round(Math.max(dist(br,bl),dist(tr,tl))),height=Math.round(Math.max(dist(tr,br),dist(tl,bl)));
    if(width<50||height<50)throw new Error('裁剪区域太小，请扩大选框');
    if(width*height>16000000||Math.max(width,height)>8192)throw new Error('裁剪结果过大，请缩小选框或选择较小的图片');
    return {width,height};
  }
  if(typeof module==='object')module.exports={validate};else root.CropGeometry={validate};
})(typeof window==='object'?window:this);
