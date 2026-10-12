// Provider metadata checks do not certify academic correctness.
export function youtubeCandidateAvailable(video:any,region='TR'):boolean{
 if(!/^[A-Za-z0-9_-]{11}$/.test(String(video?.id||'')))return false;
 if(video?.status?.privacyStatus!=='public'||video?.status?.embeddable!==true)return false;
 if(video.status.uploadStatus!=='processed')return false;
 if(video.contentDetails?.contentRating?.ytRating==='ytAgeRestricted')return false;
 const restriction=video.contentDetails?.regionRestriction;
 if(Array.isArray(restriction?.allowed)&&!restriction.allowed.includes(region))return false;
 if(Array.isArray(restriction?.blocked)&&restriction.blocked.includes(region))return false;
 if(video.snippet?.liveBroadcastContent&&video.snippet.liveBroadcastContent!=='none')return false;
 return true;
}
export async function fetchYoutubeMetadata(url:URL):Promise<any|null>{
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const data:any=await response.json();
  return Array.isArray(data?.items)?data:null;
 }catch{return null;}
}
