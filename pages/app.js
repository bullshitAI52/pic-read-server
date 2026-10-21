"use strict";
const $ = id => document.getElementById(id);
const source = $("sourceCanvas"), output = $("resultCanvas"), stage = $("stage"), overlay = $("cropOverlay");
const ctx = source.getContext("2d", {willReadFrequently:true});
let original = null, points = [], dragging = -1, pointerId = null, cvReady = false;

function status(text, error=false){$("status").textContent=text;$("status").style.color=error?"#b42318":""}
function setButtons(enabled){["detectBtn","rotateBtn","cropBtn","resetBtn"].forEach(id=>$(id).disabled=!enabled)}
function waitForCv(){
  const started=Date.now(), timer=setInterval(async()=>{
    if(window.cv){
      try{window.cv=window.cv instanceof Promise?await window.cv:window.cv;if(cv.Mat){clearInterval(timer);cvReady=true;status("处理组件已就绪，请选择图片");if(original&&$("autoDetect").checked)detectCorners()}}
      catch(_){/* keep waiting */}
    }
    if(Date.now()-started>30000){clearInterval(timer);status("图片处理组件加载失败，请检查网络后刷新页面",true)}
  },200);
}
waitForCv();

function defaultPoints(){const m=Math.max(8,Math.min(source.width,source.height)*.025);return [[m,m],[source.width-m,m],[source.width-m,source.height-m],[m,source.height-m]]}
function fitOverlay(){
  const r=source.getBoundingClientRect(), sr=stage.getBoundingClientRect();
  Object.assign(overlay.style,{left:`${r.left-sr.left+stage.scrollLeft}px`,top:`${r.top-sr.top+stage.scrollTop}px`,width:`${r.width}px`,height:`${r.height}px`});
  overlay.setAttribute("viewBox",`0 0 ${source.width} ${source.height}`);
  $("cropPolygon").setAttribute("points",points.map(p=>p.join(",")).join(" "));
  overlay.querySelectorAll("circle").forEach((el,i)=>{el.setAttribute("cx",points[i][0]);el.setAttribute("cy",points[i][1])});
}
new ResizeObserver(()=>points.length&&fitOverlay()).observe(source);

async function loadFile(file){
  if(!file||!file.type.startsWith("image/")){status("请选择常见的图片文件",true);return}
  if(file.size>80*1024*1024){status("图片超过 80 MB，浏览器可能无法稳定处理",true);return}
  const url=URL.createObjectURL(file), img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);source.width=img.naturalWidth;source.height=img.naturalHeight;ctx.drawImage(img,0,0);original=document.createElement("canvas");original.width=source.width;original.height=source.height;original.getContext("2d").drawImage(source,0,0);points=defaultPoints();stage.classList.remove("empty");$("emptyHint").classList.add("hidden");overlay.classList.remove("hidden");$("resultPanel").classList.add("hidden");setButtons(true);fitOverlay();status(cvReady?"图片已载入，可调整四角":"图片已载入，等待处理组件…");if(cvReady&&$("autoDetect").checked)detectCorners()};
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
    src=cv.imread(source);const scale=Math.min(1,1300/Math.max(src.cols,src.rows));small=new cv.Mat();cv.resize(src,small,new cv.Size(Math.round(src.cols*scale),Math.round(src.rows*scale)),0,0,cv.INTER_AREA);
    gray=new cv.Mat();edges=new cv.Mat();cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,gray,new cv.Size(5,5),0);cv.Canny(gray,edges,40,120);kernel=cv.Mat.ones(3,3,cv.CV_8U);cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,kernel);
    contours=new cv.MatVector();hierarchy=new cv.Mat();cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const candidates=[];for(let i=0;i<contours.size();i++)candidates.push([Math.abs(cv.contourArea(contours.get(i))),i]);candidates.sort((a,b)=>b[0]-a[0]);let found=null;
    for(const [area,i] of candidates.slice(0,30)){if(area<small.cols*small.rows*.2||area>small.cols*small.rows*.98)continue;const c=contours.get(i),q=new cv.Mat();cv.approxPolyDP(c,q,.02*cv.arcLength(c,true),true);if(q.rows===4&&cv.isContourConvex(q)){found=[];for(let n=0;n<4;n++)found.push([q.data32S[n*2]/scale,q.data32S[n*2+1]/scale]);q.delete();c.delete();break}q.delete();c.delete()}
    if(found){points=orderQuad(found).map(([x,y])=>[Math.max(0,Math.min(source.width-1,x)),Math.max(0,Math.min(source.height-1,y))]);fitOverlay();status("已建议四角，请检查并手动微调，然后确认裁剪")}
    else status("没有找到可靠边框，已保留当前角点，请手动调整")
  }catch(e){console.error(e);status("自动识别失败，仍可手动调整四角",true)}finally{[src,small,gray,edges,contours,hierarchy,kernel].forEach(m=>m&&m.delete())}
}

