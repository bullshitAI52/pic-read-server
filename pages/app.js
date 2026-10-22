"use strict";
const $ = id => document.getElementById(id);
const source = $("sourceCanvas"), output = $("resultCanvas"), stage = $("stage"), overlay = $("cropOverlay");
const ctx = source.getContext("2d", {willReadFrequently:true});
let original = null, points = [], dragging = -1, pointerId = null, cvReady = false;
let resultUrl=null, resultVersion=0, dragOffset=[0,0], loadVersion=0;
function clearResult(){
  resultVersion++;$("resultPanel").classList.add("hidden");
  if(resultUrl){URL.revokeObjectURL(resultUrl);resultUrl=null;}
  $("downloadBtn").removeAttribute("href");$("openImageBtn").removeAttribute("href");
  setButtons(!!original);
}

function status(text, error=false){$("status").textContent=text;$("status").style.color=error?"#b42318":""}
function setButtons(enabled){["rotateBtn","resetBtn"].forEach(id=>$(id).disabled=!enabled);["detectBtn","cropBtn"].forEach(id=>$(id).disabled=!enabled||!cvReady)}
function waitForCv(){
  const started=Date.now(), timer=setInterval(async()=>{
    if(window.cv){
      try{window.cv=window.cv instanceof Promise?await window.cv:window.cv;if(cv.Mat){clearInterval(timer);cvReady=true;setButtons(!!original);status(original?"可以拖动四角，调好后确认裁剪":"处理组件已就绪，请选择图片");if(original&&$("autoDetect").checked&&dragging<0)detectCorners()}}
      catch(_){/* keep waiting */}
    }
    if(Date.now()-started>30000){clearInterval(timer);status("图片处理组件加载失败，请检查网络后刷新页面",true)}
  },200);
}
waitForCv();

function defaultPoints(){const m=Math.max(8,Math.min(source.width,source.height)*.025);return [[m,m],[source.width-m,m],[source.width-m,source.height-m],[m,source.height-m]]}
function fitOverlay(){
  if(points.length!==4)return;
  const available=Math.max(1,stage.clientWidth-56), maxHeight=Math.max(220,window.innerHeight*.65);
  const scale=Math.min(1,available/source.width,maxHeight/source.height);
  source.style.width=`${source.width*scale}px`;source.style.height=`${source.height*scale}px`;
  const r=source.getBoundingClientRect(), sr=stage.getBoundingClientRect();
  Object.assign(overlay.style,{left:`${r.left-sr.left+stage.scrollLeft}px`,top:`${r.top-sr.top+stage.scrollTop}px`,width:`${r.width}px`,height:`${r.height}px`});
  overlay.setAttribute("viewBox",`0 0 ${r.width} ${r.height}`);
  const displayed=points.map(([x,y])=>[x/source.width*r.width,y/source.height*r.height]);
  $("cropPolygon").setAttribute("points",displayed.map(p=>p.join(",")).join(" "));
  overlay.querySelectorAll("circle").forEach((el,i)=>{el.setAttribute("cx",displayed[i][0]);el.setAttribute("cy",displayed[i][1]);el.setAttribute("r","24")});
}
new ResizeObserver(()=>points.length&&fitOverlay()).observe(stage);
window.addEventListener("resize",fitOverlay);

async function loadFile(file){
  if(!file||!file.type.startsWith("image/")){status("请选择常见的图片文件",true);return}
  if(file.size>80*1024*1024){status("图片超过 80 MB，浏览器可能无法稳定处理",true);return}
  const version=++loadVersion,url=URL.createObjectURL(file), img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);if(version!==loadVersion)return;
    if(img.naturalWidth*img.naturalHeight>16000000||Math.max(img.naturalWidth,img.naturalHeight)>8192){status("图片过大，请先选择不超过 1600 万像素、单边不超过 8192 的图片，以免手机内存不足。",true);return;}
    stopDrag();clearResult();source.width=img.naturalWidth;source.height=img.naturalHeight;ctx.drawImage(img,0,0);original=document.createElement("canvas");original.width=source.width;original.height=source.height;original.getContext("2d").drawImage(source,0,0);points=defaultPoints();stage.classList.remove("empty");$("emptyHint").classList.add("hidden");overlay.classList.remove("hidden");setButtons(true);fitOverlay();status(cvReady?"图片已载入，可调整四角":"图片已载入，等待处理组件…");if(cvReady&&$("autoDetect").checked)detectCorners()};
  img.onerror=()=>{URL.revokeObjectURL(url);status("无法读取这张图片",true)};img.src=url;
}

