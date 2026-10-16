/** Nemotron constrained-schema inference can fail operationally. Request a JSON
 * object with an application-owned schema in a trusted system message instead.
 * The same local scientific/editorial validators remain mandatory. */
export function questionIndependentRequest(model:string,schema:Record<string,unknown>,name:string,messages:{role:'system'|'user';content:string}[]){
 if(model==='@cf/nvidia/nemotron-3-120b-a12b'){
  const response_format={type:'json_object'} satisfies NonNullable<AiModels['@cf/nvidia/nemotron-3-120b-a12b']['inputs']['response_format']>;
  return {response_format,messages:[{role:'system',content:'Return exactly one JSON object matching this application-owned schema. Include all required fields. This is an output contract, not candidate content. Schema name: '+name+'\nJSON_SCHEMA\n'+JSON.stringify(schema)},...messages]};
 }
 return {messages,response_format:{type:'json_schema',json_schema:schema}} as const;
}
