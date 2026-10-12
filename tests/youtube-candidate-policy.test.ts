import {afterEach,describe,expect,it,vi} from 'vitest';
import {fetchYoutubeMetadata,youtubeCandidateAvailable} from '../worker/lib/youtube-candidate-policy';
const video=()=>({id:'abcdefghijk',status:{privacyStatus:'public',embeddable:true,uploadStatus:'processed'},contentDetails:{},snippet:{liveBroadcastContent:'none'}});
afterEach(()=>vi.unstubAllGlobals());
describe('YouTube student candidate availability',()=>{
 it('accepts public processed embeddable videos without regional restrictions',()=>expect(youtubeCandidateAvailable(video())).toBe(true));
 it.each(['private','unlisted'])('rejects %s videos',privacyStatus=>expect(youtubeCandidateAvailable({...video(),status:{...video().status,privacyStatus}})).toBe(false));
 it('rejects disabled embedding, unfinished uploads and missing status',()=>{
  expect(youtubeCandidateAvailable({...video(),status:{...video().status,embeddable:false}})).toBe(false);
  expect(youtubeCandidateAvailable({...video(),status:{...video().status,uploadStatus:'uploaded'}})).toBe(false);
  expect(youtubeCandidateAvailable({id:'abcdefghijk'})).toBe(false);
 });
 it('rejects age restrictions, live streams and invalid identifiers',()=>{
  expect(youtubeCandidateAvailable({...video(),contentDetails:{contentRating:{ytRating:'ytAgeRestricted'}}})).toBe(false);
  expect(youtubeCandidateAvailable({...video(),snippet:{liveBroadcastContent:'live'}})).toBe(false);
  expect(youtubeCandidateAvailable({...video(),id:'../malformed'})).toBe(false);
 });
 it('honors allowed and blocked regions, including empty allowed lists',()=>{
  for(const regionRestriction of [{blocked:['TR']},{allowed:['US']},{allowed:[]}]){
   expect(youtubeCandidateAvailable({...video(),contentDetails:{regionRestriction}})).toBe(false);
  }
  expect(youtubeCandidateAvailable({...video(),contentDetails:{regionRestriction:{allowed:['TR']}}})).toBe(true);
 });
 it('does not expose provider error payloads or fail the student page on quota errors',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('secret provider error',{status:403})));
  expect(await fetchYoutubeMetadata(new URL('https://www.googleapis.com/youtube/v3/search'))).toBeNull();
 });
 it('handles malformed JSON and transport failure',async()=>{
  const fetchMock=vi.fn().mockResolvedValueOnce(new Response('{')).mockRejectedValueOnce(new Error('timeout'));
  vi.stubGlobal('fetch',fetchMock);
  const url=new URL('https://www.googleapis.com/youtube/v3/videos');
  expect(await fetchYoutubeMetadata(url)).toBeNull();
  expect(await fetchYoutubeMetadata(url)).toBeNull();
 });
});