function orderQuad(raw){
  const center=raw.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]);
  const sorted=[...raw].sort((a,b)=>Math.atan2(a[1]-center[1],a[0]-center[0])-Math.atan2(b[1]-center[1],b[0]-center[0]));
  let start=0;sorted.forEach((p,i)=>{if(p[0]+p[1]<sorted[start][0]+sorted[start][1])start=i});
  return [...sorted.slice(start),...sorted.slice(0,start)];
}
function detectCorners(){
  if(!cvReady||!original)return;
  status("正在识别纸张边缘；也可以直接拖动四角…");
  let src,small,gray,edges,contours,hierarchy,kernel;
  try{
    const scale=Math.min(1,1300/Math.max(source.width,source.height)),preview=document.createElement("canvas");preview.width=Math.max(1,Math.round(source.width*scale));preview.height=Math.max(1,Math.round(source.height*scale));preview.getContext("2d").drawImage(source,0,0,preview.width,preview.height);small=cv.imread(preview);
    gray=new cv.Mat();edges=new cv.Mat();cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,gray,new cv.Size(5,5),0);cv.Canny(gray,edges,40,120);kernel=cv.Mat.ones(3,3,cv.CV_8U);cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,kernel);
    contours=new cv.MatVector();hierarchy=new cv.Mat();cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const candidates=[];for(let i=0;i<contours.size();i++){const contour=contours.get(i);candidates.push([Math.abs(cv.contourArea(contour)),i]);contour.delete();}candidates.sort((a,b)=>b[0]-a[0]);let found=null;
    for(const [area,i] of candidates.slice(0,30)){if(area<small.cols*small.rows*.2||area>small.cols*small.rows*.98)continue;const c=contours.get(i),q=new cv.Mat();cv.approxPolyDP(c,q,.02*cv.arcLength(c,true),true);if(q.rows===4&&cv.isContourConvex(q)){found=[];for(let n=0;n<4;n++)found.push([q.data32S[n*2]/scale,q.data32S[n*2+1]/scale]);q.delete();c.delete();break}q.delete();c.delete()}
    if(found){clearResult();points=orderQuad(found).map(([x,y])=>[Math.max(0,Math.min(source.width-1,x)),Math.max(0,Math.min(source.height-1,y))]);fitOverlay();status("已建议四角，请检查并手动微调，然后确认裁剪")}
    else status("没有找到可靠边框，已保留当前角点，请手动调整")
  }catch(e){console.error(e);status("自动识别失败，仍可手动调整四角",true)}finally{[src,small,gray,edges,contours,hierarchy,kernel].forEach(m=>m&&m.delete())}
}

