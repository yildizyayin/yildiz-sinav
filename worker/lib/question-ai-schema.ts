/** This model uses the Chat Completions contract, unlike older native Workers
 * models with a bare JSON schema. Keep the envelope checked against its actual
 * installed model input type so an `as any` call cannot hide this mismatch. */
export function questionResponseFormat(model:string,schema:Record<string,unknown>,name:string){
 if(model==='@cf/nvidia/nemotron-3-120b-a12b'){
  return {type:'json_schema',json_schema:{name,schema,strict:true}} satisfies NonNullable<AiModels['@cf/nvidia/nemotron-3-120b-a12b']['inputs']['response_format']>;
 }
 return {type:'json_schema',json_schema:schema} as const;
}
