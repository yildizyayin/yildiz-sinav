export type ExamScopeType='INSTITUTION'|'NETWORK'|'CENTRAL';
export type RankingStatus='OPEN'|'FROZEN'|'CALCULATING'|'READY'|'PUBLISHED';

export const CENTRAL_PARTICIPANT_LABEL='Türkiye Geneli Katılımcılar Arasında';

export function centralCatalogAllowed(scope:ExamScopeType,verified:boolean):boolean{
  return scope!=='CENTRAL'||verified;
}

export function nextRankingActions(status:RankingStatus){
  return {
    canFreeze:status==='OPEN',
    canBuild:status==='FROZEN'||status==='READY',
    canPublish:status==='READY',
    isPublished:status==='PUBLISHED',
  };
}

export function percentileFromRank(rank:number,total:number):number|null{
  if(!Number.isFinite(rank)||!Number.isFinite(total)||rank<1||total<1||rank>total)return null;
  if(total===1)return 0;
  return Math.round(((rank-1)*100/(total-1))*1000)/1000;
}

export function rankingDisplay(rank:number|null|undefined,total:number|null|undefined):string{
  if(!rank||!total)return '—';
  return `${rank} / ${total}`;
}