function drawMagnifier(){
  const mag=$("magnifier");if(dragging<0||!$("magnifierEnabled").checked){mag.classList.add("hidden");return}
  const [x,y]=points[dragging],m=mag.getContext("2d"),sample=Math.max(28,120*source.width/Math.max(1,source.getBoundingClientRect().width)/3);m.clearRect(0,0,240,240);m.drawImage(source,x-sample/2,y-sample/2,sample,sample,0,0,240,240);m.strokeStyle="#ffd23f";m.lineWidth=4;m.beginPath();m.moveTo(120,0);m.lineTo(120,240);m.moveTo(0,120);m.lineTo(240,120);m.stroke();mag.style.left=x>source.width/2?"18px":"auto";mag.style.right=x>source.width/2?"auto":"18px";mag.classList.remove("hidden")
}
function stopDrag(e){if(e&&pointerId!==e.pointerId)return;dragging=-1;pointerId=null;$("magnifier").classList.add("hidden")}
overlay.querySelectorAll("circle").forEach(el=>el.addEventListener("pointerdown",e=>{if(pointerId!==null||(e.pointerType==="mouse"&&e.button!==0))return;e.preventDefault();clearResult();dragging=Number(el.dataset.corner);pointerId=e.pointerId;const r=overlay.getBoundingClientRect();dragOffset=[points[dragging][0]-(e.clientX-r.left)/r.width*source.width,points[dragging][1]-(e.clientY-r.top)/r.height*source.height];el.setPointerCapture(e.pointerId);drawMagnifier()}));
overlay.addEventListener("pointermove",e=>{if(dragging<0||e.pointerId!==pointerId)return;const r=overlay.getBoundingClientRect();points[dragging]=[Math.max(0,Math.min(source.width-1,(e.clientX-r.left)/r.width*source.width+dragOffset[0])),Math.max(0,Math.min(source.height-1,(e.clientY-r.top)/r.height*source.height+dragOffset[1]))];fitOverlay();drawMagnifier()});
overlay.addEventListener("pointerup",stopDrag);overlay.addEventListener("pointercancel",stopDrag);overlay.addEventListener("lostpointercapture",stopDrag);$("magnifierEnabled").addEventListener("change",drawMagnifier);

function crop(){
  if(!cvReady){status("处理组件尚未就绪，请等待加载完成后再试",true);return;}
  if(points.length!==4)return;
  stopDrag();clearResult();const version=resultVersion;setButtons(false);
  let srcMat,srcPts,dstPts,result,transform,encoding=false;
  try{
    const {width:w,height:h}=CropGeometry.validate(points);
    srcMat=cv.imread(source);srcPts=cv.matFromArray(4,1,cv.CV_32FC2,points.flat());dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);result=new cv.Mat();transform=cv.getPerspectiveTransform(srcPts,dstPts);
    cv.warpPerspective(srcMat,result,transform,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE);
    output.width=w;output.height=h;cv.imshow(output,result);status("裁剪完成，正在生成高清图片…");encoding=true;
    output.toBlob(blob=>{
      if(version!==resultVersion)return;
      setButtons(!!original);
      if(!blob){status("图片生成失败，可能是手机内存不足，请换一张较小图片重试",true);return;}
      resultUrl=URL.createObjectURL(blob);$("downloadBtn").href=resultUrl;$("openImageBtn").href=resultUrl;
      $("downloadBtn").download=`cropped-hd-${Date.now()}.png`;
      $("resultInfo").textContent=`${w} × ${h} 像素 · ${(blob.size/1048576).toFixed(2)} MB`;
      $("resultPanel").classList.remove("hidden");$("resultPanel").scrollIntoView({behavior:"smooth",block:"start"});
      status("高清图片已准备好，可直接下载；手机也可以打开图片后长按保存");
    },"image/png");
  }catch(e){encoding=false;status(`裁剪失败：${e.message||"图片处理失败，请重新框选四角或使用较小图片"}`,true);}
  finally{[srcMat,srcPts,dstPts,result,transform].forEach(m=>m&&m.delete());if(!encoding)setButtons(!!original);}
}
function rotate(){if(!original)return;stopDrag();clearResult();const tmp=document.createElement("canvas");tmp.width=source.height;tmp.height=source.width;const t=tmp.getContext("2d");t.translate(tmp.width,0);t.rotate(Math.PI/2);t.drawImage(source,0,0);source.width=tmp.width;source.height=tmp.height;ctx.drawImage(tmp,0,0);points=defaultPoints();fitOverlay();if($("autoDetect").checked)detectCorners()}
function reset(){if(!original)return;stopDrag();clearResult();source.width=original.width;source.height=original.height;ctx.drawImage(original,0,0);points=defaultPoints();fitOverlay();status("已恢复原图和原始方向，可重新调整四角")}

$("fileInput").addEventListener("change",e=>{loadFile(e.target.files[0]);e.target.value="";});$("detectBtn").addEventListener("click",detectCorners);$("cropBtn").addEventListener("click",crop);$("rotateBtn").addEventListener("click",rotate);$("resetBtn").addEventListener("click",reset);
