export type StandardCheckState='READY'|'CONFIG_REQUIRED'|'MISSING';
export type StandardCheckLike={key:string;state:StandardCheckState};
export type OperationalCheckLike={state:'READY'|'SETUP_REQUIRED';blocking:boolean};

const OPTIONAL_CHANNEL_KEYS=new Set(['YOUTUBE_MICRO','WHATSAPP']);

export function evaluateStandardPackageClosure(
  checks:StandardCheckLike[],
  operational:OperationalCheckLike[],
  providers:{youtube:{ready:boolean};whatsapp:{ready:boolean}},
  operationalError:string|null,
){
  const missingCore=checks.filter(x=>x.state==='MISSING').length;
  const packageConfigRequired=checks.filter(x=>x.state==='CONFIG_REQUIRED'&&!OPTIONAL_CHANNEL_KEYS.has(x.key)).length;
  const blockingSetup=operational.filter(x=>x.blocking&&x.state==='SETUP_REQUIRED').length;
  const optionalChannelSetup=Number(!providers.youtube.ready)+Number(!providers.whatsapp.ready);
  const standardPackageReady=missingCore===0&&packageConfigRequired===0&&blockingSetup===0&&!operationalError;
  const fullChannelReady=standardPackageReady&&optionalChannelSetup===0;
  return {
    missingCore,
    packageConfigRequired,
    blockingSetup,
    optionalChannelSetup,
    standardPackageReady,
    saleReady:standardPackageReady,
    fullChannelReady,
  };
}