function drawMagnifier(){
  const mag=$("magnifier");if(dragging<0||!$("magnifierEnabled").checked){mag.classList.add("hidden");return}
  const [x,y]=points[dragging],m=mag.getContext("2d"),sample=Math.max(28,120*source.width/Math.max(1,source.getBoundingClientRect().width)/3);m.clearRect(0,0,240,240);m.drawImage(source,x-sample/2,y-sample/2,sample,sample,0,0,240,240);m.strokeStyle="#ffd23f";m.lineWidth=4;m.beginPath();m.moveTo(120,0);m.lineTo(120,240);m.moveTo(0,120);m.lineTo(240,120);m.stroke();mag.style.left=x>source.width/2?"18px":"auto";mag.style.right=x>source.width/2?"auto":"18px";mag.classList.remove("hidden")
}
function stopDrag(e){if(e&&pointerId!==e.pointerId)return;dragging=-1;pointerId=null;$("magnifier").classList.add("hidden")}
overlay.querySelectorAll("circle").forEach(el=>el.addEventListener("pointerdown",e=>{if(pointerId!==null)return;e.preventDefault();dragging=Number(el.dataset.corner);pointerId=e.pointerId;el.setPointerCapture(e.pointerId);drawMagnifier()}));
overlay.addEventListener("pointermove",e=>{if(dragging<0||e.pointerId!==pointerId)return;const r=overlay.getBoundingClientRect();points[dragging]=[Math.max(0,Math.min(source.width,(e.clientX-r.left)/r.width*source.width)),Math.max(0,Math.min(source.height,(e.clientY-r.top)/r.height*source.height))];fitOverlay();drawMagnifier()});
overlay.addEventListener("pointerup",stopDrag);overlay.addEventListener("pointercancel",stopDrag);$("magnifierEnabled").addEventListener("change",drawMagnifier);

function crop(){
  if(!cvReady||points.length!==4)return;let srcMat,srcPts,dstPts,result;
  try{const [tl,tr,br,bl]=points,w=Math.round(Math.max(Math.hypot(br[0]-bl[0],br[1]-bl[1]),Math.hypot(tr[0]-tl[0],tr[1]-tl[1]))),h=Math.round(Math.max(Math.hypot(tr[0]-br[0],tr[1]-br[1]),Math.hypot(tl[0]-bl[0],tl[1]-bl[1])));if(w<50||h<50)throw new Error("区域太小");
    srcMat=cv.imread(source);srcPts=cv.matFromArray(4,1,cv.CV_32FC2,points.flat());dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);result=new cv.Mat();const transform=cv.getPerspectiveTransform(srcPts,dstPts);cv.warpPerspective(srcMat,result,transform,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE);output.width=w;output.height=h;cv.imshow(output,result);transform.delete();$("resultInfo").textContent=`${w} × ${h} 像素`;$("resultPanel").classList.remove("hidden");$("resultPanel").scrollIntoView({behavior:"smooth",block:"start"});status("裁剪完成，可下载高清 PNG")
  }catch(e){status(`裁剪失败：${e.message}`,true)}finally{[srcMat,srcPts,dstPts,result].forEach(m=>m&&m.delete())}
}
function rotate(){if(!original)return;const tmp=document.createElement("canvas");tmp.width=source.height;tmp.height=source.width;const t=tmp.getContext("2d");t.translate(tmp.width,0);t.rotate(Math.PI/2);t.drawImage(source,0,0);source.width=tmp.width;source.height=tmp.height;ctx.drawImage(tmp,0,0);original=document.createElement("canvas");original.width=source.width;original.height=source.height;original.getContext("2d").drawImage(source,0,0);points=defaultPoints();fitOverlay();$("resultPanel").classList.add("hidden");if($("autoDetect").checked)detectCorners()}
function reset(){if(!original)return;source.width=original.width;source.height=original.height;ctx.drawImage(original,0,0);points=defaultPoints();fitOverlay();$("resultPanel").classList.add("hidden");status("已恢复当前原图，可重新调整四角")}

$("fileInput").addEventListener("change",e=>loadFile(e.target.files[0]));$("detectBtn").addEventListener("click",detectCorners);$("cropBtn").addEventListener("click",crop);$("rotateBtn").addEventListener("click",rotate);$("resetBtn").addEventListener("click",reset);
$("downloadBtn").addEventListener("click",()=>output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`cropped-hd-${new Date().toISOString().replace(/[:.]/g,"-")}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},"image/png"));
